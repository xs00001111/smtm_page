import { buildWhaleAlphaForTrade, classifyWhale, computeSmartSkewAlpha, computeInsiderAlpha, isTopOfRecentTrades } from '@smtm/data'
import { logger } from '../utils/logger'
import { botConfig } from '../config/bot'
import { persistAlphaEvent } from './alpha-store'
import { alphaAlerts } from './alpha-alerts'

export type AlphaKind = 'whale' | 'smart_skew' | 'insider'

export interface AlphaEvent {
  id: string
  ts: number
  kind: AlphaKind
  tokenId: string
  conditionId?: string
  marketName?: string
  marketSlug?: string
  marketUrl?: string
  wallet?: string
  alpha: number
  title: string
  summary: string
  data: any
}

class AlphaAggregatorImpl {
  private buffer: AlphaEvent[] = []
  private maxEvents = 200
  private schedulerStarted = false
  private pairs: Map<string, { yes: string; no: string; title?: string }> = new Map()
  private tokenToCond: Map<string, string> = new Map()
  private lastSkewEmit: Map<string, number> = new Map() // conditionId -> ts
  private lastScanTs = 0
  private skewIntervalMs = 30_000
  private lastWhaleEmit: Map<string, number> = new Map() // key: cond|token + wallet
  private lastInsiderEmit: Map<string, number> = new Map() // key: cond + wallet
  private lastEventByKey: Map<string, { ts: number; alpha: number }> = new Map()

  getLatest(limit = 1, tokenIds?: string[]): AlphaEvent[] {
    let src = this.buffer
    if (tokenIds && tokenIds.length > 0) {
      const set = new Set(tokenIds)
      src = src.filter((e) => set.has(e.tokenId))
    }
    return src.slice(-Math.max(1, Math.min(limit, this.maxEvents)))
  }

  push(event: AlphaEvent) {
    this.buffer.push(event)
    if (this.buffer.length > this.maxEvents) this.buffer.splice(0, this.buffer.length - this.maxEvents)
    // Best-effort persistence (optional)
    void persistAlphaEvent(event)
    // Notify opted-in users (best-effort). Confidence scaled 0..1 from alpha 0..100.
    try {
      const conf = Math.max(0, Math.min(1, (Number(event.alpha) || 0) / 100))
      void alphaAlerts().sendAlphaAlert({
        id: String(event.id),
        title: event.marketName ? `${event.title} — ${event.marketName}` : event.title,
        marketUrl: (event as any).marketUrl || undefined,
        confidence: conf,
        reason: event.summary || undefined,
        ts: event.ts || Date.now(),
      })
    } catch {}
  }

  async onTrade(payload: any, context?: { marketName?: string }) {
    try {
      const tokenId = payload.asset_id || payload.token_id
      const wallet = (payload.maker_address || payload.maker || '').toLowerCase()
      const price = parseFloat(payload.price || '0')
      const size = parseFloat(payload.size || payload.amount || '0')
      if (!tokenId || !Number.isFinite(price) || !Number.isFinite(size) || size <= 0) return

      const notionalPre = size * price
      logger.info({ assetId: tokenId, wallet, price, size, notional: Math.round(notionalPre) }, 'alpha:onTrade received')

      const alpha = await buildWhaleAlphaForTrade({ wallet, sizeShares: size, price, tokenId })
      const notional = size * price
      const isWhaleBase = classifyWhale(notional, alpha.whaleScore)
      const rel = await isTopOfRecentTrades(tokenId, notional, 10)
      const isWhale = isWhaleBase || rel.isTop
      logger.info({ assetId: tokenId, wallet, whaleScore: alpha.whaleScore, alpha: alpha.alpha, recommendation: alpha.recommendation, notional: Math.round(notional), isWhale, isWhaleBase, topRecent: rel }, 'alpha:onTrade computed')
      if (!isWhale) return

      // Try enrich with market mapping
      const condId = this.tokenToCond.get(tokenId)
      const pair = condId ? this.pairs.get(condId) : undefined
      // Cooldown/dedupe for whale by market/wallet
      const whaleKey = `${condId || tokenId}|${wallet}`
      const nowTs = Date.now()
      const lastTs = this.lastWhaleEmit.get(whaleKey) || 0
      if (nowTs - lastTs < botConfig.alphaCooldowns.whale * 1000) return
      const dedupeKey = `whale|${whaleKey}`
      const prev = this.lastEventByKey.get(dedupeKey)
      if (prev && (nowTs - prev.ts) < 30000 && Math.abs(prev.alpha - alpha.alpha) < 3) return

      const title = `Whale ${alpha.recommendation === 'copy' ? 'BUY/SELL' : ''} Alpha ${alpha.alpha}`
      const summary = `whaleScore ${alpha.whaleScore} • ${alpha.recommendation} • $${alpha.weightedNotionalUsd.toLocaleString()}`

      const event: AlphaEvent = {
        id: `${nowTs}-${tokenId}-${wallet}-${Math.round(alpha.alpha)}`,
        ts: nowTs,
        kind: 'whale',
        tokenId,
        conditionId: condId,
        marketName: pair?.title || context?.marketName,
        wallet,
        alpha: alpha.alpha,
        title,
        summary,
        data: {
          whaleScore: alpha.whaleScore,
          recommendation: alpha.recommendation,
          weightedNotionalUsd: alpha.weightedNotionalUsd,
          stats: alpha.stats,
        },
      }
      this.push(event)
      this.lastWhaleEmit.set(whaleKey, nowTs)
      this.lastEventByKey.set(dedupeKey, { ts: nowTs, alpha: alpha.alpha })
      logger.info({ conditionId: condId, assetId: tokenId, wallet, alpha: alpha.alpha, whaleScore: alpha.whaleScore, notional: Math.round(alpha.weightedNotionalUsd || notional) }, 'alpha:whale emitted')
    } catch (e) {
      logger.warn({ err: (e as any)?.message }, 'alpha-aggregator onTrade failed')
    }
  }

  registerMarketPair(conditionId: string, yesTokenId: string, noTokenId: string, title?: string) {
    if (!conditionId || !yesTokenId || !noTokenId) return
    this.pairs.set(conditionId, { yes: yesTokenId, no: noTokenId, title })
    this.tokenToCond.set(yesTokenId, conditionId)
    this.tokenToCond.set(noTokenId, conditionId)
    if (!this.schedulerStarted) this.start()
  }

  private start() {
    if (this.schedulerStarted) return
    this.schedulerStarted = true
    setInterval(() => this.tick().catch((e)=>logger.warn({ err: (e as any)?.message }, 'alpha-aggregator tick failed')), this.skewIntervalMs)
  }

  private async tick(): Promise<void> {
    const now = Date.now()
    // 1) Smart-skew per market pair
    for (const [condId, pair] of this.pairs.entries()) {
      try {
        const skew = await computeSmartSkewAlpha({ yesTokenId: pair.yes, noTokenId: pair.no, conditionId: condId }, { onLog: (m, ctx)=> logger.info({ ...ctx }, `alpha:skew ${m}`) })
        const last = this.lastSkewEmit.get(condId) || 0
        const cooldownMs = Math.max(30_000, botConfig.alphaCooldowns.skew * 1000)
        if (skew.trigger && now - last >= cooldownMs) {
          const title = pair.title || 'Market'
          const directionEmoji = skew.direction === 'YES' ? '✅' : '❌'
          const summary = `${directionEmoji} ${skew.direction} • Skew ${Math.round(skew.skew*100)}% • Pool $${skew.smartPoolUsd.toLocaleString()}`
          this.push({
            id: `${now}-skew-${condId}`,
            ts: now,
            kind: 'smart_skew',
            tokenId: pair.yes, // representative
            conditionId: condId,
            marketName: title,
            alpha: skew.alpha,
            title: `Smart-Skew Alpha ${skew.alpha}`,
            summary,
            data: skew,
          })
          this.lastSkewEmit.set(condId, now)
          logger.info({ conditionId: condId, yes: pair.yes, no: pair.no, skew: skew.skew, skewYes: skew.skewYes, smartPoolUsd: skew.smartPoolUsd, alpha: skew.alpha }, 'alpha:smart_skew emitted')
        } else {
          logger.debug ? logger.debug({ conditionId: condId, skew: skew.skew, smartPoolUsd: skew.smartPoolUsd, trigger: skew.trigger }, 'alpha:smart_skew computed (no emit)') : logger.info({ conditionId: condId, skew: skew.skew, smartPoolUsd: skew.smartPoolUsd, trigger: skew.trigger }, 'alpha:smart_skew computed (no emit)')
        }
      } catch (e) {
        // best-effort
      }
    }

    // 2) Insider: scan new whale events since last scan
    const since = this.lastScanTs || (now - 60_000)
    this.lastScanTs = now
    // Pull a reasonable batch and filter by ts
    const recent = (global as any).WhaleDetector
      ? []
      : []
    // Instead, reuse buffer: the WhaleDetector is in @smtm/data; we can import directly
    try {
      const { WhaleDetector } = await import('@smtm/data')
      const events = WhaleDetector.getEvents(1000)
      const fresh = events.filter(e => e.ts > since)
      for (const e of fresh) {
        const condId = this.tokenToCond.get(e.tokenId)
        if (!condId) continue
        const pair = this.pairs.get(condId)
        if (!pair) continue
        // Compute skew once
        let skewRes: any = null
        try { skewRes = await computeSmartSkewAlpha({ yesTokenId: pair.yes, noTokenId: pair.no, conditionId: condId }, { onLog: (m, ctx)=> logger.info({ ...ctx }, `alpha:skew ${m}`) }) } catch {}
        const cluster = {
          count: e.clusterCount || 1,
          durationMs: e.clusterDurationMs || 0,
          notionalUsd: e.notionalUsd || (e.price * e.sizeShares),
        }
        const insider = await computeInsiderAlpha({
          wallet: e.wallet,
          tradeNotionalUsd: cluster.notionalUsd,
          skewResult: skewRes || undefined,
          cluster,
        })
        logger.info({ conditionId: condId, tokenId: e.tokenId, wallet: e.wallet, clusterCount: cluster.count, clusterDurationMs: cluster.durationMs, clusterNotional: Math.round(cluster.notionalUsd), insiderScore: insider.insiderScore, trigger: insider.trigger }, 'alpha:insider computed')
        if (insider.trigger) {
          // Cooldown/dedupe per (market,wallet)
          const key = `${condId}|${e.wallet}`
          const prevTs = this.lastInsiderEmit.get(key) || 0
          if (now - prevTs < botConfig.alphaCooldowns.insider * 1000) continue
          const dedupeKey2 = `insider|${key}`
          const prev2 = this.lastEventByKey.get(dedupeKey2)
          if (prev2 && (now - prev2.ts) < 30000 && Math.abs(prev2.alpha - insider.insiderScore) < 3) continue
          const title = pair.title || 'Market'
          const summary = `Score ${insider.insiderScore} • Skew ${(skewRes?.skew ?? 0).toFixed(2)} • Cluster ${cluster.count} / ${(cluster.durationMs/1000).toFixed(1)}s • $${Math.round(cluster.notionalUsd).toLocaleString()}`
          this.push({
            id: `${e.id}-insider`,
            ts: now,
            kind: 'insider',
            tokenId: e.tokenId,
            conditionId: condId,
            marketName: title,
            wallet: e.wallet,
            alpha: insider.insiderScore,
            title: `Insider Alpha ${insider.insiderScore}`,
            summary,
            data: { insider, skew: skewRes, cluster },
          })
          this.lastInsiderEmit.set(key, now)
          this.lastEventByKey.set(dedupeKey2, { ts: now, alpha: insider.insiderScore })
          logger.info({ conditionId: condId, tokenId: e.tokenId, wallet: e.wallet, insiderScore: insider.insiderScore }, 'alpha:insider emitted')
        }
      }
    } catch {}
  }
}

export const AlphaAggregator = new AlphaAggregatorImpl()
