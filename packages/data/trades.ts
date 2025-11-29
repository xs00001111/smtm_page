export interface RawTrade {
  ts: number
  tokenId: string
  wallet: string | null
  price: number
  size: number
  notional: number
}

class TradeBufferImpl {
  private buf: RawTrade[] = []
  private max = 2000
  private bestByToken: Map<string, { ts: number; tokenId: string; price: number; size: number; notional: number; side?: string; marketId?: string }> = new Map()

  handleTrade(payload: any): void {
    const tokenId = payload.asset_id || payload.token_id
    const price = parseFloat(payload.price || '0')
    const size = parseFloat(payload.size || payload.amount || '0')
    const wallet = (payload.maker_address || payload.maker || null)
    if (!tokenId || !Number.isFinite(price) || !Number.isFinite(size) || size <= 0) return
    const ts = Date.now()
    const notional = price * size
    this.buf.push({ ts, tokenId, wallet, price, size, notional })
    if (this.buf.length > this.max) this.buf.splice(0, this.buf.length - this.max)
    // Update best cache
    const prev = this.bestByToken.get(tokenId)
    if (!prev || notional > prev.notional) this.bestByToken.set(tokenId, { ts, tokenId, price, size, notional })
  }

  getTrades(limit = 200, opts?: { sinceMs?: number; tokenIds?: string[]; wallet?: string }): RawTrade[] {
    const sinceMs = opts?.sinceMs ?? 60 * 60 * 1000
    const cutoff = Date.now() - sinceMs
    const tokens = opts?.tokenIds ? new Set(opts.tokenIds) : null
    const wallet = opts?.wallet?.toLowerCase()
    const filtered = this.buf.filter(t => t.ts >= cutoff && (!tokens || tokens.has(t.tokenId)) && (!wallet || (t.wallet || '').toLowerCase() === wallet))
    return filtered.slice(-Math.max(1, Math.min(limit, this.max)))
  }

  getBestForTokens(tokenIds?: string[], maxAgeMs = 15 * 60 * 1000): { tokenId: string; ts: number; price: number; size: number; notional: number } | null {
    const now = Date.now()
    let best: any = null
    const keys = tokenIds && tokenIds.length ? tokenIds : Array.from(this.bestByToken.keys())
    for (const k of keys) {
      const e = this.bestByToken.get(k)
      if (!e) continue
      if (now - e.ts > maxAgeMs) continue
      if (!best || e.notional > best.notional) best = e
    }
    return best
  }
}

export const TradeBuffer = new TradeBufferImpl()
