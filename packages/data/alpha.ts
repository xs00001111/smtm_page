import { dataApi } from './clients/data-api'
// Hardcoded debug: print trade details during investigation
const ALPHA_LOG_TRADES = true
// Disable CLOB fallback while investigating Data API zeros
const ENABLE_CLOB_FALLBACK = false
// Helper: determine if a market is live and tradeable enough for alpha scans
function isMarketLive(m: any): boolean {
  if (!m) return false
  // Exclude closed/archived; prefer active+accepting orders when provided
  if (m.archived === true) return false
  if (m.closed === true) return false
  if (m.active === false) return false
  if (m.accepting_orders === false) return false
  // Exclude resolved winners
  if (Array.isArray(m.tokens) && m.tokens.some((t: any) => t?.winner === true)) return false
  // Exclude price-extreme markets (already effectively decided)
  const extreme = (p: any) => {
    const v = typeof p === 'number' ? p : parseFloat(String(p ?? 'NaN'))
    return Number.isFinite(v) && (v >= 0.99 || v <= 0.01)
  }
  if (Array.isArray(m.tokens) && m.tokens.length > 0) {
    const allExtreme = m.tokens.every((t: any) => extreme(t?.price))
    if (allExtreme) {
      // Allow extreme-priced markets if they ended within the last 24h (late resolution)
      if (m.end_date_iso) {
        const endTs = Date.parse(String(m.end_date_iso))
        if (Number.isFinite(endTs)) {
          const within = Date.now() - endTs
          if (within <= 24*60*60*1000) {
            // treat as live-enough for alerts
          } else {
            return false
          }
        } else {
          return false
        }
      } else {
        return false
      }
    }
  }
  // Time-based filters
  const now = Date.now()
  // 1) Explicit end date (common on many markets)
  if (m.end_date_iso) {
    const endTs = Date.parse(String(m.end_date_iso))
    if (Number.isFinite(endTs)) {
      const delayMs = Math.max(0, (m.seconds_delay || 0) * 1000)
      if (now > endTs + delayMs + 2 * 60 * 1000) return false
    }
  }
  // 2) Sports markets often have game_start_time; treat >6h past start as not live
  if (m.game_start_time) {
    const startTs = Date.parse(String(m.game_start_time))
    if (Number.isFinite(startTs) && now > startTs + 6 * 60 * 60 * 1000) return false
  }
  return true
}
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
  // Guard: invalid wallet -> return neutral stats without calling external APIs
  const isAddr = typeof wallet === 'string' && /^0x[a-fA-F0-9]{40}$/.test(wallet)
  if (!isAddr) {
    return { avgBetUsd: 0, tradesPerHour: 0, winRate: 0, sampleCount: 0, windowHours: (opts?.windowMs ?? 6*60*60*1000) / 3600000 }
  }
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
  let all = TradeBuffer.getTrades(maxScan, { sinceMs: windowMs, tokenIds: [params.yesTokenId, params.noTokenId] })
  log('skew.trades_window_buffer', { count: all.length })

  // Fallback to API if TradeBuffer is empty (common for markets without recent WebSocket activity)
  if (all.length === 0) {
    log('skew.fallback_api', { reason: 'buffer_empty' })
    try {
      // Fetch trades from Data API
      const cutoff = Date.now() - windowMs
      const apiTrades: any[] = []

      // Fetch for both tokens
      for (const tokenId of [params.yesTokenId, params.noTokenId]) {
        try {
          const trades = await dataApi.getTrades({ asset_id: tokenId, limit: Math.min(500, maxScan / 2) })
          log('skew.api_trades', { tokenId, count: (trades || []).length })

          // Convert API trades to TradeBuffer format and filter by time window
          for (const t of trades || []) {
            const tsRaw: any = t.timestamp || t.match_time || t.last_update
            const ts = typeof tsRaw === 'number' ? (tsRaw > 1e12 ? tsRaw : tsRaw * 1000) : Date.parse(String(tsRaw))
            if (!Number.isFinite(ts) || ts < cutoff) continue

            const price = parseFloat(String(t.price || '0'))
            const size = parseFloat(String(t.size || '0'))
            const notional = price * size
            if (!Number.isFinite(notional) || notional <= 0) continue

            apiTrades.push({
              tokenId: String(t.asset_id || t.asset || tokenId),
              wallet: String(t.proxyWallet || t.user || '').toLowerCase(),
              price,
              size,
              notional,
              timestamp: ts,
            })
          }
        } catch (e) {
          log('skew.api_error', { tokenId, error: String((e as any)?.message || e) })
        }
      }

      all = apiTrades
      log('skew.fallback_result', { count: all.length })
    } catch (e) {
      log('skew.fallback_failed', { error: String((e as any)?.message || e) })
    }
  }

  log('skew.trades_window', { count: all.length, source: all.length > 0 ? 'buffer_or_api' : 'empty' })

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

// Smart Money Skew using Top Holders (no time window)
export async function computeSmartSkewFromHolders(
  params: { conditionId: string; yesTokenId?: string; noTokenId?: string },
  cfg?: (SmartSkewConfig & WhaleScoreConfig & WhaleStatsOptions) & { onLog?: (msg: string, ctx?: any) => void }
): Promise<SmartSkewResult & { examples?: Array<{ wallet: string; valueUsd: number; whaleScore: number; pnl: number }> }> {
  const log = cfg?.onLog || (() => {})
  const whaleScoreThreshold = cfg?.whaleScoreThreshold ?? 65
  const minSmartPoolUsd = cfg?.minSmartPoolUsd ?? 3000
  const maxWallets = cfg?.maxWallets ?? 50
  log('skew.holders.start', { cond: params.conditionId, maxWallets, minSmartPoolUsd })

  // Resolve token IDs if not provided
  let yesTokenId = params.yesTokenId
  let noTokenId = params.noTokenId
  try {
    if (!yesTokenId || !noTokenId) {
      const m = await gammaApi.getMarket(params.conditionId)
      const yesT = (m.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')
      const noT = (m.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')
      yesTokenId = yesTokenId || yesT?.token_id
      noTokenId = noTokenId || noT?.token_id
    }
  } catch {}
  if (!yesTokenId || !noTokenId) {
    log('skew.holders.no_pair', { cond: params.conditionId })
    return { direction: 'YES', skewYes: 0.5, skew: 0.5, alpha: 0, trigger: false, smartPoolUsd: 0, volumes: { yesWhale:0, noWhale:0, yesRetail:0, noRetail:0 }, meta: { whaleScoreThreshold, windowMs: 0, walletsEvaluated: 0 } }
  }

  // Fetch holders for the market
  let holders: any[] = []
  try {
    holders = await dataApi.getTopHolders({ market: params.conditionId, limit: 200, minBalance: 1 })
  } catch {}
  const byToken = new Map<string, Array<{ address: string; balance: number; value?: number }>>()
  for (const row of holders || []) {
    const list = Array.isArray(row?.holders) ? row.holders : []
    byToken.set(String(row?.token), list.map((h:any)=>({ address: String(h.address).toLowerCase(), balance: parseFloat(String(h.balance||'0')), value: h.value != null ? parseFloat(String(h.value)) : undefined })))
  }
  // Fetch prices to estimate USD if needed
  let yesPrice: number | null = null
  let noPrice: number | null = null
  try { yesPrice = await clobApi.getCurrentPrice(yesTokenId) } catch {}
  try { noPrice = await clobApi.getCurrentPrice(noTokenId) } catch {}

  const toUsd = (bal: number, v?: number, price?: number|null) => {
    if (Number.isFinite(v as any)) return (v as any) as number
    if (Number.isFinite(price||NaN)) return bal * (price as number)
    return 0
  }

  const yesH = (byToken.get(yesTokenId) || []).map(h=>({ wallet: h.address, usd: toUsd(h.balance, h.value, yesPrice) }))
  const noH  = (byToken.get(noTokenId)  || []).map(h=>({ wallet: h.address, usd: toUsd(h.balance, h.value, noPrice) }))
  const isAddr = (w: string) => /^0x[a-fA-F0-9]{40}$/.test(w)
  // Filter out invalid/anonymous holder entries to avoid downstream API errors
  const yesHF = yesH.filter(h => isAddr(h.wallet))
  const noHF  = noH.filter(h => isAddr(h.wallet))
  // Sort by USD and cap wallets to evaluate
  yesHF.sort((a,b)=>b.usd - a.usd)
  noHF.sort((a,b)=>b.usd - a.usd)
  const yesEval = yesHF.slice(0, Math.min(maxWallets, yesHF.length))
  const noEval  = noHF.slice(0, Math.min(maxWallets, noHF.length))

  // Score wallets and compute PnL for examples
  const scoreCache = new Map<string, number>()
  const pnlCache = new Map<string, number>()
  const evalWallets = Array.from(new Set([...yesEval, ...noEval].map(w=>w.wallet)))
  for (const w of evalWallets) {
    try {
      const stats = await getWalletWhaleStats(w, cfg)
      scoreCache.set(w, computeWhaleScore(stats, cfg))
    } catch { scoreCache.set(w, 0) }
    try {
      const pnl = await dataApi.getUserAccuratePnL(w)
      pnlCache.set(w, pnl.totalPnL || 0)
    } catch { pnlCache.set(w, 0) }
  }

  // Aggregate whale vs retail by threshold
  let yesWhale = 0, noWhale = 0, yesRetail = 0, noRetail = 0
  for (const h of yesEval) {
    const sc = scoreCache.get(h.wallet) || 0
    if (sc >= whaleScoreThreshold) yesWhale += h.usd; else yesRetail += h.usd
  }
  for (const h of noEval) {
    const sc = scoreCache.get(h.wallet) || 0
    if (sc >= whaleScoreThreshold) noWhale += h.usd; else noRetail += h.usd
  }
  const smartPoolUsd = yesWhale + noWhale
  const denom = yesWhale + noWhale
  const skewYes = denom > 0 ? yesWhale / denom : 0.5
  const skew = Math.max(skewYes, 1 - skewYes)
  const direction: 'YES' | 'NO' = skewYes >= 0.5 ? 'YES' : 'NO'
  const rawAlpha = 60 + (skew - 0.75) * 180
  const alpha = clamp(Math.round(rawAlpha), 0, 100)
  const trigger = skew >= 0.75 && smartPoolUsd >= minSmartPoolUsd
  log('skew.holders.result', { direction, skew, skewYes, smartPoolUsd, trigger, alpha })

  // Build top 3 examples for the skewed side by USD
  const sideH = direction === 'YES' ? yesEval : noEval
  sideH.sort((a,b)=>b.usd - a.usd)
  const examples = sideH.slice(0, 3).map(w => ({ wallet: w.wallet, valueUsd: Math.round(w.usd), whaleScore: scoreCache.get(w.wallet) || 0, pnl: Math.round(pnlCache.get(w.wallet) || 0) }))

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
    meta: { whaleScoreThreshold, windowMs: 0, walletsEvaluated: evalWallets.length },
    examples,
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
      if (ENABLE_CLOB_FALLBACK && (trades || []).length === 0) {
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
        if (!isMarketLive(m)) continue
        for (const t of (m.tokens || [])) {
          if (t?.token_id && !seen.has(t.token_id)) { seen.add(t.token_id); tokenIds.push(t.token_id); if (m?.condition_id) tokenToCond.set(t.token_id, m.condition_id) }
        }
      }
    }
    addTokens(trending)
    addTokens(active)
    log('tokens', { count: tokenIds.length, sample: tokenIds.slice(0, 25) })
    try {
      const mapSample = tokenIds.slice(0, 5).map((id) => ({ tokenId: id, cond: tokenToCond.get(id) }))
      log('tokens_map', { sample: mapSample })
    } catch {}
    let best: any = null
    for (const tokenId of tokenIds) {
      try {
        const cond = tokenToCond.get(tokenId)
        const trades = cond ? await dataApi.getTrades({ market: [cond], limit: perTokenLimit }) : []
        const marketUrl = cond ? `https://polymarket.com/market/${cond}` : undefined
        const clobMarketApiUrl = cond ? `https://clob.polymarket.com/markets/${cond}` : undefined
        log('trades', { tokenId, conditionId: cond, marketUrl, clobMarketApiUrl, total: (trades || []).length })
        if (ALPHA_LOG_TRADES) {
          for (const t of (trades || []).slice(0, 5)) {
            try {
              log('trade.detail', {
                conditionId: cond,
                marketUrl,
                asset: (t as any).asset_id || (t as any).asset,
                price: (t as any).price,
                size: (t as any).size,
                ts: (t as any).timestamp || (t as any).match_time || (t as any).last_update,
              })
            } catch {}
          }
        }
        let filtered = 0
        let filteredByAsset = 0
        let filteredByTime = 0
        let topN = 0
        for (const tr of trades || []) {
          const assetAny2 = (tr as any).asset_id || (tr as any).asset
          if (assetAny2 && String(assetAny2) !== String(tokenId)) { filtered++; filteredByAsset++; continue }
          const tsRaw: any = (tr as any).timestamp || (tr as any).match_time || (tr as any).last_update
          const ts = typeof tsRaw === 'number' ? tsRaw : Date.parse(String(tsRaw))
          if (!Number.isFinite(ts) || ts < cutoff) { filtered++; filteredByTime++; continue }
          const price = parseFloat(String(tr.price || '0'))
          const size = parseFloat(String(tr.size || '0'))
          const notional = price * size
          if (!Number.isFinite(notional) || notional < minNotionalUsd) continue
          filtered++
          if (notional > topN) topN = notional
          if (!best || notional > best.notional) best = { ts, tokenId, marketId: (tr as any).market, side: (tr as any).side || '', price, size, notional }
        }
        log('trades_filter_breakdown', { tokenId, conditionId: cond, marketUrl, total: (trades||[]).length, filtered, filteredByAsset, filteredByTime, keptTop: Math.round(topN) })
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
        if (!isMarketLive(m)) continue
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
          if (!isMarketLive(mkt)) { log('progressive.resolve_condition_skipped', { conditionId: cid, reason: 'not_live' }); continue }
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
          if (!isMarketLive(mkt)) { log('progressive.resolve_clob_market_skipped', { conditionId: cid, reason: 'not_live' }); continue }
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
        if (ENABLE_CLOB_FALLBACK && (trades || []).length === 0) {
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

// Trade-first alpha scan across all markets via Data API
export async function scanAlphaFromTrades(params?: {
  windowMs?: number
  minNotionalUsd?: number
  limit?: number
  maxBatches?: number
  onLog?: (msg: string, ctx?: any) => void
}): Promise<{
  ts: number
  tokenId: string
  marketId: string
  side: string
  price: number
  size: number
  notional: number
  wallet: string
  whaleScore?: number
  tags?: string[]
  displayName?: string | null
} | null> {
  const windowMs = params?.windowMs ?? 12 * 60 * 60 * 1000
  const minNotionalUsd = params?.minNotionalUsd ?? 1000
  const pageSize = Math.min(Math.max(100, params?.limit ?? 1000), 1000)
  const maxBatches = Math.min(Math.max(1, params?.maxBatches ?? 5), 20)
  const log = params?.onLog || (() => {})
  const cutoff = Date.now() - windowMs

  let offset = 0
  const candidates: any[] = []
  for (let batch = 0; batch < maxBatches; batch++) {
    log('trades_first.fetch', { offset, pageSize })
    const items = await dataApi.getTrades({ limit: pageSize, offset })
    const len = Array.isArray(items) ? items.length : 0
    log('trades_first.page', { offset, len })
    if (!len) break
    // Filter window and notional
    for (const t of items as any[]) {
      const tsRaw = t.timestamp || t.match_time || t.last_update
      const ts = typeof tsRaw === 'number' ? (tsRaw > 1e12 ? tsRaw : tsRaw * 1000) : Date.parse(String(tsRaw))
      if (!Number.isFinite(ts) || ts < cutoff) continue
      const price = parseFloat(String(t.price ?? '0'))
      const size = parseFloat(String(t.size ?? '0'))
      const notional = price * size
      if (!Number.isFinite(notional) || notional < minNotionalUsd) continue
      const tokenId = String((t.asset_id || t.asset || '')).trim()
      const marketId = String((t.conditionId || t.market || '')).trim()
      const wallet = String(t.proxyWallet || t.user || '').toLowerCase()
      const displayName = (t.name || t.pseudonym) ? String(t.name || t.pseudonym) : null
      if (!tokenId || !marketId) continue
      candidates.push({ ts, tokenId, marketId, side: t.side || '', price, size, notional, wallet, displayName })
    }
    // If oldest trade in this page is older than cutoff, stop paging
    const oldest = items.reduce((mn:number, t:any)=>{
      const r = t.timestamp || t.match_time || t.last_update
      const v = typeof r === 'number' ? (r > 1e12 ? r : r*1000) : Date.parse(String(r))
      return Number.isFinite(v) ? Math.min(mn, v) : mn
    }, Number.POSITIVE_INFINITY)
    if (oldest < cutoff) break
    offset += pageSize
  }

  if (!candidates.length) { log('trades_first.empty', { minNotionalUsd, windowMs }); return null }

  // Enrich top K by notional to limit load
  candidates.sort((a,b)=> b.notional - a.notional)
  const top = candidates.slice(0, Math.min(100, candidates.length))

  // Fetch markets once per condition
  const byMarket = new Map<string, any>()
  for (const c of top) {
    if (byMarket.has(c.marketId)) continue
    try {
      const m = await gammaApi.getMarket(c.marketId)
      if (!isMarketLive(m)) { byMarket.set(c.marketId, null); continue }
      byMarket.set(c.marketId, m)
    } catch { byMarket.set(c.marketId, null) }
  }

  // Compute whale scores for wallets appearing in top trades (cap distinct wallets)
  const wallets = Array.from(new Set(top.map(t=>t.wallet).filter(Boolean))).slice(0, 50)
  const whaleScores = new Map<string, number>()
  for (const w of wallets) {
    try {
      const stats = await getWalletWhaleStats(w, { windowMs: 6*60*60*1000, maxEvents: 500 })
      whaleScores.set(w, computeWhaleScore(stats, {}))
    } catch { whaleScores.set(w, 0) }
  }

  // Pick best candidate by combined score (notional + whale)
  let best: any = null
  for (const t of top) {
    const m = byMarket.get(t.marketId)
    if (!m) continue
    // tags/category enrichment
    const tags: string[] = []
    if (Array.isArray(m.tags)) tags.push(...m.tags)
    if (m.eventSlug) tags.push(String(m.eventSlug))
    if (m.slug) tags.push(String(m.slug))
    const whale = whaleScores.get(t.wallet) || 0
    const score = t.notional + whale * 200 // light whale boost
    if (!best || score > best._score) {
      best = { ...t, whaleScore: whale, tags, _score: score }
    }
  }
  if (!best) { log('trades_first.no_live_after_filter', { candidates: candidates.length }); return null }
  log('trades_first.best', { notional: Math.round(best.notional), whale: best.whaleScore, marketId: best.marketId, tokenId: best.tokenId })
  delete best._score
  return best
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
