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

export async function computeSmartSkewAlpha(params: { yesTokenId: string; noTokenId: string }, cfg?: SmartSkewConfig & WhaleScoreConfig & WhaleStatsOptions): Promise<SmartSkewResult> {
  const whaleScoreThreshold = cfg?.whaleScoreThreshold ?? 65
  const windowMs = cfg?.windowMs ?? 30 * 60 * 1000
  const minSmartPoolUsd = cfg?.minSmartPoolUsd ?? 3000
  const maxWallets = cfg?.maxWallets ?? 50

  // Gather recent raw trades for both tokens
  const maxScan = 2000
  const all = TradeBuffer.getTrades(maxScan, { sinceMs: windowMs, tokenIds: [params.yesTokenId, params.noTokenId] })

  // Identify unique wallets in window (cap to reduce API calls)
  const wallets = Array.from(new Set(all.map((e) => (e.wallet || '').toLowerCase()).filter(Boolean))).slice(0, maxWallets)

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

  const smartPoolUsd = yesWhale + noWhale
  const denom = yesWhale + noWhale
  const skewYes = denom > 0 ? yesWhale / denom : 0.5
  const skew = Math.max(skewYes, 1 - skewYes)
  const direction: 'YES' | 'NO' = skewYes >= 0.5 ? 'YES' : 'NO'

  // Alpha formula: alpha = 60 + (skew - 0.75) * 180; bound 0..100
  const rawAlpha = 60 + (skew - 0.75) * 180
  const alpha = clamp(Math.round(rawAlpha), 0, 100)
  const trigger = skew >= 0.75 && smartPoolUsd >= minSmartPoolUsd

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
}): Promise<Array<{ ts: number; tokenId: string; marketId?: string; side: 'BUY'|'SELL'|string; price: number; size: number; notional: number }>> {
  const minNotionalUsd = params?.minNotionalUsd ?? 10_000
  const withinMs = params?.withinMs ?? 10 * 60 * 1000 // 10 minutes
  const perTokenLimit = params?.perTokenLimit ?? 50
  let tokenIds = params?.tokenIds
  if (!tokenIds || tokenIds.length === 0) {
    try {
      const trending = await gammaApi.getTrendingMarkets(8)
      tokenIds = []
      for (const m of trending) for (const t of (m.tokens || [])) if (t?.token_id) tokenIds.push(t.token_id)
    } catch {}
  }
  tokenIds = tokenIds || []
  const cutoff = Date.now() - withinMs
  const results: Array<{ ts: number; tokenId: string; marketId?: string; side: 'BUY'|'SELL'|string; price: number; size: number; notional: number }> = []
  for (const tokenId of tokenIds) {
    try {
      const trades = await clobApi.getTrades(tokenId, perTokenLimit)
      for (const tr of trades || []) {
        const ts = typeof tr.timestamp === 'number' ? tr.timestamp : Date.parse(String((tr as any).timestamp))
        if (!Number.isFinite(ts) || ts < cutoff) continue
        const price = parseFloat(String(tr.price || '0'))
        const size = parseFloat(String(tr.size || '0'))
        const notional = price * size
        if (!Number.isFinite(notional) || notional < minNotionalUsd) continue
        results.push({ ts, tokenId, marketId: (tr as any).market, side: (tr as any).side || '', price, size, notional })
      }
    } catch {}
  }
  results.sort((a,b)=>b.ts - a.ts)
  return results
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
