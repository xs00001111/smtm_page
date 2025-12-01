import { dataApi } from './clients/data-api'
import { clobApi } from './clients/clob-api'
import { gammaApi } from './clients/gamma-api'
import { WhaleDetector, WhaleEvent } from './whales'
import { TradeBuffer } from './trades'

export type Recommendation = 'copy' | 'counter' | 'neutral'

export interface WhaleStatsOptions {
  windowMs?: number // time window for stats (default 6h)
  maxEvents?: number // cap events to scan (default 500)
}

export interface WhaleStats {
  avgBetUsd: number
  tradesPerHour: number
  winRate: number // 0..100
  sampleCount: number
  windowHours: number
}

export interface WhaleScoreWeights {
  size: number // default 0.4
  freq: number // default 0.2
  win: number // default 0.4
}

export interface WhaleScoreConfig {
  // Scaling baselines
  sizeBaselineUsd?: number // avg bet that maps near ~80 score (default 10k)
  maxFreqPerHour?: number // frequency that maps to 100 (default 10/h)
  weights?: WhaleScoreWeights
}

export interface WhaleAlphaConfig {
  hardThresholdUsd?: number // large trade threshold (default 10000)
}

export interface WhaleAlphaResult {
  whaleScore: number // 0..100
  alpha: number // 0..100
  recommendation: Recommendation
  weightedSizeShares: number
  weightedNotionalUsd: number
  thresholds: { hardThresholdUsd: number; whaleScoreCutoff: number }
  stats: WhaleStats
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export async function getWalletWhaleStats(wallet: string, opts?: WhaleStatsOptions): Promise<WhaleStats> {
  const windowMs = opts?.windowMs ?? 6 * 60 * 60 * 1000 // 6h
  const maxEvents = opts?.maxEvents ?? 500
  const recentTrades = TradeBuffer.getTrades(maxEvents, { sinceMs: windowMs, wallet })
  const sampleCount = recentTrades.length
  const windowHours = windowMs / 3600000

  const totalNotional = recentTrades.reduce((acc, t) => acc + (t.notional || 0), 0)
  const avgBetUsd = sampleCount > 0 ? totalNotional / sampleCount : 0
  const tradesPerHour = sampleCount / Math.max(0.25, windowHours)

  // Approximate win rate from public Data API (closed positions)
  let winRate = 0
  try {
    const wr = await dataApi.getUserWinRate(wallet)
    winRate = clamp(wr.winRate || 0, 0, 100)
  } catch {
    winRate = 0
  }

  return { avgBetUsd, tradesPerHour, winRate, sampleCount, windowHours }
}

export function computeWhaleScore(stats: WhaleStats, cfg?: WhaleScoreConfig): number {
  const sizeBaselineUsd = cfg?.sizeBaselineUsd ?? 10_000
  const maxFreqPerHour = cfg?.maxFreqPerHour ?? 10
  const weights = cfg?.weights ?? { size: 0.4, freq: 0.2, win: 0.4 }

  // Map features to 0..100
  const sizeScore = clamp((stats.avgBetUsd / sizeBaselineUsd) * 80, 0, 100) // 10k -> 80, 25k+ -> ~100
  const freqScore = clamp((stats.tradesPerHour / maxFreqPerHour) * 100, 0, 100) // 10/h -> 100
  const winScore = clamp(stats.winRate, 0, 100)

  const whaleScore = weights.size * sizeScore + weights.freq * freqScore + weights.win * winScore
  return clamp(Math.round(whaleScore), 0, 100)
}

export function computeWhaleQualityWeight(whaleScore: number): number {
  // Map 0..100 -> 0.25..1.5, centered near 1.0 at score ~75
  const w = 0.25 + (clamp(whaleScore, 0, 100) / 100) * 1.25
  return clamp(parseFloat(w.toFixed(2)), 0.25, 1.5)
}

export function classifyWhale(tradeNotionalUsd: number, whaleScore: number, cfg?: WhaleAlphaConfig): boolean {
  const hard = cfg?.hardThresholdUsd ?? 10_000
  return whaleScore >= 65 || tradeNotionalUsd >= hard
}

export function computeAlphaFromWhaleScore(whaleScore: number): { alpha: number; recommendation: Recommendation } {
  // v0.5: alpha = 60 + (whale_score - 65) * 0.7, bound 0–100
  const alpha = clamp(60 + (whaleScore - 65) * 0.7, 0, 100)
  let recommendation: Recommendation = 'neutral'
  if (whaleScore >= 75) recommendation = 'copy'
  else if (whaleScore <= 50) recommendation = 'counter'
  return { alpha: Math.round(alpha), recommendation }
}

export async function buildWhaleAlphaForTrade(trade: { wallet: string; sizeShares: number; price: number; tokenId: string; ts?: number }, cfg?: WhaleAlphaConfig & WhaleScoreConfig & WhaleStatsOptions): Promise<WhaleAlphaResult> {
  const stats = await getWalletWhaleStats(trade.wallet, cfg)
  const whaleScore = computeWhaleScore(stats, cfg)
  const notionalUsd = trade.sizeShares * trade.price
  const isWhale = classifyWhale(notionalUsd, whaleScore, cfg)
  const qualityWeight = computeWhaleQualityWeight(whaleScore)
  const weightedSizeShares = parseFloat((trade.sizeShares * qualityWeight).toFixed(4))
  const weightedNotionalUsd = parseFloat((notionalUsd * qualityWeight).toFixed(2))
  const { alpha, recommendation } = computeAlphaFromWhaleScore(whaleScore)

  return {
    whaleScore,
    alpha,
    recommendation,
    weightedSizeShares: isWhale ? weightedSizeShares : trade.sizeShares,
    weightedNotionalUsd: isWhale ? weightedNotionalUsd : notionalUsd,
    thresholds: { hardThresholdUsd: cfg?.hardThresholdUsd ?? 10_000, whaleScoreCutoff: 65 },
    stats,
  }
}

// Relative-top detector: is current trade the largest among recent N trades?
export async function isTopOfRecentTrades(tokenId: string, notional: number, recentCount = 10): Promise<{ isTop: boolean; rank: number; sample: number; maxNotional: number; median: number }> {
  const recent = TradeBuffer.getTrades(100, { tokenIds: [tokenId], sinceMs: 60 * 60 * 1000 })
  let list = recent.filter(t => t.tokenId === tokenId).slice(-recentCount)
  // Do not call network here; rely on in-memory TradeBuffer only
  const arr = list.map(t => t.notional).filter(n => Number.isFinite(n))
  if (arr.length === 0) return { isTop: true, rank: 1, sample: 0, maxNotional: 0, median: 0 }
  const sorted = [...arr].sort((a,b)=>b-a)
  const rank = 1 + sorted.findIndex(v => notional >= v)
  const maxNotional = sorted[0] || 0
  const mid = Math.floor(sorted.length/2)
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2
  return { isTop: rank === 1, rank: rank === 0 ? 1 : rank, sample: arr.length, maxNotional, median }
}

// Smart Money Skew ("sizing screw")
export interface SmartSkewConfig {
  whaleScoreThreshold?: number // default 65
  windowMs?: number // default 30m
  minSmartPoolUsd?: number // default 3000
  maxWallets?: number // safety cap for per-wallet scoring (default 50)
}

export interface SmartSkewResult {
  direction: 'YES' | 'NO'
  skewYes: number // 0..1
  skew: number // max(skewYes, 1 - skewYes)
  alpha: number // 0..100
  trigger: boolean
  smartPoolUsd: number
  volumes: {
    yesWhale: number
    noWhale: number
    yesRetail: number
    noRetail: number
  }
  meta: {
    whaleScoreThreshold: number
    windowMs: number
    walletsEvaluated: number
  }
}

export async function computeSmartSkewAlpha(
  params: { yesTokenId: string; noTokenId: string },
  cfg?: (SmartSkewConfig & WhaleScoreConfig & WhaleStatsOptions) & { onLog?: (msg: string, ctx?: any) => void }
): Promise<SmartSkewResult> {
  const log = cfg?.onLog || (() => {})
  const whaleScoreThreshold = cfg?.whaleScoreThreshold ?? 65
  const windowMs = cfg?.windowMs ?? 30 * 60 * 1000
  const minSmartPoolUsd = cfg?.minSmartPoolUsd ?? 3000
  const maxWallets = cfg?.maxWallets ?? 50
  log('skew.start', { yes: params.yesTokenId, no: params.noTokenId, windowMs, whaleScoreThreshold, minSmartPoolUsd, maxWallets })

  // Gather recent raw trades for both tokens
  const maxScan = 2000
  const all = TradeBuffer.getTrades(maxScan, { sinceMs: windowMs, tokenIds: [params.yesTokenId, params.noTokenId] })
  log('skew.trades_window', { count: all.length })

  // Identify unique wallets in window (cap to reduce API calls)
  const wallets = Array.from(new Set(all.map((e) => (e.wallet || '').toLowerCase()).filter(Boolean))).slice(0, maxWallets)
  log('skew.wallets_sample', { count: wallets.length, sample: wallets.slice(0, 10) })

  // Score wallets
  const walletScores = new Map<string, number>()
  for (const w of wallets) {
    try {
      const stats = await getWalletWhaleStats(w, cfg)
      walletScores.set(w, computeWhaleScore(stats, cfg))
    } catch {
      walletScores.set(w, 0)
    }
  }
  log('skew.wallet_scores', { evaluated: walletScores.size })

  // Aggregate volumes by whale vs retail
  let yesWhale = 0, noWhale = 0, yesRetail = 0, noRetail = 0
  for (const e of all) {
    const score = e.wallet ? (walletScores.get(e.wallet.toLowerCase()) || 0) : 0
    const isWhale = score >= whaleScoreThreshold
    const v = e.notional
    if (e.tokenId === params.yesTokenId) {
      if (isWhale) yesWhale += v; else yesRetail += v
    } else if (e.tokenId === params.noTokenId) {
      if (isWhale) noWhale += v; else noRetail += v
    }
  }
  log('skew.volumes', { yesWhale, noWhale, yesRetail, noRetail })

  const smartPoolUsd = yesWhale + noWhale
  const denom = yesWhale + noWhale
  const skewYes = denom > 0 ? yesWhale / denom : 0.5
  const skew = Math.max(skewYes, 1 - skewYes)
  const direction: 'YES' | 'NO' = skewYes >= 0.5 ? 'YES' : 'NO'

  // Alpha formula: alpha = 60 + (skew - 0.75) * 180; bound 0..100
  const rawAlpha = 60 + (skew - 0.75) * 180
  const alpha = clamp(Math.round(rawAlpha), 0, 100)
  const trigger = skew >= 0.75 && smartPoolUsd >= minSmartPoolUsd
  log('skew.result', { direction, skew, skewYes, smartPoolUsd, trigger, alpha })

  return {
    direction,
    skewYes: parseFloat(skewYes.toFixed(4)),
    skew: parseFloat(skew.toFixed(4)),
    alpha,
    trigger,
    smartPoolUsd: parseFloat(smartPoolUsd.toFixed(2)),
    volumes: {
      yesWhale: parseFloat(yesWhale.toFixed(2)),
      noWhale: parseFloat(noWhale.toFixed(2)),
      yesRetail: parseFloat(yesRetail.toFixed(2)),
      noRetail: parseFloat(noRetail.toFixed(2)),
    },
    meta: {
      whaleScoreThreshold,
      windowMs,
      walletsEvaluated: wallets.length,
    },
  }
}

// Fallback: query recent trades from CLOB API to find big orders (no wallet)
export async function findRecentBigOrders(params?: {
  tokenIds?: string[]
  minNotionalUsd?: number
  withinMs?: number
  perTokenLimit?: number
  onLog?: (msg: string, ctx?: any) => void
}): Promise<Array<{ ts: number; tokenId: string; marketId?: string; side: 'BUY'|'SELL'|string; price: number; size: number; notional: number }>> {
  const minNotionalUsd = params?.minNotionalUsd ?? 10_000
  const withinMs = params?.withinMs ?? 24 * 60 * 60 * 1000 // 24 hours (low traffic default)
  const perTokenLimit = params?.perTokenLimit ?? 50
  const log = params?.onLog || (() => {})
  let tokenIds = params?.tokenIds
  const tokenToCond = new Map<string, string>()
  if (!tokenIds || tokenIds.length === 0) {
    try {
      const trending = await gammaApi.getTrendingMarkets(8)
      tokenIds = []
      for (const m of trending) for (const t of (m.tokens || [])) if (t?.token_id) { tokenIds.push(t.token_id); if (m?.condition_id) tokenToCond.set(t.token_id, m.condition_id) }
    } catch {}
  }
  tokenIds = tokenIds || []
  const cutoff = Date.now() - withinMs
  log('big_orders.start', { minNotionalUsd, withinMs, cutoff, perTokenLimit, tokenIdsCount: tokenIds.length, sample: tokenIds.slice(0, 20) })
  const results: Array<{ ts: number; tokenId: string; marketId?: string; side: 'BUY'|'SELL'|string; price: number; size: number; notional: number }> = []
  for (const tokenId of tokenIds) {
    try {
      const cond = tokenToCond.get(tokenId)
      const trades = cond ? await dataApi.getTrades({ market: [cond], limit: perTokenLimit }) : []
      log('big_orders.trades', { tokenId, total: (trades || []).length })
      if ((trades || []).length === 0) {
        try {
          const clobFallback = await clobApi.getTrades(tokenId, Math.min(50, perTokenLimit))
          log('big_orders.trades_fallback_clob', { tokenId, total: clobFallback.length })
        } catch {}
      }
      for (const tr of trades || []) {
        const assetAny = (tr as any).asset_id || (tr as any).asset
        if (assetAny && String(assetAny) !== String(tokenId)) continue
        const tsRaw: any = (tr as any).timestamp || (tr as any).match_time || (tr as any).last_update
        const ts = typeof tsRaw === 'number' ? tsRaw : Date.parse(String(tsRaw))
        if (!Number.isFinite(ts) || ts < cutoff) continue
        const price = parseFloat(String(tr.price || '0'))
        const size = parseFloat(String(tr.size || '0'))
        const notional = price * size
        const skip = !Number.isFinite(notional) || notional < minNotionalUsd
        log('big_orders.trade', { tokenId, ts, price, size, notional: Math.round(notional), keep: !skip })
        if (skip) continue
        results.push({ ts, tokenId, marketId: (tr as any).market, side: (tr as any).side || '', price, size, notional })
      }
    } catch {}
  }
  results.sort((a,b)=>b.ts - a.ts)
  log('big_orders.result', { count: results.length, top: results[0] ? Math.round(results[0].notional) : 0 })
  return results
}

// Live alpha scan across an expanded token universe (trending + top active)
export async function searchLiveAlpha(params?: {
  minNotionalUsd?: number
  withinMs?: number
  perTokenLimit?: number
  maxMarkets?: number
  onLog?: (msg: string, ctx?: any) => void
}): Promise<{ ts: number; tokenId: string; marketId?: string; side: string; price: number; size: number; notional: number } | null> {
  const minNotionalUsd = params?.minNotionalUsd ?? 2000
  const withinMs = params?.withinMs ?? 24 * 60 * 60 * 1000 // 24 hours (low traffic default)
  const perTokenLimit = params?.perTokenLimit ?? 25
  const maxMarkets = params?.maxMarkets ?? 60
  const cutoff = Date.now() - withinMs
  const log = params?.onLog || (() => {})
  try {
    log('start', { minNotionalUsd, withinMs, cutoff, perTokenLimit, maxMarkets })
    const trending = await gammaApi.getTrendingMarkets(20).catch((e)=>{ log('trending_error', { err: String(e?.message || e) }); return [] as any[] })
    const active = await gammaApi.getActiveMarkets(maxMarkets, 'volume').catch((e)=>{ log('active_error', { err: String(e?.message || e) }); return [] as any[] })
    log('markets', { trending: trending.length, active: active.length })
    const tokenIds: string[] = []
    const seen = new Set<string>()
    const tokenToCond = new Map<string, string>()
    const addTokens = (mks: any[]) => {
      for (const m of mks || []) {
        for (const t of (m.tokens || [])) {
          if (t?.token_id && !seen.has(t.token_id)) { seen.add(t.token_id); tokenIds.push(t.token_id); if (m?.condition_id) tokenToCond.set(t.token_id, m.condition_id) }
        }
      }
    }
    addTokens(trending)
    addTokens(active)
    log('tokens', { count: tokenIds.length, sample: tokenIds.slice(0, 25) })
    let best: any = null
    for (const tokenId of tokenIds) {
      try {
        const cond = tokenToCond.get(tokenId)
        const trades = cond ? await dataApi.getTrades({ market: [cond], limit: perTokenLimit }) : []
        log('trades', { tokenId, total: (trades || []).length })
        if (process.env.ALPHA_LOG_TRADES === 'true') {
          for (const t of (trades || []).slice(0, 5)) {
            try {
              log('trade.detail', {
                cond,
                asset: (t as any).asset_id || (t as any).asset,
                price: (t as any).price,
                size: (t as any).size,
                ts: (t as any).timestamp || (t as any).match_time || (t as any).last_update,
              })
            } catch {}
          }
        }
        let filtered = 0
        let topN = 0
        for (const tr of trades || []) {
          const assetAny2 = (tr as any).asset_id || (tr as any).asset
          if (assetAny2 && String(assetAny2) !== String(tokenId)) continue
          const tsRaw: any = (tr as any).timestamp || (tr as any).match_time || (tr as any).last_update
          const ts = typeof tsRaw === 'number' ? tsRaw : Date.parse(String(tsRaw))
          if (!Number.isFinite(ts) || ts < cutoff) continue
          const price = parseFloat(String(tr.price || '0'))
          const size = parseFloat(String(tr.size || '0'))
          const notional = price * size
          if (!Number.isFinite(notional) || notional < minNotionalUsd) continue
          filtered++
          if (notional > topN) topN = notional
          if (!best || notional > best.notional) best = { ts, tokenId, marketId: (tr as any).market, side: (tr as any).side || '', price, size, notional }
        }
        log('trades_filtered', { tokenId, filtered, topNotional: Math.round(topN) })
      } catch {}
    }
    if (best) log('result', { tokenId: best.tokenId, notional: Math.round(best.notional), price: best.price, ts: best.ts })
    else log('empty')
    return best
  } catch {
    log('error')
    return null
  }
}

// Progressive, rate-limit-friendly live scan (sequential with delays and max duration)
export async function progressiveLiveScan(params?: {
  minNotionalUsd?: number
  withinMs?: number
  perTokenLimit?: number
  maxMarkets?: number
  delayMs?: number
  maxDurationMs?: number
  maxErrors?: number
  onLog?: (msg: string, ctx?: any) => void
}): Promise<{ ts: number; tokenId: string; marketId?: string; side: string; price: number; size: number; notional: number } | null> {
  const minNotionalUsd = params?.minNotionalUsd ?? 2000
  const withinMs = params?.withinMs ?? 24 * 60 * 60 * 1000
  const perTokenLimit = params?.perTokenLimit ?? 200
  const maxMarkets = params?.maxMarkets ?? 200
  const delayMs = params?.delayMs ?? 250
  const maxDurationMs = params?.maxDurationMs ?? 5 * 60 * 1000
  const maxErrors = params?.maxErrors ?? 10
  const cutoff = Date.now() - withinMs
  const log = params?.onLog || (() => {})
  const t0 = Date.now()
  log('progressive.start', { minNotionalUsd, withinMs, perTokenLimit, maxMarkets, delayMs, maxDurationMs, maxErrors })
  try {
    const trending = await gammaApi.getTrendingMarkets(Math.min(40, maxMarkets)).catch(()=>[] as any[])
    const active = await gammaApi.getActiveMarkets(maxMarkets, 'volume').catch(()=>[] as any[])
    log('progressive.markets_fetched', { trending: trending.length, active: active.length })
    const tokenIds: string[] = []
    const seen = new Set<string>()
    const addTokens = (arr:any[]) => {
      for (const m of arr) {
        // Try tokens array first
        for (const t of (m.tokens || [])) {
          const id = t?.token_id || t?.tokenId
          if (id && !seen.has(id)) { seen.add(id); tokenIds.push(id) }
        }
        // Fallback: parse clobTokenIds string if available
        if (!m.tokens && m.clobTokenIds) {
          try {
            const ids = JSON.parse(m.clobTokenIds)
            for (const id of ids || []) {
              if (id && !seen.has(id)) { seen.add(id); tokenIds.push(id) }
            }
          } catch {}
        }
      }
    }
    addTokens(trending); addTokens(active)
    log('progressive.tokens', { count: tokenIds.length, sample: tokenIds.slice(0,25), trendingSample: trending.slice(0,2), activeSample: active.slice(0,2) })
    // Aggressive token enrichment: fetch Gamma details for each condition, then fallback to CLOB markets
    const conds: string[] = []
    const addCond = (arr:any[]) => { for (const m of arr) if (m?.condition_id || m?.conditionId) conds.push(m.condition_id || m.conditionId) }
    addCond(trending); addCond(active)
    const maxConds = Math.min(200, conds.length)
    log('progressive.resolve_tokens_start', { conditions: maxConds, condsSample: conds.slice(0, 5) })
    // If we already have tokens from initial extraction, skip expensive per-condition resolution
    // unless we need more coverage
    const shouldResolve = tokenIds.length < 50 && maxConds > 0
    log('progressive.should_resolve', { shouldResolve, currentTokens: tokenIds.length, conditions: maxConds })
    if (shouldResolve) {
      for (let i=0; i<Math.min(maxConds, 50); i++) {
        const cid = conds[i]
        try {
          const mkt = await gammaApi.getMarket(cid)
          let added = 0
          for (const t of (mkt?.tokens || [])) {
            const id = (t as any)?.token_id
            if (id && !seen.has(id)) { seen.add(id); tokenIds.push(id); added++ }
          }
          log('progressive.resolve_condition', { idx: i+1, conditionId: cid, added })
        } catch (e) {
          log('progressive.resolve_condition_error', { conditionId: cid, err: String((e as any)?.message || e) })
        }
      }
    }
    // Fallback to CLOB markets if still empty
    if (tokenIds.length === 0 && conds.length > 0) {
      log('progressive.fallback_clob', { conditionsToTry: Math.min(50, conds.length) })
      for (let i=0; i<Math.min(50, conds.length); i++) {
        const cid = conds[i]
        try {
          const mkt: any = await (await import('./clients/clob-api')).clobApi.getMarket(cid)
          let added = 0
          for (const t of (mkt?.tokens || [])) {
            const id = t?.token_id
            if (id && !seen.has(id)) { seen.add(id); tokenIds.push(id); added++ }
          }
          log('progressive.resolve_clob_market', { idx: i+1, conditionId: cid, added })
          if (tokenIds.length >= 20) break // Stop once we have enough
        } catch (e) {
          log('progressive.resolve_clob_error', { conditionId: cid, err: String((e as any)?.message || e) })
        }
      }
    }
    log('progressive.tokens_after_resolve', { count: tokenIds.length, sample: tokenIds.slice(0,25) })
    // Last resort: if we have NO tokens but DO have conditions, aggressively fetch from CLOB
    if (tokenIds.length === 0 && conds.length > 0) {
      log('progressive.last_resort_clob', { trying: Math.min(20, conds.length) })
      for (let i = 0; i < Math.min(20, conds.length); i++) {
        try {
          const mkt: any = await (await import('./clients/clob-api')).clobApi.getMarket(conds[i])
          if (mkt?.tokens) {
            for (const t of mkt.tokens) {
              const id = t?.token_id
              if (id && !seen.has(id)) {
                seen.add(id)
                tokenIds.push(id)
              }
            }
            if (tokenIds.length > 0) {
              log('progressive.last_resort_success', { conditionId: conds[i], tokensFound: tokenIds.length })
              break
            }
          }
        } catch (e) {
          // Silent fail, try next
        }
      }
    }
    if (tokenIds.length === 0) {
      log('progressive.no_tokens', { trendingCount: trending.length, activeCount: active.length, condsCount: conds.length })
      log('progressive.result_empty', { reason: 'no_tokens', elapsedMs: Date.now()-t0 })
      return null
    }
    log('progressive.final_token_count', { count: tokenIds.length, sample: tokenIds.slice(0, 10) })
    let best: any = null
    let errorCount = 0
    const tokenToCondProg = new Map<string, string>()
    // Build condition mapping from markets we fetched
    for (const m of [...trending, ...active] as any[]) {
      for (const t of (m?.tokens || [])) if (t?.token_id && m?.condition_id) tokenToCondProg.set(t.token_id, m.condition_id)
    }
    for (let i=0;i<tokenIds.length;i++) {
      const tokenId = tokenIds[i]
      if (Date.now() - t0 > maxDurationMs) { log('progressive.timeout', { scanned: i, elapsedMs: Date.now()-t0 }); break }
      try {
        const cond = tokenToCondProg.get(tokenId)
        const trades = cond ? await dataApi.getTrades({ market: [cond], limit: perTokenLimit }) : []
        log('progressive.trades', { idx: i+1, total: tokenIds.length, tokenId, totalTrades: (trades||[]).length })
        if ((trades || []).length === 0) {
          try {
            const clobFallback = await clobApi.getTrades(tokenId, Math.min(50, perTokenLimit))
            log('progressive.trades_fallback_clob', { tokenId, total: clobFallback.length })
          } catch {}
        }
        for (const tr of trades || []) {
          const assetAny = (tr as any).asset_id || (tr as any).asset
          if (assetAny && String(assetAny) !== String(tokenId)) continue
          const tsRaw: any = (tr as any).timestamp || (tr as any).match_time || (tr as any).last_update
          const ts = typeof tsRaw === 'number' ? tsRaw : Date.parse(String(tsRaw))
          if (!Number.isFinite(ts) || ts < cutoff) continue
          const price = parseFloat(String(tr.price || '0'))
          const size = parseFloat(String(tr.size || '0'))
          const notional = price * size
          const keep = Number.isFinite(notional) && notional >= minNotionalUsd
          log('progressive.trade', { tokenId, ts, price, size, notional: Math.round(notional), keep })
          if (!keep) continue
          if (!best || notional > best.notional) {
            best = { ts, tokenId, marketId: (tr as any).market, side: (tr as any).side || '', price, size, notional }
            log('progressive.best_update', { tokenId, notional: Math.round(notional) })
          }
        }
      } catch (e) {
        errorCount += 1
        log('progressive.error', { tokenId, err: String((e as any)?.message || e), errorCount })
        if (errorCount >= maxErrors) {
          log('progressive.too_many_errors', { errorCount, limit: maxErrors })
          break
        }
      }
      if (best) break
      if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs))
    }
    if (best) log('progressive.result', { tokenId: best.tokenId, notional: Math.round(best.notional) })
    else log('progressive.result_empty', { elapsedMs: Date.now()-t0 })
    return best
  } catch (e) {
    log('progressive.fail', { err: String((e as any)?.message || e) })
    return null
  }
}

// Insider Alpha (v0.5)
export interface ClusterMetrics {
  count: number // number of fills in cluster
  durationMs: number // time from first to last fill
  notionalUsd: number // total notional across cluster
}

export interface TimingContext {
  // Heuristics; if none provided, factor defaults to neutral 50
  isEarlySession?: boolean // e.g., shortly after market opens/becomes active
  isPreEvent?: boolean // e.g., before a scheduled catalyst (placeholder)
  isUnusualHour?: boolean // low activity hour proxy
  scoreOverride?: number // 0..100 to directly set timing factor
}

export interface InsiderConfig {
  whaleScoreThreshold?: number // default 65 (for context only)
  clusterTightMs?: number // <= this is considered tight (default 2000ms)
  clusterLargeUsd?: number // >= this is considered large (default 20000)
}

export interface InsiderResult {
  insiderScore: number // 0..100
  trigger: boolean // insiderScore >= 75
  breakdown: {
    whaleFactor: number
    skewFactor: number
    clusterFactor: number
    timingFactor: number
  }
  meta: {
    whaleScore: number
    skew: number
    cluster: ClusterMetrics
    timing?: TimingContext
    weights: { whale: number; skew: number; cluster: number; timing: number }
    thresholds: { insiderTrigger: number; whaleScoreThreshold: number }
  }
}

export async function computeInsiderAlpha(params: {
  wallet: string
  tradeNotionalUsd: number
  skew?: number // 0.5..1.0; strength of smart skew
  skewResult?: SmartSkewResult // optional; if provided, uses skewResult.skew
  cluster: ClusterMetrics
  timing?: TimingContext
}, cfg?: InsiderConfig & WhaleScoreConfig & WhaleStatsOptions): Promise<InsiderResult> {
  const insiderTrigger = 75
  const whaleScoreThreshold = cfg?.whaleScoreThreshold ?? 65
  const clusterTightMs = cfg?.clusterTightMs ?? 2000
  const clusterLargeUsd = cfg?.clusterLargeUsd ?? 20000

  // Whale factor: based on whale score (0..100)
  const stats = await getWalletWhaleStats(params.wallet, cfg)
  const whaleScore = computeWhaleScore(stats, cfg)
  const whaleFactor = clamp(whaleScore, 0, 100)

  // Skew factor: map skew (0.5..1) to 0..100 linearly; neutral 0.5 -> 0, max 1.0 -> 100
  const skew = params.skewResult ? params.skewResult.skew : (params.skew ?? 0.5)
  const skewFactor = clamp(((skew - 0.5) / 0.5) * 100, 0, 100)

  // Cluster factor: combine tightness (short duration), burst size (count), and notional
  const c = params.cluster
  const tightScore = clamp((1 - Math.min(c.durationMs, clusterTightMs) / clusterTightMs) * 100, 0, 100) // <= clusterTightMs -> up to 100
  const countScore = clamp((c.count / 5) * 100, 0, 100) // 5+ prints -> 100
  const notionalScore = clamp((c.notionalUsd / clusterLargeUsd) * 100, 0, 100) // 20k+ -> 100
  const clusterFactor = Math.round(0.5 * tightScore + 0.25 * countScore + 0.25 * notionalScore)

  // Timing factor: optional; otherwise neutral 50; combine simple heuristics
  let timingFactor = 50
  if (params.timing?.scoreOverride != null) {
    timingFactor = clamp(params.timing.scoreOverride, 0, 100)
  } else if (params.timing) {
    let base = 50
    if (params.timing.isEarlySession) base += 15
    if (params.timing.isPreEvent) base += 20
    if (params.timing.isUnusualHour) base += 10
    timingFactor = clamp(base, 0, 100)
  }

  // Insider score weights
  const weights = { whale: 0.30, skew: 0.30, cluster: 0.25, timing: 0.15 }
  const insiderScore = Math.round(
    weights.whale * whaleFactor +
    weights.skew * skewFactor +
    weights.cluster * clusterFactor +
    weights.timing * timingFactor
  )
  const trigger = insiderScore >= insiderTrigger

  return {
    insiderScore,
    trigger,
    breakdown: { whaleFactor, skewFactor, clusterFactor, timingFactor },
    meta: {
      whaleScore,
      skew,
      cluster: c,
      timing: params.timing,
      weights,
      thresholds: { insiderTrigger, whaleScoreThreshold },
    },
  }
}
