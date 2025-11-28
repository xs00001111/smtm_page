import { dataApi } from './clients/data-api'

export type WhaleEventType = 'large-bet' | 'top-pnl'

export interface WhaleEvent {
  id: string
  ts: number
  type: WhaleEventType
  tokenId: string
  marketId?: string
  outcome?: string
  wallet: string
  side: 'BUY' | 'SELL' | string
  price: number
  sizeShares: number
  notionalUsd: number
  clusterCount?: number
  clusterDurationMs?: number
  flags?: { largeBet?: boolean; topPnl?: boolean }
  source?: 'ws' | 'http'
  raw?: any
}

export interface WhaleDetectorOptions {
  largeBetThresholdUsd?: number
  clusterWindowMs?: number
  maxEvents?: number
  leaderboardSize?: number
  leaderboardRefreshMs?: number
}

type PendingClusterKey = string // wallet|tokenId

/**
 * Lightweight in-memory whale detector and store.
 * - Clusters fills within a short window to form a single bet
 * - Emits WhaleEvents for large bets and for watchlisted (top-PnL) wallets
 * - Maintains a ring buffer of recent events for API consumption
 */
class WhaleDetectorImpl {
  private opts: Required<WhaleDetectorOptions>
  private events: WhaleEvent[] = []
  private byToken: Map<string, WhaleEvent[]> = new Map()
  private byWallet: Map<string, WhaleEvent[]> = new Map()
  private watchlist: Set<string> = new Set()
  private pending: Map<PendingClusterKey, { ts: number; firstTs: number; count: number; notional: number; price: number; size: number; side: string; raw: any }>()

  private leaderboardTimer: any = null

  constructor(options?: WhaleDetectorOptions) {
    this.opts = {
      largeBetThresholdUsd: options?.largeBetThresholdUsd ?? 10_000,
      clusterWindowMs: options?.clusterWindowMs ?? 1200,
      maxEvents: options?.maxEvents ?? 1000,
      leaderboardSize: options?.leaderboardSize ?? 200,
      leaderboardRefreshMs: options?.leaderboardRefreshMs ?? 10 * 60 * 1000,
    }
    this.pending = new Map()
    this.startLeaderboardRefresh()
  }

  private startLeaderboardRefresh() {
    // Background refresh of top-PnL wallets (best-effort, public endpoints)
    const refresh = async () => {
      try {
        const list = await dataApi.getLeaderboard({ limit: this.opts.leaderboardSize })
        const next = new Set<string>()
        for (const e of list || []) {
          const addr = (e.user_id || '').toLowerCase()
          if (addr) next.add(addr)
        }
        if (next.size > 0) this.watchlist = next
      } catch (e) {
        // swallow; keep prior watchlist
      }
    }
    refresh().catch(() => {})
    this.leaderboardTimer = setInterval(() => refresh().catch(() => {}), this.opts.leaderboardRefreshMs)
  }

  stop() {
    if (this.leaderboardTimer) clearInterval(this.leaderboardTimer)
  }

  getWatchlist(): string[] { return Array.from(this.watchlist) }

  getEvents(limit = 50, tokenId?: string, wallet?: string): WhaleEvent[] {
    const src = tokenId ? (this.byToken.get(tokenId) || []) : wallet ? (this.byWallet.get(wallet.toLowerCase()) || []) : this.events
    return src.slice(-Math.max(1, Math.min(limit, this.opts.maxEvents)))
  }

  /**
   * Feed a trade message from the Polymarket WebSocket (activity:trades)
   * Expected payload fields: asset_id|token_id, price, size|amount, side, maker_address|maker
   */
  handleTradeMessage(payload: any): WhaleEvent | null {
    const tokenId = payload.asset_id || payload.token_id
    const price = parseFloat(payload.price || '0')
    const size = parseFloat(payload.size || payload.amount || '0')
    const side = (payload.side || '').toString().toUpperCase()
    const wallet = ((payload.maker_address || payload.maker || '') as string).toLowerCase()
    if (!tokenId || !Number.isFinite(price) || !Number.isFinite(size) || size <= 0) return null
    const notional = price * size
    const now = Date.now()

    // Cluster short bursts per wallet+tokenId
    const key: PendingClusterKey = `${wallet}|${tokenId}`
    const p = this.pending.get(key)
    if (p && now - p.ts <= this.opts.clusterWindowMs) {
      p.ts = now
      p.notional += notional
      p.size += size
      p.price = price // overwrite with latest print
      p.side = side || p.side
      p.count += 1
      p.raw = payload
    } else {
      this.pending.set(key, { ts: now, firstTs: now, count: 1, notional, size, price, side, raw: payload })
      // schedule flush if no more fills arrive
      setTimeout(() => this.flushCluster(key), this.opts.clusterWindowMs + 10)
    }
    // Early emit for very large single print
    if (notional >= this.opts.largeBetThresholdUsd) {
      return this.emitEvent({
        ts: now,
        type: this.watchlist.has(wallet) ? 'top-pnl' : 'large-bet',
        tokenId,
        wallet,
        side: (side as any) || 'BUY',
        price,
        sizeShares: size,
        notionalUsd: notional,
        clusterCount: 1,
        clusterDurationMs: 0,
        flags: { largeBet: true, topPnl: this.watchlist.has(wallet) },
        source: 'ws',
        raw: payload,
      })
    }
    return null
  }

  private flushCluster(key: PendingClusterKey): WhaleEvent | null {
    const p = this.pending.get(key)
    if (!p) return null
    // Do not flush if a newer cluster replaced it
    if (Date.now() - p.ts <= this.opts.clusterWindowMs) return null
    this.pending.delete(key)
    const [wallet, tokenId] = key.split('|')
    const type: WhaleEventType = this.watchlist.has(wallet) ? 'top-pnl' : (p.notional >= this.opts.largeBetThresholdUsd ? 'large-bet' : 'large-bet')
    if (p.notional < this.opts.largeBetThresholdUsd && !this.watchlist.has(wallet)) return null
    return this.emitEvent({
      ts: p.ts,
      type,
      tokenId,
      wallet,
      side: (p.side as any) || 'BUY',
      price: p.price,
      sizeShares: p.size,
      notionalUsd: p.notional,
      clusterCount: p.count,
      clusterDurationMs: Math.max(0, p.ts - p.firstTs),
      flags: { largeBet: p.notional >= this.opts.largeBetThresholdUsd, topPnl: this.watchlist.has(wallet) },
      source: 'ws',
      raw: p.raw,
    })
  }

  private emitEvent(partial: Omit<WhaleEvent, 'id'>): WhaleEvent {
    const id = `${partial.ts}-${partial.tokenId}-${partial.wallet}-${Math.round(partial.notionalUsd)}`
    const event: WhaleEvent = { id, ...partial }
    this.events.push(event)
    if (this.events.length > this.opts.maxEvents) this.events.splice(0, this.events.length - this.opts.maxEvents)
    // by token
    const a = this.byToken.get(event.tokenId) || []
    a.push(event)
    if (a.length > this.opts.maxEvents) a.splice(0, a.length - this.opts.maxEvents)
    this.byToken.set(event.tokenId, a)
    // by wallet
    const wkey = event.wallet.toLowerCase()
    const b = this.byWallet.get(wkey) || []
    b.push(event)
    if (b.length > this.opts.maxEvents) b.splice(0, b.length - this.opts.maxEvents)
    this.byWallet.set(wkey, b)
    return event
  }
}

// Singleton instance for app-wide use
export const WhaleDetector = new WhaleDetectorImpl()
