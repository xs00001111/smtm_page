import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger';
import { getTopRewardMarket, formatRewardInfo } from '../services/rewards';
import { findMarket, findMarketFuzzy, findWhaleFuzzy, findWhaleFuzzyWide, gammaApi, dataApi, clobApi } from '@smtm/data';
import { wsMonitor } from '../index';
// Toggle DB-first surfacing of alpha events (enable to surface unseen DB alpha before live scan)
const DB_FIRST_ENABLED = true;
// Log-only probe: fetch unseen fresh alpha from DB and log, but do not display
const DB_LOG_ONLY_PROBE = true;
import { botConfig } from '../config/bot';
import { linkPolymarketAddress, linkPolymarketUsername, unlinkAll, getLinks, parsePolymarketProfile, resolveUsernameToAddress, resolveUsernameToAddressExact } from '../services/links';
import { actionFollowMarket, actionFollowWhaleAll, actionFollowWhaleMarket, resolveAction, actionUnfollowMarket, actionUnfollowWhaleAll, actionUnfollowWhaleMarket, actionFollowWhaleAllMany } from '../services/actions';
import { logActionEvent } from '../services/analytics';
import { recordSurveyResponse } from '../services/survey';

// Lightweight skew cache to avoid recomputation storms (10 minutes)
const SkewCache: Map<string, { ts: number; result: any }> = new Map()
const SKEW_CACHE_MS = 10 * 60 * 1000

async function getSmartSkew(conditionId: string, yesTokenId?: string, noTokenId?: string): Promise<any | null> {
  const now = Date.now()
  const cached = SkewCache.get(conditionId)
  if (cached && (now - cached.ts) < SKEW_CACHE_MS) return cached.result
  try {
    // Resolve token IDs if not supplied
    let y = yesTokenId, n = noTokenId
    if (!y || !n) {
      const m = await gammaApi.getMarket(conditionId)
      const yes = (m.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
      const no = (m.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
      y = y || yes
      n = n || no
    }
    if (!y || !n) return null
    // Avoid TS non-null assertions in object literals for esbuild compatibility
    const yTok: string = y as string
    const nTok: string = n as string
    const { computeSmartSkewFromHolders } = await import('@smtm/data')
    // Use holder-based skew (current positions, not time-based trades)
    // Tune for responsiveness in UI: cap evaluated wallets moderately
    let res = await computeSmartSkewFromHolders(
      { conditionId, yesTokenId: yTok, noTokenId: nTok },
      { onLog: (m, c)=> logger.info({ ...c }, `alpha:skew_ui ${m}`), minSmartPoolUsd: 100, maxWallets: 40 }
    )

    // Mark source for debugging (avoid assigning to parenthesized assertion)
    const resAny: any = res
    resAny._source = 'holders'

    // Check if we have meaningful data
    const walletsEvaluated = Number(((res as any)?.meta?.walletsEvaluated) || 0)
    const hasData = (res.smartPoolUsd || 0) >= 100 && walletsEvaluated > 0
    SkewCache.set(conditionId, { ts: now, result: res })
    return res
  } catch (e) {
    logger.warn('skew:get failed', { conditionId, err: (e as any)?.message || String(e) })
    return null
  }
}

function formatSkewBadge(res: any | null): string | null {
  if (!res || !Number.isFinite(res.skew)) return null
  const s = res.skew
  if (s >= 0.65) return '⚖️ Skew: Strong YES'
  if (s <= 0.35) return '⚖️ Skew: Strong NO'
  return null
}

function formatSkewCard(title: string, marketUrl: string | null, res: any, detailed = false): string {
  const dirEmoji = res.direction === 'YES' ? '✅' : (res.direction === 'NO' ? '❌' : '⚖️')
  const poolNum = Number(res.smartPoolUsd || 0)
  const pool = Math.round(poolNum).toLocaleString()
  const skew = Number(res.skew || 0)
  const skewPct = Math.round(skew * 100)
  const walletsEvaluated = Number(((res as any)?.meta?.walletsEvaluated) || 0)
  const whalesDetected = Number(((res as any)?.meta?.whalesDetected) || 0)
  const poolLow = poolNum < 3000
  // Confidence label and cautions (do not short‑circuit)
  let confidence: 'High' | 'Medium' | 'Low' = 'High'
  if (poolLow || walletsEvaluated === 0) confidence = 'Low'
  else if (poolNum < 5000 || walletsEvaluated < 3) confidence = 'Medium'
  // Strength labeling
  let strength = 'Neutral'
  if (skew >= 0.80 || skew <= 0.20) strength = 'Extreme'
  else if (skew >= 0.65 || skew <= 0.35) strength = 'Strong'
  else if (skew >= 0.55 || skew <= 0.45) strength = 'Lean'
  // Source hint: holdings vs trades (flow)
  const src = (res as any)?._source === 'trades' ? 'Recent trades (flow)' : 'Current holders (positions)'
  let msg = `✨ <b>${esc(title)}</b>\n\n` +
            `⚖️ <b>Smart Money Skew</b>\n\n` +
            `${dirEmoji} ${res.direction || 'Neutral'} • Skew ${skewPct}% • Pool $${pool}\n` +
            `Confidence: ${confidence} • Source: ${src}`
  // Always add a compact context line (only when we have enough data)
  try {
    const meta = (res as any).meta || {}
    const wallets = meta.walletsEvaluated != null ? ` • Wallets ${meta.walletsEvaluated}` : ''
    const thr = meta.whaleScoreThreshold != null ? ` • Whale≥${meta.whaleScoreThreshold}` : ''
    msg += `\nStrength: ${strength}${wallets}${thr}`
  } catch {}
  // Add cautions instead of returning early
  if (whalesDetected === 0) {
    msg += `\n⚠️ Verified-whale holders not detected — using holder snapshots; interpret cautiously.`
  }
  if (poolLow) {
    msg += `\n⚠️ Smart-pool liquidity below $3,000; signal may be noisy.`
  }
  if (detailed) {
    // Best-effort volume breakdown if available
    try {
      const v = (res as any).volumes
      if (v && (v.yesWhale!=null || v.noWhale!=null || v.yesRetail!=null || v.noRetail!=null)) {
        const yesW = v.yesWhale ? `$${Math.round(v.yesWhale).toLocaleString()}` : '$0'
        const noW = v.noWhale ? `$${Math.round(v.noWhale).toLocaleString()}` : '$0'
        const yesR = v.yesRetail ? `$${Math.round(v.yesRetail).toLocaleString()}` : '$0'
        const noR = v.noRetail ? `$${Math.round(v.noRetail).toLocaleString()}` : '$0'
        msg += `\nBy wallets: 🐋 Yes ${yesW} / No ${noW} • 👥 Yes ${yesR} / No ${noR}`
      }
    } catch {}
    // Examples only when direction is strong (skew >= 65% or <= 35%)
    try {
      const s = Number(res.skew||0)
      const showExamples = s >= 0.65 || s <= 0.35
      if (showExamples && Array.isArray((res as any).examples) && (res as any).examples.length) {
        const exs = (res as any).examples.slice(0,3)
        msg += `\n\nTop Wallets (${res.direction}):\n`
        for (const ex of exs) {
          const w = String(ex.wallet)
          const short = `${w.slice(0,6)}…${w.slice(-4)}`
          const val = ex.valueUsd!=null ? `$${Math.round(ex.valueUsd).toLocaleString()}` : '$0'
          const ws = ex.whaleScore!=null ? ` • 🐋 ${Math.round(ex.whaleScore)}` : ''
          const pnl = ex.pnl!=null ? ` • PnL ${(ex.pnl>=0?'+':'-')}$${Math.abs(Math.round(ex.pnl)).toLocaleString()}` : ''
          msg += `• <code>${short}</code> — ${val}${ws}${pnl}\n`
        }
      }
    } catch {}
    if (poolNum < 1) {
      msg += `\n💤 Low smart-pool liquidity`
    }
  }
  if (marketUrl) msg += `\n\n🔗 <a href=\"${esc(marketUrl)}\">Market</a>`
  return msg
}

// Analyze examples for additional insights (best-effort and cautious)
async function analyzeSkewExamples(examples: Array<{ wallet: string; valueUsd?: number; whaleScore?: number; pnl?: number }>): Promise<{ hiReturn: number; newBig: number }> {
  let hiReturn = 0
  let newBig = 0
  const top = (examples || []).slice(0, 2)
  for (const ex of top) {
    try {
      if ((ex.pnl || 0) >= 20000) hiReturn += 1
    } catch {}
  }
  // New wallet heuristic (few positions + young account), best-effort, only top 2 to limit calls
  for (const ex of top) {
    try {
      const addr = ex.wallet
      const big = (ex.valueUsd || 0) >= 10000
      if (!big) continue
      const [openPos, closedPos] = await Promise.all([
        dataApi.getUserPositions({ user: addr, limit: 50 }).catch(()=>[]),
        dataApi.getClosedPositions(addr, 100).catch(()=>[]),
      ])
      let totalPositions = (openPos?.length || 0) + (closedPos?.length || 0)
      let firstTs = Infinity
      for (const p of [...(openPos||[]), ...(closedPos||[])]) {
        const cAt = (p as any)?.created_at
        const t = cAt ? Date.parse(String(cAt)) : NaN
        if (Number.isFinite(t)) firstTs = Math.min(firstTs, t)
      }
      const ageDays = Number.isFinite(firstTs) ? Math.max(0, Math.floor((Date.now() - firstTs) / (24*60*60*1000))) : null
      const isNewWallet = (totalPositions <= 5) && (ageDays == null || ageDays <= 14)
      if (isNewWallet) newBig += 1
    } catch {}
  }
  return { hiReturn, newBig }
}

// Safe sender with layered fallbacks and verbose diagnostics
async function replySafe(ctx: any, message: string, keyboard?: any): Promise<void> {
  const kb = keyboard ? { reply_markup: keyboard } : undefined
  const len = message?.length || 0
  try {
    await ctx.reply(message, { parse_mode: 'HTML', ...(kb as any) })
    return
  } catch (e: any) {
    const desc = e?.response?.description
    logger.error(`markets: send HTML failed len=${len} desc=${desc || e?.message || e}`)
  }
  try {
    const plain = String(message || '').replace(/<[^>]+>/g, '')
    await ctx.reply(plain, kb as any)
    return
  } catch (e2: any) {
    const desc2 = e2?.response?.description
    logger.error(`markets: send plain failed len=${len} desc=${desc2 || e2?.message || e2}`)
  }
  if (keyboard) {
    try {
      await ctx.reply(message, { parse_mode: 'HTML' as any })
      await ctx.reply('Actions:', { reply_markup: keyboard as any })
      return
    } catch (e3: any) {
      const desc3 = e3?.response?.description
      logger.error(`markets: split send failed desc=${desc3 || e3?.message || e3}`)
    }
  }
  throw new Error('markets: all reply attempts failed')
}

// Encode/decode helpers for callback data (fit Telegram 64-byte limit)
function condToToken(cond: string): string {
  try {
    const hex = String(cond || '')
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex
    const b64 = Buffer.from(clean, 'hex').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/,'')
    return b64
  } catch { return '' }
}
function tokenToCond(tok: string): string | null {
  try {
    const b64 = tok.replace(/-/g,'+').replace(/_/g,'/')
    const buf = Buffer.from(b64, 'base64')
    const hex = buf.toString('hex')
    return hex ? ('0x'+hex) : null
  } catch { return null }
}

// Detect event URL without a specific market slug
function isEventUrlWithoutMarket(u: string): boolean {
  try {
    const url = new URL(u)
    const parts = url.pathname.split('/').filter(Boolean)
    const idx = parts.findIndex(p => p === 'event')
    return idx >= 0 && parts[idx+1] && !parts[idx+2]
  } catch { return false }
}

// Derive the parent event URL from an input (URL with optional market slug)
function getEventUrlFromInput(u: string): string | null {
  try {
    const url = new URL(u)
    const parts = url.pathname.split('/').filter(Boolean)
    const idx = parts.findIndex(p => p === 'event')
    if (idx >= 0 && parts[idx+1]) {
      const eventSlug = parts[idx+1]
      return `${url.origin}/event/${eventSlug}`
    }
    return null
  } catch { return null }
}

// Get markets by event slug using Gamma API
async function getMarketsByEvent(eventSlug: string): Promise<Array<{ slug: string; conditionId: string; tokens?: any[]; question?: string; end_date_iso?: string; closed?: boolean; archived?: boolean }>> {
  try {
    logger.info({ eventSlug }, 'getMarketsByEvent: fetching from API')

    // Try searching by the event slug directly (works better than events field filtering)
    try {
      const searchResults = await gammaApi.searchMarkets(eventSlug.replace(/-/g, ' '), 50)
      logger.info({ searchResults: searchResults.length, questions: searchResults.map(m => m.question?.slice(0, 50)) }, 'getMarketsByEvent: search results')

      // Filter to only include markets that actually contain the main keyword from the event slug
      // This prevents irrelevant results from broad searches with common words like "out", "2025"
      const allWords = eventSlug.split('-')
      const stopWords = new Set(['in', 'on', 'at', 'by', 'of', 'the', 'a', 'an', 'out', 'for', 'to', 'from', 'and', 'or'])
      const keywords = allWords.filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()))

      // Require the FIRST meaningful keyword to match (usually the main topic)
      const mainKeyword = keywords[0]
      const relevantResults = searchResults.filter(m => {
        const question = (m.question || '').toLowerCase()
        return mainKeyword && question.includes(mainKeyword.toLowerCase())
      })

      logger.info({ relevant: relevantResults.length, total: searchResults.length, mainKeyword, allKeywords: keywords }, 'getMarketsByEvent: filtered search results')

      if (relevantResults.length > 0) {
        return relevantResults.map(m => ({
          slug: m.slug || m.market_slug || '',
          conditionId: m.condition_id,
          tokens: m.tokens,
          question: m.question,
          end_date_iso: m.end_date_iso,
          closed: m.closed,
          archived: m.archived
        }))
      }
    } catch (e) {
      logger.warn({ err: (e as any)?.message }, 'getMarketsByEvent: search failed, trying list approach')
    }
    // Fetch markets - reduced from 500 to 200 to avoid timeouts
    // Use liquidity sort to catch high-value but low-volume markets
    // Filter for active markets only (no resolved/closed ones)
    let markets: any[] = []
    for (let offset = 0; offset < 200; offset += 100) {
      const batch = await gammaApi.getMarkets({ limit: 100, offset, order: 'liquidity', active: true, closed: false })

      // Debug: log full first market object to see complete data structure
      if (offset === 0 && batch.length > 0) {
        logger.info({
          fullMarketObject: batch[0],
          totalMarketsInBatch: batch.length
        }, 'getMarketsByEvent: DEBUG full API market object')
      }

      markets = markets.concat(batch)
      // If we found matches, we can stop early
      const matches = batch.filter(m =>
        m.events && Array.isArray(m.events) && m.events.some((e: any) => e.slug === eventSlug)
      )
      if (matches.length > 0) {
        logger.info({ offset, batchSize: batch.length, matches: matches.length }, 'getMarketsByEvent: found matches, stopping early')
        break
      }
      // If we got less than 100, we've reached the end
      if (batch.length < 100) break
    }

    // Filter for markets that belong to this event
    const eventMarkets = markets.filter(m =>
      m.events && Array.isArray(m.events) && m.events.some(e => e.slug === eventSlug)
    )

    // Debug: log sample of what events look like
    const sampleEvents = markets.slice(0, 5).map(m => ({
      question: m.question?.slice(0, 50),
      events: m.events?.map(e => e.slug)
    }))

    // Also search for markets that might be related by question text
    const relatedByQuestion = markets.filter(m =>
      m.question?.toLowerCase().includes(eventSlug.toLowerCase().replace(/-/g, ' '))
    ).map(m => ({
      question: m.question?.slice(0, 80),
      slug: m.slug,
      events: m.events?.map(e => e.slug)
    }))

    logger.info({ total: markets.length, matching: eventMarkets.length, sampleEvents, relatedByQuestion }, 'getMarketsByEvent: filtered results')

    return eventMarkets.map(m => ({
      slug: m.slug || m.market_slug || '',
      conditionId: m.condition_id,
      tokens: m.tokens,
      question: m.question,
      end_date_iso: m.end_date_iso,
      closed: m.closed,
      archived: m.archived
    }))
  } catch (e) {
    logger.warn({ err: (e as any)?.message || String(e) }, 'getMarketsByEvent failed')
    return []
  }
}

// Extract child markets from a group (event + market slug) page
async function getGroupSubMarkets(groupUrl: string): Promise<Array<{ slug: string; conditionId: string; eventSlug?: string; tokens?: any[]; question?: string; end_date_iso?: string; closed?: boolean; archived?: boolean }>> {
  try {
    const url = new URL(groupUrl)
    const parts = url.pathname.split('/').filter(Boolean)
    const idx = parts.findIndex(p => p === 'event')
    const eventSlug = parts[idx+1] || ''
    const groupSlug = parts[idx+2] || ''
    logger.info({ eventSlug, groupSlug, parts }, 'getGroupSubMarkets: parsing URL')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 7000)
    const resp = await fetch(groupUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; smtm-bot/1.0; +https://smtm.ai)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://polymarket.com/',
      } as any,
      signal: controller.signal as any,
    } as any)
    clearTimeout(timeout)
    if (!resp.ok) return []
    const html = await resp.text()
    const match = html.match(/<script[^>]*id=\"__NEXT_DATA__\"[^>]*>([^<]+)<\/script>/)
    if (!match || !match[1]) return []
    const nextData = JSON.parse(match[1])
    const queries = nextData?.props?.pageProps?.dehydratedState?.queries || []
    logger.info({ queriesCount: queries.length, hasDehydratedState: !!nextData?.props?.pageProps?.dehydratedState }, 'getGroupSubMarkets: parsed __NEXT_DATA__')
    const out: Array<{ slug: string; conditionId: string; eventSlug?: string; tokens?: any[]; question?: string; end_date_iso?: string; closed?: boolean; archived?: boolean }> = []
    const looksChildOfGroup = (m:any): boolean => {
      const ms = String(m?.market_slug || '')
      const s  = String(m?.slug || '')
      const parent = String(m?.parent_market_slug || m?.parentSlug || '')
      // Check if child of groupSlug OR eventSlug (for multi-date events)
      return (ms && ms === groupSlug) || (parent && parent === groupSlug) || (s && s.startsWith(groupSlug)) ||
             (parent && parent === eventSlug) || (s && s.startsWith(eventSlug + '-'))
    }
    for (const q of queries) {
      const data = q?.state?.data
      if (Array.isArray(data)) {
        // Debug: log first market's keys to see what fields are available
        if (data.length > 0 && out.length === 0) {
          logger.info({ sampleKeys: Object.keys(data[0] || {}), sampleData: data[0] }, 'getGroupSubMarkets: DEBUG sample market from __NEXT_DATA__')
        }
        for (const m of data) {
          const cid = m?.condition_id || m?.conditionId
          const slug = String(m?.slug || m?.market_slug || groupSlug)

          // Check if market belongs to this group/event
          // Also check eventSlug field for __NEXT_DATA__ markets
          let matchesGroup = looksChildOfGroup(m) || m?.eventSlug === eventSlug
          // If we aren't finding enough children, allow broader inclusion later
          if (matchesGroup && slug) {
            out.push({
              slug,
              conditionId: cid ? String(cid) : '',
              eventSlug: m?.eventSlug,
              tokens: m?.tokens,
              question: m?.question,
              end_date_iso: m?.end_date_iso || m?.endDateIso,
              closed: m?.closed,
              archived: m?.archived
            })
          }
        }
      }
    }
    // If too few children detected, broaden to any markets present on the page (series tabs can cross eventSlug)
    if (out.length <= 1) {
      for (const q of queries) {
        const data = q?.state?.data
        if (Array.isArray(data)) {
          for (const m of data) {
            try {
              const cid = m?.condition_id || m?.conditionId
              const slug = String(m?.slug || m?.market_slug || '')
              if (!slug) continue
              const key = (cid ? String(cid) : slug)
              // Skip if already included
              if (out.some(o => o.conditionId === key || o.slug === slug)) continue
              out.push({
                slug,
                conditionId: cid ? String(cid) : '',
                eventSlug: m?.eventSlug,
                tokens: m?.tokens,
                question: m?.question,
                end_date_iso: m?.end_date_iso || m?.endDateIso,
                closed: m?.closed,
                archived: m?.archived
              })
            } catch {}
          }
        }
      }
    }
    // De‑dupe by conditionId or slug (some markets may not have conditionId)
    const seen = new Set<string>()
    const uniq: typeof out = []
    for (const m of out) {
      const key = m.conditionId || m.slug
      if (!seen.has(key)) {
        seen.add(key)
        uniq.push(m)
      }
    }
    return uniq
  } catch (e) { try { logger.warn('getGroupSubMarkets failed', { err: (e as any)?.message || String(e) }) } catch {} ; return [] }
}

// Extract all sub-market slugs from a Polymarket event page
async function getEventSubMarketSlugs(eventUrl: string): Promise<string[]> {
  try {
    logger.info({ eventUrl }, 'getEventSubMarketSlugs: start fetch')
    // Fetch with a hard timeout and browser-like headers to avoid hanging on bot protection
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 7000)
    const resp = await fetch(eventUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; smtm-bot/1.0; +https://smtm.ai)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://polymarket.com/',
      } as any,
      signal: controller.signal as any,
    } as any)
    clearTimeout(timeout)
    if (!resp.ok) return []
    const html = await resp.text()
    logger.info({ bytes: html.length }, 'getEventSubMarketSlugs: fetched HTML')
    const match = html.match(/<script[^>]*id=\"__NEXT_DATA__\"[^>]*>([^<]+)<\/script>/)
    if (!match || !match[1]) return []
    const nextData = JSON.parse(match[1])
    const queries = nextData?.props?.pageProps?.dehydratedState?.queries || []
    const slugs = new Set<string>()
    for (const q of queries) {
      const data = q?.state?.data
      if (Array.isArray(data)) {
        for (const m of data) {
          const s = m?.slug || m?.market_slug
          if (s) slugs.add(String(s))
        }
      }
    }
    const out = Array.from(slugs)
    logger.info({ count: out.length, sample: out.slice(0,5) }, 'getEventSubMarketSlugs: extracted slugs')
    return out
  } catch (e) { try { logger.warn('getEventSubMarketSlugs failed', { err: (e as any)?.message || String(e) }) } catch {} ; return [] }
}

// Extract sub‑market metadata (conditionId, slug, tokens) from an event page
async function getEventSubMarkets(eventUrl: string): Promise<Array<{ slug: string; conditionId: string; eventSlug?: string; tokens?: any[]; question?: string; end_date_iso?: string; closed?: boolean; archived?: boolean }>> {
  try {
    logger.info({ eventUrl }, 'getEventSubMarkets: start fetch')
    // Extract target event slug from URL
    const targetEventSlug = eventUrl.split('/event/')[1]?.split('/')[0]

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 7000)
    const resp = await fetch(eventUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; smtm-bot/1.0; +https://smtm.ai)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://polymarket.com/',
      } as any,
      signal: controller.signal as any,
    } as any)
    clearTimeout(timeout)
    if (!resp.ok) return []
    const html = await resp.text()
    logger.info({ bytes: html.length }, 'getEventSubMarkets: fetched HTML')
    const match = html.match(/<script[^>]*id=\"__NEXT_DATA__\"[^>]*>([^<]+)<\/script>/)
    if (!match || !match[1]) return []
    const nextData = JSON.parse(match[1])
    const queries = nextData?.props?.pageProps?.dehydratedState?.queries || []
    logger.info({ queriesCount: queries.length, hasDehydratedState: !!nextData?.props?.pageProps?.dehydratedState, targetEventSlug }, 'getEventSubMarkets: parsed __NEXT_DATA__')
    const out: Array<{ slug: string; conditionId: string; eventSlug?: string; tokens?: any[]; question?: string; end_date_iso?: string; closed?: boolean; archived?: boolean }> = []
    let totalMarketsInQueries = 0
    let filteredOutCount = 0
    for (const q of queries) {
      const data = q?.state?.data
      if (Array.isArray(data)) {
        totalMarketsInQueries += data.length
        // Debug: log first market's keys to see what fields are available
        if (data.length > 0 && out.length === 0) {
          logger.info({ sampleKeys: Object.keys(data[0] || {}), sampleData: data[0] }, 'getEventSubMarkets: DEBUG sample market from __NEXT_DATA__')
        }
        for (const m of data) {
          const slug = m?.slug || m?.market_slug
          const cid = m?.condition_id || m?.conditionId
          const marketEventSlug = m?.eventSlug

          // Debug: log eventSlug values to understand filtering
          if (out.length < 3 || (filteredOutCount < 3 && targetEventSlug && marketEventSlug !== targetEventSlug)) {
            logger.info({
              marketSlug: slug,
              marketEventSlug,
              targetEventSlug,
              matches: marketEventSlug === targetEventSlug,
              question: m?.question
            }, 'getEventSubMarkets: DEBUG eventSlug comparison')
          }

          // __NEXT_DATA__ markets may not have conditionId but have eventSlug instead
          // Accept markets with just slug (can resolve conditionId later)
          if (slug) {
            out.push({
              slug: String(slug),
              conditionId: cid ? String(cid) : '',
              eventSlug: marketEventSlug,
              tokens: m?.tokens,
              question: m?.question,
              end_date_iso: m?.end_date_iso || m?.endDateIso,
              closed: m?.closed,
              archived: m?.archived
            })
          }
        }
      } else if (data && (data.slug || data.market_slug) && (data.condition_id || data.conditionId)) {
        const slug = data.slug || data.market_slug
        const cid = data.condition_id || data.conditionId
        out.push({ slug: String(slug), conditionId: String(cid), eventSlug: (data as any)?.eventSlug, tokens: data.tokens, question: data.question, end_date_iso: data.end_date_iso, closed: data.closed, archived: data.archived })
      }
    }
    // De‑dupe by conditionId or slug (some markets may not have conditionId)
    const seen = new Set<string>()
    const uniq: typeof out = []
    for (const m of out) {
      const key = m.conditionId || m.slug
      if (!seen.has(key)) {
        seen.add(key)
        uniq.push(m)
      }
    }
    logger.info({
      totalMarketsInQueries,
      filteredOutCount,
      rawMarketsFound: out.length,
      uniqueMarkets: uniq.length,
      targetEventSlug
    }, 'getEventSubMarkets: processed queries')
    return uniq
  } catch (e) { try { logger.warn('getEventSubMarkets failed', { err: (e as any)?.message || String(e) }) } catch {} ; return [] }
}

/**
 * Generate Polymarket profile URL for a whale/trader
 * @param username - User's display name (e.g., "Car")
 * @param address - User's wallet address (fallback if no username)
 * @returns Formatted profile URL
 */
function getPolymarketProfileUrl(username: string | null | undefined, address: string): string {
  // If we have a real username (not "Anonymous"), use the profile format
  if (username && username !== 'Anonymous') {
    const encodedName = encodeURIComponent(username);
    const lowerName = encodeURIComponent(username.toLowerCase());
    return `https://polymarket.com/profile/%40${encodedName}?via=user%2F${lowerName}`;
  }
  // Fallback to address format for anonymous or address-only cases
  return `https://polymarket.com/profile/${address}`;
}

/**
 * Generate Polymarket market URL from API response
 * Uses events[0].slug from API response (most reliable)
 * @param market - Market object from Gamma API
 * @returns Formatted market URL or null if no slug available
 */
function getPolymarketMarketUrl(market: any): string | null {
  // Prefer events[0].slug + market slug (full market URL)
  const eventSlug = market?.events && Array.isArray(market.events) && market.events.length > 0
    ? market.events[0].slug
    : undefined
  const marketSlug = market?.slug || market?.market_slug
  if (eventSlug && marketSlug) {
    return `https://polymarket.com/event/${eventSlug}/${marketSlug}`
  }
  // If no market slug, link to the event page
  if (eventSlug) {
    return `https://polymarket.com/event/${eventSlug}`
  }
  // Last resort: some APIs expose only a slug that is already the market slug
  if (marketSlug) {
    return `https://polymarket.com/event/${marketSlug}`
  }
  return null
}

function formatDateYYYYMMDD(isoOrMillis: string | number): string {
  try {
    const d = new Date(typeof isoOrMillis === 'number' ? isoOrMillis : String(isoOrMillis))
    if (Number.isNaN(d.getTime())) return ''
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const da = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${da}`
  } catch { return '' }
}

// Build a canonical market URL from a parsed child entry
function buildChildMarketUrl(child: any, defaultEventSlug?: string): string | null {
  try {
    const ev = (child as any)?.eventSlug || defaultEventSlug
    const slug = (child as any)?.slug || (child as any)?.market_slug
    if (ev && slug && ev !== slug) return `https://polymarket.com/event/${ev}/${slug}`
    if (ev) return `https://polymarket.com/event/${ev}`
    if (slug) return `https://polymarket.com/event/${slug}`
    return null
  } catch { return null }
}

// Escape HTML for Telegram HTML parse_mode
function esc(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Parse a market input which may be:
// - condition id (0x...)
// - polymarket event URL
// - slug or free text
async function resolveMarketFromInput(input: string, allowFuzzy = true): Promise<any | null> {
  // Defensive: trim input immediately
  const trimmedInput = input.trim()

  const looksLikeCond = /^0x[a-fA-F0-9]{64}$/
  const looksLikeUrl = /^https?:\/\//i

  const isCondId = looksLikeCond.test(trimmedInput)
  const isUrl = looksLikeUrl.test(trimmedInput)

  logger.info('resolveMarketFromInput: input analysis', {
    originalLength: input.length,
    trimmedLength: trimmedInput.length,
    firstChars: trimmedInput.slice(0, 30),
    isCondId,
    isUrl,
    allowFuzzy
  })

  try {
    // 1. Try condition ID (0x...)
    if (isCondId) {
      logger.info('resolveMarketFromInput: detected condition ID')
      return await gammaApi.getMarket(trimmedInput)
    }

    // 2. Try URL
    if (isUrl) {
      logger.info('resolveMarketFromInput: detected URL, parsing...')
      try {
        const u = new URL(trimmedInput)
        const parts = u.pathname.split('/').filter(Boolean)
        // Expect /event/<event-slug> or /event/<event-slug>/<market-slug>
        const idx = parts.findIndex(p=>p==='event')
        if (idx >= 0 && parts[idx+1]) {
          // If there's a market slug (parts[idx+2]), use that first
          // Example: /event/maduro-out-in-2025/maduro-out-in-2025-411
          //          parts[0]=event, parts[1]=event-slug, parts[2]=market-slug
          let slug = parts[idx+2] ? decodeURIComponent(parts[idx+2]) : decodeURIComponent(parts[idx+1])
          logger.info('resolveMarketFromInput: extracted slug from URL', { slug, hasMarketSlug: !!parts[idx+2] })

          // Try to find market by slug first
          const m = await findMarket(slug)
          if (m) return m

          // If not found, this might be an event page with multiple markets
          // Scrape the page to get the first market
          try {
            const controller = new AbortController()
            const timeout = setTimeout(() => controller.abort(), 7000)
            const resp = await fetch(trimmedInput, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; smtm-bot/1.0)' },
              signal: controller.signal
            })
            clearTimeout(timeout)
            if (resp.ok) {
              const html = await resp.text()
              const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/)
              if (match && match[1]) {
                const nextData = JSON.parse(match[1])
                const queries = nextData?.props?.pageProps?.dehydratedState?.queries || []
                // Try to find a markets array and pick the heaviest by volume/liquidity
                let candidates: any[] = []
                for (const query of queries) {
                  const data = query?.state?.data
                  if (Array.isArray(data) && data.length && (data[0]?.slug || data[0]?.market_slug)) {
                    candidates = data
                    break
                  }
                }
                if (candidates.length) {
                  const ranked = [...candidates].map((m:any)=>({ m, vol: Number(m.volume||0), liq: Number(m.liquidity||0) }))
                  ranked.sort((a,b)=> (b.vol||0) - (a.vol||0) || (b.liq||0) - (a.liq||0))
                  const best = ranked[0]?.m
                  const bestSlug = best?.slug || best?.market_slug
                  if (bestSlug) {
                    logger.info('resolveMarketFromInput: picked best sub-market from event', { slug: bestSlug })
                    const fullMarket = await findMarket(bestSlug)
                    if (fullMarket) return fullMarket
                  }
                }
              }
            }
          } catch (scrapeErr) {
            logger.error('resolveMarketFromInput: scraping event page failed', { error: (scrapeErr as any)?.message })
          }
        }
      } catch {}
    }

    // 3. Fallback to fuzzy search/slug resolution (only if allowed)
    if (allowFuzzy) {
      logger.info('resolveMarketFromInput: trying fuzzy search fallback', { input: trimmedInput })
      return await findMarket(trimmedInput)
    }

    logger.warn('resolveMarketFromInput: input not recognized as URL or ID', {
      input: trimmedInput,
      originalInput: input
    })
    return null
  } catch (e) {
    logger.error('resolveMarketFromInput failed', {
      input: trimmedInput,
      originalInput: input,
      error: (e as any)?.message,
      stack: (e as any)?.stack
    })
    return null
  }
}

export function registerCommands(bot: Telegraf) {
  // Start command
  bot.command('start', async (ctx) => {
    logger.info('User started bot', { userId: ctx.from?.id });
    await ctx.reply(
      'Welcome to SMTM 🎯\n\n' +
        'Quick actions:\n' +
        '• /alpha [market] — freshest whale/skew/insider\n' +
        '• /markets [query] — trending, breaking, new, or search\n' +
        '• /whales [query] — leaderboard or search traders\n' +
        '• /price <market> — detailed price info\n' +
        '• /overview <market> — orderbook & positions\n' +
        '• /follow 0x<market_id> — price alerts\n' +
        '• /list — view your follows\n\n' +
        'More commands: /help',
      {
        reply_markup: {
          keyboard: [
            [{ text: '/alpha' }, { text: '/markets' }],
            [{ text: '/whales' }, { text: '/price' }],
            [{ text: '/list' }, { text: '/help' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        } as any
      }
    );
  });

  // Inline button handler for alpha pagination (basic) and follow actions
  // Note: defer alpha:more:trade to the advanced handler below
  bot.on('callback_query', async (ctx, next) => {
    try {
      const data = (ctx.callbackQuery as any)?.data as string | undefined
      if (!data) return await next()
      // Smart Skew (markets)
      if (data.startsWith('skew:') || data.startsWith('skw:')) {
        const raw = data.split(':')[1]
        let cond = raw
        // Decode base64url token if using compact form (skw:)
        if (data.startsWith('skw:')) {
          const dec = tokenToCond(raw)
          if (dec) cond = dec
        }
        if (!cond) { await ctx.answerCbQuery('Missing market id'); return }
        await ctx.answerCbQuery('Calculating skew…')
        // Fetch market with explicit error handling to avoid parser confusion around try/catch nesting
        let m: any
        try {
          m = await gammaApi.getMarket(cond)
        } catch (e) {
          logger.warn('skew: market fetch failed', { err: (e as any)?.message })
          await ctx.reply('❌ Failed to load market. Try again later.')
          return
        }
        try {
          // If this market belongs to an event with multiple dates on the same page,
          // prefer parsing the group (event+market) page first. Fallback to event-wide search only if needed.
          const eventSlug = Array.isArray(m?.events) && m.events.length ? m.events[0]?.slug : undefined
          if (eventSlug) {
            // Try group page first (most series are one page with date toggles)
            let expanded = false
            try {
              const marketSlug = (m as any)?.slug || (m as any)?.market_slug
              if (marketSlug) {
                const groupUrl = `https://polymarket.com/event/${eventSlug}/${marketSlug}`
                const groupChildren = await getGroupSubMarkets(groupUrl)
                // Sort by end date ascending (soonest first)
                const gc = Array.isArray(groupChildren)
                  ? groupChildren
                      .filter(c=>c?.conditionId)
                      .map((c:any)=>{
                        let ts: number | null = null
                        try {
                          const v = (c as any).end_date_iso || (c as any).endDateIso
                          const t = v ? Date.parse(String(v)) : NaN
                          ts = Number.isFinite(t) ? t : null
                        } catch {}
                        return { ...c, _endTs: ts }
                      })
                      .sort((a:any,b:any)=>{
                        const ax = a._endTs ?? Number.POSITIVE_INFINITY
                        const bx = b._endTs ?? Number.POSITIVE_INFINITY
                        return ax - bx
                      })
                      .slice(0, 8)
                  : []
                if (gc.length > 1) {
                  for (const ch of gc) {
                    try {
                      const cid = ch.conditionId
                      let y = (ch.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
                      let n = (ch.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
                      if (!y || !n) {
                        try {
                          const m2 = await gammaApi.getMarket(cid)
                          y = (m2.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
                          n = (m2.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
                        } catch {}
                      }
                      if (!y || !n) continue
                      const res = await getSmartSkew(cid, y, n)
                      if (!res) continue
                      const ev = (ch as any).eventSlug || eventSlug
                      const url = ev && ch.slug && ev !== ch.slug
                        ? `https://polymarket.com/event/${ev}/${ch.slug}`
                        : `https://polymarket.com/event/${ch.slug || ev}`
                      const dIso = (ch as any).end_date_iso || (ch as any).endDateIso
                      const dateStr = dIso ? formatDateYYYYMMDD(dIso) : null
                      const baseTitle = ch.question || ch.slug || (m?.question || 'Market')
                      const title = dateStr ? `${baseTitle} (${dateStr})` : baseTitle
                      let card = formatSkewCard(title, url, res, false)
                      try {
                        const exs: any[] = Array.isArray((res as any).examples) ? (res as any).examples : []
                        if (exs.length) {
                          const insights = await analyzeSkewExamples(exs)
                          const bits: string[] = []
                          if (insights.hiReturn > 0) bits.push(`High‑return whales: ${insights.hiReturn}`)
                          if (insights.newBig > 0) bits.push(`New big bets: ${insights.newBig} • ⚠️ Possible insider? (informational)`)
                          if (bits.length) card += `\n${bits.join(' • ')}`
                        }
                      } catch {}
                      await ctx.reply(card, { parse_mode: 'HTML' })
                    } catch {}
                  }
                  expanded = true
                  return
                }
              }
            } catch {}

            // Fallback A: parse the event page itself to enumerate children (captures cross-event siblings shown on the same page)
            if (!expanded) {
              try {
                const eventUrl = `https://polymarket.com/event/${eventSlug}`
                const childrenRaw = await getEventSubMarkets(eventUrl)
                const children = Array.isArray(childrenRaw) ? childrenRaw.filter(c=>c?.conditionId).slice(0, 8) : []
                if (children.length > 1) {
                  // Sort by end date ascending
                  const sorted = children.map((c:any)=>{
                    let ts: number | null = null
                    try { const v=c.end_date_iso || (c as any).endDateIso; const t=v?Date.parse(String(v)):NaN; ts=Number.isFinite(t)?t:null } catch {}
                    return { ...c, _endTs: ts }
                  }).sort((a:any,b:any)=> (a._endTs ?? Number.POSITIVE_INFINITY) - (b._endTs ?? Number.POSITIVE_INFINITY))
                  for (const ch of sorted) {
                    try {
                      const cid = ch.conditionId
                      let y: string | undefined = undefined
                      let n: string | undefined = undefined
                      const toks: any[] = Array.isArray((ch as any).tokens) ? (ch as any).tokens as any[] : []
                      if (toks.length) {
                        y = toks.find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
                        n = toks.find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
                      }
                      if (!y || !n) {
                        try {
                          const m2 = await gammaApi.getMarket(cid)
                          y = (m2.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
                          n = (m2.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
                        } catch {}
                      }
                      if (!y || !n) continue
                      const res = await getSmartSkew(cid, y, n)
                      if (!res) continue
                      const url = buildChildMarketUrl(ch, eventSlug)
                      const dIso = (ch as any).end_date_iso || (ch as any).endDateIso
                      const dateStr = dIso ? formatDateYYYYMMDD(dIso) : null
                      const baseTitle = ch.question || ch.slug || (m?.question || 'Market')
                      const title = dateStr ? `${baseTitle} (${dateStr})` : baseTitle
                      let card = formatSkewCard(title, url, res, false)
                      try {
                        const exs: any[] = Array.isArray((res as any).examples) ? (res as any).examples : []
                        if (exs.length) {
                          const insights = await analyzeSkewExamples(exs)
                          const bits: string[] = []
                          if (insights.hiReturn > 0) bits.push(`High‑return whales: ${insights.hiReturn}`)
                          if (insights.newBig > 0) bits.push(`New big bets: ${insights.newBig} • ⚠️ Possible insider? (informational)`)
                          if (bits.length) card += `\n${bits.join(' • ')}`
                        }
                      } catch {}
                      await ctx.reply(card, { parse_mode: 'HTML' })
                    } catch {}
                  }
                  return
                }
              } catch {}
            }

            // Fallback B: event-wide API expansion (rare multi-event cases)
            if (!expanded) {
              const timeoutPromise = new Promise<never>((_, reject)=> setTimeout(()=>reject(new Error('getMarketsByEvent timeout')), 10000))
              const childrenRaw = await Promise.race([
                getMarketsByEvent(eventSlug),
                timeoutPromise,
              ]).catch(()=>[] as any[])
              // Sort by end date ascending (soonest first)
              const children = Array.isArray(childrenRaw)
                ? childrenRaw
                    .filter((c:any)=>c?.conditionId)
                    .map((c:any)=>{
                      let ts: number | null = null
                      try {
                        const v = (c as any).end_date_iso || (c as any).endDateIso
                        const t = v ? Date.parse(String(v)) : NaN
                        ts = Number.isFinite(t) ? t : null
                      } catch {}
                      return { ...c, _endTs: ts }
                    })
                    .sort((a:any,b:any)=>{
                      const ax = a._endTs ?? Number.POSITIVE_INFINITY
                      const bx = b._endTs ?? Number.POSITIVE_INFINITY
                      return ax - bx
                    })
                    .slice(0, 6)
                : []
              if (children.length > 1) {
                // Compute each child skew and reply separate cards
                for (const ch of children) {
                  try {
                    const cid = ch.conditionId
                  const yes = (ch.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
                  const no  = (ch.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
                  let y = yes, n = no
                  if (!y || !n) {
                    try {
                      const m2 = await gammaApi.getMarket(cid)
                      y = (m2.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
                      n = (m2.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
                    } catch {}
                  }
                  if (!y || !n) continue
                  const res = await getSmartSkew(cid, y, n)
                  if (!res) continue
                  const ev = (ch as any).eventSlug || eventSlug
                  const url = ev && ch.slug && ev !== ch.slug
                    ? `https://polymarket.com/event/${ev}/${ch.slug}`
                    : `https://polymarket.com/event/${ch.slug || ev}`
                  const dIso = (ch as any).end_date_iso || (ch as any).endDateIso
                  const dateStr = dIso ? formatDateYYYYMMDD(dIso) : null
                  const baseTitle = ch.question || ch.slug || (m?.question || 'Market')
                  const title = dateStr ? `${baseTitle} (${dateStr})` : baseTitle
                  let card = formatSkewCard(title, url, res, false)
                  try {
                    const exs: any[] = Array.isArray((res as any).examples) ? (res as any).examples : []
                    if (exs.length) {
                      const insights = await analyzeSkewExamples(exs)
                      const bits: string[] = []
                      if (insights.hiReturn > 0) bits.push(`High‑return whales: ${insights.hiReturn}`)
                      if (insights.newBig > 0) bits.push(`New big bets: ${insights.newBig} • ⚠️ Possible insider? (informational)`)
                      if (bits.length) card += `\n${bits.join(' • ')}`
                    }
                  } catch {}
                  await ctx.reply(card, { parse_mode: 'HTML' })
                } catch {}
              }
              }
              return
            }
          }
          // Single-market fallback (original behavior)
          const url = getPolymarketMarketUrl(m)
          const yes = (m.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
          const no = (m.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
          const res = await getSmartSkew(cond, yes, no)
          if (!res) { await ctx.reply('⚠️ Not enough data to assess skew.'); return }
          let card = formatSkewCard(m.question || 'Market', url, res, false)
          try {
            const exs: any[] = Array.isArray((res as any).examples) ? (res as any).examples : []
            if (exs.length) {
              const insights = await analyzeSkewExamples(exs)
              const bits: string[] = []
              if (insights.hiReturn > 0) bits.push(`High‑return whales: ${insights.hiReturn}`)
              if (insights.newBig > 0) bits.push(`New big bets: ${insights.newBig} • ⚠️ Possible insider? (informational)`) // cautious wording
              if (bits.length) card += `\n${bits.join(' • ')}`
            }
          } catch {}
          await ctx.reply(card, { parse_mode: 'HTML' })
        } catch (e) {
          logger.warn('skew: handler failed', { err: (e as any)?.message })
          await ctx.reply('❌ Failed to compute skew. Try again later.')
        }
        return
      }
      // Alpha pagination
      if (data.startsWith('alpha:more:')) {
        const parts = data.split(':')
        // Hand off special "trade" path to the advanced handler
        if (parts[2] === 'trade') return await next()
        await ctx.answerCbQuery('Loading more alpha...')
        const offset = Number.isFinite(parseInt(parts[2] || '1', 10)) ? parseInt(parts[2] || '1', 10) : 1
        const tokenIdsArg = parts[3] ? parts[3].split(',') : undefined
        const { AlphaAggregator } = await import('../services/alpha-aggregator')
        const list = AlphaAggregator.getLatest(offset + 1, tokenIdsArg)
        if (list.length <= offset) {
          await ctx.reply('No more alpha right now. Check back soon!')
          return
        }
        const a = list[list.length - 1 - offset]
        const title = a.marketName || 'Alpha'
        const wallet = a.wallet ? (a.wallet.slice(0,6)+'...'+a.wallet.slice(-4)) : ''
        let msg = `✨ <b>${title}</b>\n\n`
        if (a.kind === 'whale') {
          const rec = a.data?.recommendation ? ` (${a.data.recommendation})` : ''
          msg += `🐋 Whale Alpha: <b>${a.alpha}</b>${rec}\n`
          if (a.data?.whaleScore != null) msg += `WhaleScore: ${a.data.whaleScore}\n`
          if (a.data?.weightedNotionalUsd != null) msg += `Value: $${Number(a.data.weightedNotionalUsd).toLocaleString()}\n`
          if (wallet) msg += `Wallet: <code>${wallet}</code>\n`
        } else if (a.kind === 'smart_skew') {
          msg += `⚖️ Smart-Skew Alpha: <b>${a.alpha}</b>\n${a.summary}\n`
        } else if (a.kind === 'insider') {
          msg += `🕵️ Insider Alpha: <b>${a.alpha}</b>\n${a.summary}\n`
        }
        const when = new Date(a.ts).toISOString().replace('T',' ').slice(0, 19) + 'Z'
        msg += `\n🕒 ${when}`
        const nextOffset = offset + 1
        const kb = { inline_keyboard: [[{ text: 'More', callback_data: `alpha:more:${nextOffset}${tokenIdsArg && tokenIdsArg.length?':'+tokenIdsArg.join(','):''}` }]] }
        await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb as any })
        return
      }
      // Survey responses (interest poll) - HIDDEN: Auth not ready yet
      // if (data.startsWith('survey:')) {
      //   const answer = data.slice('survey:'.length) as 'yes'|'maybe'|'no'
      //   const userId = ctx.from!.id
      //   const uname = ctx.from?.username || undefined
      //   await recordSurveyResponse(userId, uname, answer)
      //   await ctx.answerCbQuery('✅ Thanks for your feedback!')
      //   try {
      //     await ctx.reply(
      //       answer === 'yes'
      //         ? '🚀 Noted! We\'ll ping you when arbitrage & spread farming goes live.'
      //         : answer === 'maybe'
      //         ? '👍 Got it — we\'ll keep you posted as it shapes up.'
      //         : '🙏 Thanks! Appreciate the signal.'
      //     )
      //   } catch {}
      //   return
      // }

      // Handle "Show More" for whales leaderboard
      if (data.startsWith('whales:showmore:')) {
        await ctx.answerCbQuery('Loading more traders...')
        try {
          // Parse offset from callback data (e.g., 'whales:showmore:2')
          const offset = parseInt(data.split(':')[2] || '0', 10)

          const leaderboard = await dataApi.getLeaderboard({ limit: 10 })
          if (!leaderboard || leaderboard.length === 0) {
            await ctx.reply('❌ Unable to load more traders. Try again later.')
            return
          }

          let msg = '🐳 Top Traders (by PnL)\n\n'
          const keyboard: { text: string; callback_data: string }[][] = []

          // Show 1 more trader at a time
          const batchSize = 1
          const displayEnd = Math.min(offset + batchSize, leaderboard.length)
          const remaining = leaderboard.length - displayEnd

          for (let idx = offset; idx < displayEnd; idx++) {
            const entry = leaderboard[idx]
            const i = idx + 1
            const short = entry.user_id.slice(0,6)+'...'+entry.user_id.slice(-4)
            const name = entry.user_name || 'Anonymous'
            const pnl = entry.pnl > 0 ? `+$${Math.round(entry.pnl).toLocaleString()}` : `-$${Math.abs(Math.round(entry.pnl)).toLocaleString()}`
            const vol = `$${Math.round(entry.vol).toLocaleString()}`
            const profileUrl = getPolymarketProfileUrl(entry.user_name, entry.user_id)

            // Fetch win rate
            let winRateStr = '—'
            let winRateNum = 0
            try {
              const { winRate } = await dataApi.getUserWinRate(entry.user_id, 500)
              if (winRate > 0) {
                winRateNum = winRate
                winRateStr = `${winRate.toFixed(1)}%`
              }
            } catch (e) {
              logger.warn('Failed to fetch win rate', { user: entry.user_id, error: (e as any)?.message })
            }
            // Compute whale score and generate description (windowed stats)
            let whaleScoreStr = '—'
            let whaleDescription = ''
            try {
              const { getWalletWhaleStats, computeWhaleScore, generateWhaleDescription, buildDescriptionInput } = await import('@smtm/data')
              const stats = await getWalletWhaleStats(entry.user_id, { windowMs: 6*60*60*1000, maxEvents: 500 })
              const whaleScore = computeWhaleScore(stats, {})
              whaleScoreStr = `${Math.round(whaleScore)}`

              // Fetch additional data for description
              let portfolioValue = 0
              let totalPositions = 0
              try {
                const userValue = await dataApi.getUserValue(entry.user_id)
                portfolioValue = parseFloat(String(userValue?.value || '0'))
                totalPositions = userValue?.positions_count || 0
              } catch {}

              // Determine if new wallet
              const isNewWallet = totalPositions <= 5

              // Build description input
              const descInput = buildDescriptionInput({
                whaleScore,
                pnl: entry.pnl,
                winRate: winRateNum,
                avgBetSize: stats.avgBetUsd,
                tradesPerHour: stats.tradesPerHour,
                portfolioValue,
                accountAgeDays: null,
                totalTrades: stats.sampleCount,
                isNewWallet,
              })

              // Generate description for leaderboard whales
              if (stats.sampleCount >= 5 || whaleScore >= 40) {
                whaleDescription = generateWhaleDescription(descInput, { context: 'leaderboard' })
              }
            } catch {}
            msg += `${i}. ${name} (${short})\n`
            msg += `   💰 PnL: ${pnl} (Ranked) | Vol: ${vol}\n`
            msg += `   🎯 Win Rate: ${winRateStr} • 🐋 Whale Score: ${whaleScoreStr}\n`
            if (whaleDescription) {
              msg += `   \n   ${whaleDescription}\n`
            }
            msg += `   🔗 ${profileUrl}\n\n`

            // Add buttons: Follow and Detailed Stats (on same row)
            const buttons: { text: string; callback_data: string }[] = []
            try {
              const tok = await actionFollowWhaleAll(entry.user_id)
          buttons.push({ text: `Follow`, callback_data: `act:${tok}` })
            } catch {}
            buttons.push({ text: `Stats`, callback_data: `whale:stats:${entry.user_id}` })

            // Add "Give me 1 more" on same row if there are more traders
            if (remaining > 0) {
            buttons.push({ text: `More`, callback_data: `whales:showmore:${displayEnd}` })
            }

            keyboard.push(buttons)
          }

          msg += '💡 Tap 🐳 Follow to get alerts, or 📊 Stats for accurate all-time PnL.'
          await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } as any })
        } catch (e: any) {
          logger.error('whales:showmore: failed to load leaderboard', { error: e?.message })
          await ctx.reply('❌ Unable to load more traders. Try again later.')
        }
        return
      }

      // Handle "Detailed Stats" for whale traders
      if (data.startsWith('whale:stats:')) {
        await ctx.answerCbQuery('Calculating accurate PnL...')
        try {
          const userId = data.split(':')[2]
          if (!userId) {
            await ctx.reply('❌ Invalid trader ID')
            return
          }

          // Fetch accurate PnL
          const { totalPnL, realizedPnL, unrealizedPnL, currentValue } = await dataApi.getUserAccuratePnL(userId)

          // Fetch win rate
          const { wins, total, winRate } = await dataApi.getUserWinRate(userId, 500)

          // Get profile info
          const short = userId.slice(0, 6) + '...' + userId.slice(-4)
          const profileUrl = getPolymarketProfileUrl(null, userId)

          // Format numbers
          const formatPnL = (pnl: number) => {
            if (pnl >= 0) {
              return `+$${Math.round(pnl).toLocaleString()}`
            } else {
              return `-$${Math.abs(Math.round(pnl)).toLocaleString()}`
            }
          }

          let msg = `📊 Detailed Trader Stats\n\n`
          msg += `Trader: ${short}\n`
          msg += `🔗 ${profileUrl}\n\n`
          msg += `💰 All-Time PnL: ${formatPnL(totalPnL)}\n`
          msg += `   ├─ Realized: ${formatPnL(realizedPnL)}\n`
          msg += `   └─ Unrealized: ${formatPnL(unrealizedPnL)}\n\n`
          msg += `💎 Current Value: $${Math.round(currentValue).toLocaleString()}\n`
          msg += `🎯 Win Rate: ${winRate.toFixed(1)}% (${wins}/${total} markets)\n\n`
          msg += `ℹ️ Note: Leaderboard uses ranked PnL, which may differ from all-time PnL.`

          const keyboard: { text: string; callback_data: string }[][] = []
          try {
            const tok = await actionFollowWhaleAll(userId)
            keyboard.push([{ text: `Follow`, callback_data: `act:${tok}` }])
          } catch {}

          await ctx.reply(msg, { reply_markup: { inline_keyboard: keyboard } as any })
        } catch (e: any) {
          logger.error('whale:stats: failed to fetch detailed stats', { error: e?.message })
          await ctx.reply('❌ Unable to load detailed stats. Try again later.')
        }
        return
      }

      // Handle "Show More" for markets
      if (data.startsWith('markets:showmore:')) {
        await ctx.answerCbQuery('Loading more markets...')
        try {
          // Parse segment and offset from callback data (e.g., 'markets:showmore:trending:1')
          const parts = data.split(':')
          const segment = parts[2] || 'trending'
          const offset = parseInt(parts[3] || '0', 10)

          // Re-fetch markets based on segment (same logic as /markets command)
          let markets: any[] = []
          let orderBy: 'volume' | 'liquidity' | 'volume_24hr' | 'end_date_min' = 'volume'

          // Note: Gamma API only reliably supports 'volume' and 'liquidity' ordering
          // Always use 'volume' and do client-side sorting for other segments
          orderBy = 'volume'

          // For breaking and ending, fetch more markets to calculate/sort
          const fetchLimit = (segment === 'breaking' || segment === 'ending') ? 50 : 20

          try {
            markets = await gammaApi.getActiveMarkets(fetchLimit, orderBy)
          } catch (inner: any) {
            logger.error('markets:showmore: gammaApi active failed', { error: inner?.message })
            await ctx.reply('❌ Unable to load more markets. Try again later.')
            return
          }

          // Apply filters (same as command)
          const now = Date.now()
          const minLiquidity = parseFloat(process.env.MARKET_MIN_LIQUIDITY || '1000')
          const minVolume = parseFloat(process.env.MARKET_MIN_VOLUME || '1000')
          markets = markets.filter((m: any) => {
            const active = m?.active === true
            const closed = m?.closed === true
            const resolved = m?.resolved === true
            const archived = m?.archived === true
            const endIso = m?.end_date_iso || m?.endDateIso || m?.endDate || m?.end_date
            const endTime = endIso ? Date.parse(endIso) : NaN
            const futureEnd = Number.isFinite(endTime) && endTime > now
            const liq = parseFloat(m?.liquidity || '0')
            const hasLiq = !Number.isNaN(liq) && liq >= minLiquidity
            const vol = parseFloat(m?.volume || '0')
            const hasVol = !Number.isNaN(vol) && vol >= minVolume
            return active && !closed && !resolved && !archived && futureEnd && hasLiq && hasVol
          })

          // Apply segment-specific filtering
          if (segment === 'new') {
            const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
            markets = markets.filter((m: any) => {
              const createdAt = m?.createdAt ? Date.parse(m.createdAt) : NaN
              return Number.isFinite(createdAt) && createdAt > sevenDaysAgo
            })
          } else if (segment === 'breaking') {
            // Calculate 24hr price changes and sort by magnitude (same as main command)
            const marketsWithChange = await Promise.all(
              markets.slice(0, 30).map(async (m: any) => {
                try {
                  const tokenId = m?.tokens?.[0]?.token_id
                  if (!tokenId) return { market: m, priceChange: 0 }

                  const history = await clobApi.getPricesHistory({ market: tokenId, interval: '1d', fidelity: 10 })
                  if (!history?.history || history.history.length < 2) {
                    return { market: m, priceChange: 0 }
                  }

                  const oldPrice = history.history[0].p
                  const newPrice = history.history[history.history.length - 1].p
                  const priceChange = Math.abs(newPrice - oldPrice)

                  return { market: m, priceChange }
                } catch (error) {
                  return { market: m, priceChange: 0 }
                }
              })
            )

            markets = marketsWithChange
              .sort((a, b) => b.priceChange - a.priceChange)
              .map(item => item.market)
          } else if (segment === 'ending') {
            // Sort by end_date_iso (ascending - soonest first)
            markets = markets.sort((a: any, b: any) => {
              const aEnd = a?.end_date_iso || a?.endDateIso || a?.endDate || a?.end_date
              const bEnd = b?.end_date_iso || b?.endDateIso || b?.endDate || b?.end_date
              const aTime = aEnd ? Date.parse(aEnd) : Infinity
              const bTime = bEnd ? Date.parse(bEnd) : Infinity
              return aTime - bTime
            })
          }

          if (markets.length === 0) {
            await ctx.reply('❌ No more markets available.')
            return
          }

          // Show 1 more market at a time
          const batchSize = 1
          const displayEnd = Math.min(offset + batchSize, markets.length)
          const remaining = markets.length - displayEnd
          const displayMarkets = markets.slice(offset, displayEnd)

          const segmentLabels: Record<string, string> = {
            'trending': '📈 Trending',
            'breaking': '⚡ Breaking',
            'new': '🆕 New',
            'ending': '⏰ Ending Soon'
          }
          const displayLabel = segmentLabels[segment] || '📈 Trending'

          let message = `${esc(displayLabel)}\n\n`
          const keyboard: { text: string; callback_data: string }[][] = []

          let followButton: { text: string; callback_data: string } | null = null
          let skewButton: { text: string; callback_data: string } | null = null
          for (let i = offset; i < displayEnd; i++) {
            const market = markets[i]
            const idx = i + 1
            const title = esc(String(market.question || 'Untitled market'))

            // Parse outcome prices
            let priceNum = NaN
            try {
              const outcomePrices = market?.outcomePrices || market?.tokens?.[0]?.price
              if (typeof outcomePrices === 'string') {
                const prices = JSON.parse(outcomePrices)
                if (Array.isArray(prices) && prices.length > 0) {
                  priceNum = parseFloat(prices[0])
                }
              } else if (typeof outcomePrices === 'number') {
                priceNum = outcomePrices
              }
            } catch {}
            const price = isNaN(priceNum) ? 'N/A' : (priceNum * 100).toFixed(1)

            // Format volume
            const volNum = typeof market.volume === 'number' ? market.volume : parseFloat(market.volume || '0')
            let volDisplay = '—'
            if (!isNaN(volNum)) {
              if (volNum >= 1_000_000) {
                volDisplay = `$${(volNum / 1_000_000).toFixed(1)}M`
              } else if (volNum >= 1_000) {
                volDisplay = `$${(volNum / 1_000).toFixed(1)}K`
              } else {
                volDisplay = `$${Math.round(volNum)}`
              }
            }

            // Format liquidity
            const liqNum = typeof market.liquidity === 'number' ? market.liquidity : parseFloat(market.liquidity || '0')
            let liqDisplay = '—'
            if (!isNaN(liqNum)) {
              if (liqNum >= 1_000_000) {
                liqDisplay = `$${(liqNum / 1_000_000).toFixed(2)}M`
              } else if (liqNum >= 1_000) {
                liqDisplay = `$${(liqNum / 1_000).toFixed(1)}K`
              } else {
                liqDisplay = `$${Math.round(liqNum)}`
              }
            }

            // Get condition id
            let cond: string | null = market?.conditionId || market?.condition_id || null
            if (!cond) {
              try {
                const via = market?.market_slug || market?.slug || title
                cond = await gammaApi.findConditionId(String(via))
              } catch {}
            }

            const url = getPolymarketMarketUrl(market)
            message += `${idx}. ${title}\n`
            message += `   📊 Price: ${price}%\n`
            message += `   💰 Volume: ${volDisplay}\n`
            message += `   🧊 Liquidity: ${liqDisplay}\n`
            // Optional skew badge from cache
            if (cond) {
              const cached = SkewCache.get(cond)
              const badge = cached ? formatSkewBadge(cached.result) : null
              if (badge) message += `   ${badge}\n`
            }
            if (url) { message += `   🔗 ${esc(url)}\n` }
            if (cond) {
              message += `   ➕ Follow: <code>/follow ${esc(cond)}</code>\n\n`
              try {
                const tok = await actionFollowMarket(cond, market.question || 'Market')
                if (String(`act:${tok}`).length <= 64) {
                  followButton = { text: `Follow`, callback_data: `act:${tok}` }
                }
            const cbt = condToToken(cond)
            const cb = `skw:${cbt}`
            if (cbt && cb.length <= 64) {
              skewButton = { text: 'Skew', callback_data: cb }
            }
              } catch {}
            } else {
              message += `   ➕ Follow: <code>${esc('/follow <copy market id from event>')}</code>\n\n`
            }
          }

          // Add buttons on same row: Follow + Smart Skew + "Give me 1 more"
          const buttonRow: { text: string; callback_data: string }[] = []
          if (followButton) {
            buttonRow.push(followButton)
          }
          if (skewButton) {
            buttonRow.push(skewButton)
          }
          if (remaining > 0) {
        buttonRow.push({ text: `More`, callback_data: `markets:showmore:${segment}:${displayEnd}` })
          }
          if (buttonRow.length > 0) {
            keyboard.push(buttonRow)
          }

          message += '💡 Tap Follow to get alerts for any of these markets.'
          await replySafe(ctx, message, { inline_keyboard: keyboard })
        } catch (e: any) {
          logger.error('markets:showmore: failed to load markets', { error: e?.message })
          await ctx.reply('❌ Unable to load more markets. Try again later.')
        }
        return
      }

      if (!data.startsWith('act:')) return await next()
      const id = data.slice(4)
      const rec = await resolveAction(id)
      if (!rec) { await ctx.answerCbQuery('Action expired. Try again.'); return }
      const userId = ctx.from!.id

      if (rec.type === 'follow_market') {
        const { conditionId, marketName } = rec.data
        const ok = wsMonitor.subscribePendingMarket(userId, conditionId, marketName || 'Market', botConfig.websocket.priceChangeThreshold)
        const { addMarketSubscription } = await import('../services/subscriptions')
        await addMarketSubscription(userId, '', marketName || 'Market', conditionId, botConfig.websocket.priceChangeThreshold)
        // Analytics: record resolved action type
        void logActionEvent(ctx, 'follow_market', { conditionId, marketName, ok })
        await ctx.answerCbQuery(ok ? '✅ Following market!' : 'Already following')
      } else if (rec.type === 'follow_whale_all') {
        const { address } = rec.data
        const ok = wsMonitor.subscribeToWhaleTradesAll(userId, address, botConfig.websocket.whaleTrademinSize)
        const { addWhaleSubscriptionAll } = await import('../services/subscriptions')
        await addWhaleSubscriptionAll(userId, address, botConfig.websocket.whaleTrademinSize)
        void logActionEvent(ctx, 'follow_whale_all', { address, ok })
        await ctx.answerCbQuery(ok ? '✅ Following whale (all markets)!' : 'Already following')
      } else if (rec.type === 'follow_whale_market') {
        const { address, conditionId, marketName } = rec.data
        const ok = wsMonitor.subscribePendingWhale(userId, conditionId, marketName || 'Market', botConfig.websocket.whaleTrademinSize, address)
        const { addWhaleSubscription } = await import('../services/subscriptions')
        await addWhaleSubscription(userId, '', marketName || 'Market', botConfig.websocket.whaleTrademinSize, address, conditionId)
        void logActionEvent(ctx, 'follow_whale_market', { address, conditionId, marketName, ok })
        await ctx.answerCbQuery(ok ? '✅ Following whale on market!' : 'Already following')
      } else if (rec.type === 'follow_whale_all_many') {
        const { addresses } = rec.data as { addresses: string[] }
        const userId = ctx.from!.id
        let okCount = 0
        try {
          const { addWhaleSubscriptionAll } = await import('../services/subscriptions')
          for (const addrRaw of (addresses || []).slice(0, 20)) {
            const addr = String(addrRaw || '').toLowerCase()
            if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) continue
            const ok = wsMonitor.subscribeToWhaleTradesAll(userId, addr, botConfig.websocket.whaleTrademinSize)
            if (ok) {
              okCount++
              await addWhaleSubscriptionAll(userId, addr, botConfig.websocket.whaleTrademinSize)
            }
          }
          await ctx.answerCbQuery(okCount > 0 ? `✅ Following ${okCount} whales` : 'No new follows')
          void logActionEvent(ctx, 'follow_whale_all_many', { count: okCount })
          if (okCount > 0) await ctx.reply(`✅ Following ${okCount} whales (all markets)`)
        } catch {
          await ctx.answerCbQuery('❌ Failed to follow all')
        }
      } else if (rec.type === 'unfollow_market') {
        const { tokenId, conditionId, marketName } = rec.data
        try {
          let ok = false
          if (tokenId) { ok = wsMonitor.unsubscribeFromMarket(userId, tokenId) }
          const { removeMarketSubscription, removePendingMarketByCondition } = await import('../services/subscriptions')
          if (tokenId) await removeMarketSubscription(userId, tokenId)
          if (conditionId) await removePendingMarketByCondition(userId, conditionId)
          void logActionEvent(ctx, 'unfollow_market', { tokenId, conditionId, marketName, ok })
          await ctx.answerCbQuery(`✅ Unfollowed${marketName ? ` ${marketName}` : ''}`)
        } catch {
          await ctx.answerCbQuery('❌ Failed to unfollow')
        }
      } else if (rec.type === 'unfollow_whale_all') {
        const { address } = rec.data
        try {
          wsMonitor.unsubscribeFromWhaleTradesAll(userId, address)
          const { removeWhaleSubscriptionAll } = await import('../services/subscriptions')
          await removeWhaleSubscriptionAll(userId, address)
          void logActionEvent(ctx, 'unfollow_whale_all', { address })
          await ctx.answerCbQuery('✅ Unfollowed whale (all)')
        } catch { await ctx.answerCbQuery('❌ Failed to unfollow') }
      } else if (rec.type === 'unfollow_whale_market') {
        const { address, tokenId, conditionId, marketName } = rec.data
        try {
          if (tokenId) wsMonitor.unsubscribeFromWhaleTrades(userId, tokenId)
          const { removeWhaleSubscription, removePendingWhaleByCondition } = await import('../services/subscriptions')
          if (tokenId) await removeWhaleSubscription(userId, tokenId)
          if (conditionId) await removePendingWhaleByCondition(userId, conditionId, address)
          void logActionEvent(ctx, 'unfollow_whale_market', { address, tokenId, conditionId, marketName })
          await ctx.answerCbQuery(`✅ Unfollowed${marketName ? ` ${marketName}` : ''}`)
        } catch { await ctx.answerCbQuery('❌ Failed to unfollow') }
      }
    } catch (e) {
      logger.error('callback action failed', e)
      try { await ctx.answerCbQuery('❌ Failed. Please try again.') } catch {}
    }
  })

  // Help command
  bot.command('help', async (ctx) => {
    await ctx.reply(
      '📚 SMTM Help\n\n' +
        'Discover\n' +
        '• /alpha [market] — freshest whale/skew/insider signal\n' +
        '• /markets [segment|query] — browse markets\n' +
        '   Segments: trending, breaking, new, ending\n' +
        '   e.g. /markets trending  •  /markets election\n' +
        '• /whales [query] — leaderboard or search traders\n' +
        '   Use @ for exact handle, name without @ for fuzzy\n' +
        '   e.g. /whales  •  /whales @alice  •  /whales alice\n' +
        '• /price <id|slug|keywords> — detailed price view\n' +
        '   e.g. /price 0xABC...  •  /price trump-2024\n' +
        '• /overview <market_url|id|slug> — orderbook & positions\n' +
        '   e.g. /overview https://polymarket.com/event/...\n\n' +
        'Alerts\n' +
        '• /follow 0x<market_id> — price alerts\n' +
        '• /follow 0x<wallet> — whale trades (all markets)\n' +
        '• /follow 0x<wallet> 0x<market_id> — whale on specific market\n' +
        '• /unfollow <...>  •  /list — manage follows\n\n' +
        'Analysis\n' +
        '• /profile_card [address|@username|url] — trader profile\n' +
        '   e.g. /profile_card @alice  •  /profile_card 0xABC...\n' +
        '• /stats <address|@username|url> — detailed stats\n' +
        '• /trade_card <market> <yes|no> <stake_$> [entry_%] [current_%]\n' +
        '   e.g. /trade_card trump-2024 yes 1000 65 72\n\n' +
        'Utility\n' +
        '• /status — connection status\n' +
        '• /net <market> <wallet> — net position calculator\n\n' +
        'Tip: Markets with $1K+ volume/liquidity shown. Use exact handles (@) or addresses for best results.',
      {
        reply_markup: {
          keyboard: [
            [{ text: '/markets' }, { text: '/whales' }],
            [{ text: '/list' }, { text: '/help' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        } as any
      }
    );
  });

  // Debug: send a test price alert based on an existing market subscription
  bot.command('debug_price', async (ctx) => {
    try {
      const ok = await wsMonitor.debugSendPrice(ctx.from!.id)
      if (ok) {
        await ctx.reply('✅ Sent a test price alert based on your current follows.')
      } else {
        await ctx.reply('ℹ️ No market follows found. Use /follow <conditionId> or tap Follow in markets to add one.')
      }
    } catch (e) {
      logger.error('debug_price failed', e)
      await ctx.reply('❌ Failed to send test price alert.')
    }
  })

  // Debug: send a test whale alert based on an existing whale subscription
  bot.command('debug_whale', async (ctx) => {
    try {
      const ok = await wsMonitor.debugSendWhale(ctx.from!.id)
      if (ok) {
        await ctx.reply('✅ Sent a test whale alert based on your current follows.')
      } else {
        await ctx.reply('ℹ️ No whale follows found. Use /follow or whale follow buttons to add one.')
      }
    } catch (e) {
      logger.error('debug_whale failed', e)
      await ctx.reply('❌ Failed to send test whale alert.')
    }
  })

  // Survey: gauge interest in arbitrage & spread farming feature
  // HIDDEN: Auth not ready yet
  // bot.command('survey', async (ctx) => {
  //   const text =
  //     '🧪 New Feature Survey\n\n' +
  //     'We\'re building tools to spot arbitrage and spread farming opportunities across markets.\n' +
  //     'Would you be interested in this feature?'
  //   const keyboard = {
  //     inline_keyboard: [[
  //       { text: '✅ I\'m interested', callback_data: 'survey:yes' },
  //       { text: '🤔 Maybe', callback_data: 'survey:maybe' },
  //       { text: '❌ Not interested', callback_data: 'survey:no' },
  //     ]],
  //   }
  //   await ctx.reply(text, { reply_markup: keyboard as any })
  // })

  // Link command — link Polymarket address
  // HIDDEN: Auth not ready yet
  /* bot.command('link', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    const userId = ctx.from!.id
    if (args.length === 0) {
      await ctx.reply(
        '🔗 Link your Polymarket profile to your Telegram account.\n\n' +
        'Usage:\n' +
        '• /link 0x<polymarket_address>\n' +
        '• /link https://polymarket.com/profile/0x...\n' +
        '• /link https://polymarket.com/@username\n' +
        '• /link @username\n\n' +
        'This allows commands like /stats and /profile_card to work without arguments.'
      )
      return
    }

    const input = args.join(' ').trim()
    const isAddress = /^0x[a-fA-F0-9]{40}$/.test(input)
    const looksLikeUrl = /^https?:\/\//i.test(input)

    try {
      if (isAddress) {
        await linkPolymarketAddress(userId, input)
        await ctx.reply('✅ Linked Polymarket address!\n\n💡 Try /profile_card to create your profile card.')
        return
      }

      if (looksLikeUrl) {
        const parsed = parsePolymarketProfile(input)
        if (parsed?.address) {
          await linkPolymarketAddress(userId, parsed.address)
          await ctx.reply('✅ Linked Polymarket address!\n\n💡 Try /profile_card to create your profile card.')
          return
        }
        if (parsed?.username) {
          await linkPolymarketUsername(userId, parsed.username)
          await ctx.reply(`✅ Linked Polymarket username @${parsed.username}!\n\n💡 Try /profile_card to create your profile card.`)
          return
        }
        // URL provided but couldn't parse
        await ctx.reply(
          '❌ Could not parse Polymarket profile URL.\n\n' +
          'Supported formats:\n' +
          '• https://polymarket.com/profile/0x...\n' +
          '• https://polymarket.com/@username'
        )
        return
      }

      // If starts with @, treat as Polymarket username
      if (input.startsWith('@')) {
        const username = input.slice(1)
        await linkPolymarketUsername(userId, username)
        await ctx.reply(`✅ Linked Polymarket username @${username}!\n\n💡 Try /profile_card to create your profile card.`)
        return
      }

      // Unknown format
      await ctx.reply(
        '❌ Unrecognized format.\n\n' +
        'Usage:\n' +
        '• /link 0x<address>\n' +
        '• /link https://polymarket.com/@username\n' +
        '• /link @username'
      )
    } catch (e:any) {
      logger.error('link command failed', { error: e?.message })
      await ctx.reply('❌ Failed to link. Please check the format and try again.')
    }
  }) */

  // Unlink command — remove all linked profiles
  // HIDDEN: Auth not ready yet
  /* bot.command('unlink', async (ctx) => {
    const userId = ctx.from!.id
    try {
      const removed = await unlinkAll(userId)
      if (removed > 0) {
        await ctx.reply('✅ Unlinked all profiles and reset your link settings.')
      } else {
        await ctx.reply('ℹ️ You had no linked profiles.')
      }
    } catch (e:any) {
      logger.error('unlink command failed', { error: e?.message })
      await ctx.reply('❌ Failed to unlink. Please try again.')
    }
  }) */

  // Stats command — show full profile for Polymarket
  bot.command('stats', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    const userId = ctx.from!.id
    const inputRaw = args.join(' ').trim()
    const hasAtInput = inputRaw.startsWith('@')

    const replyUsage = async () => {
      await ctx.reply(
        '📊 Stats\n\n' +
        'Usage:\n' +
        '• /stats 0x<polymarket_address>\n' +
        '• /stats https://polymarket.com/profile/<address|@username>\n' +
        '• /stats @username (exact)\n' +
        '• /stats <polymarket_username> (no @ = fuzzy)\n\n' +
        'Resolution: Exact (address/URL/@handle) vs Fuzzy (name without @).\n' +
        'Tip: /link saves your profile so you can run /stats without arguments.'
      )
    }

    try {
      let mode: 'poly_address'|'poly_username'|null = null
      let polyAddress: string | undefined
      let polyUsername: string | undefined

      if (!inputRaw) {
        const linked = await getLinks(userId)
        if (!linked) { await replyUsage(); return }
        if (linked.polymarket_address) { mode = 'poly_address'; polyAddress = linked.polymarket_address }
        else if (linked.polymarket_username) { mode = 'poly_username'; polyUsername = linked.polymarket_username }
        else { await replyUsage(); return }
      } else {
        const input = inputRaw
        if (/^0x[a-fA-F0-9]{40}$/.test(input)) { mode = 'poly_address'; polyAddress = input }
        else if (/^https?:\/\//i.test(input)) {
          const parsed = parsePolymarketProfile(input)
          if (parsed?.address) { mode = 'poly_address'; polyAddress = parsed.address }
          else if (parsed?.username) { mode = 'poly_username'; polyUsername = parsed.username }
          else { await replyUsage(); return }
        } else if (/^[a-zA-Z0-9_\-@]+$/.test(input)) {
          // Username; default to Polymarket username first
          polyUsername = input.replace(/^@/, '')
          mode = 'poly_username'
        } else {
          await replyUsage(); return
        }
      }

      // Resolve username -> address
      if (mode === 'poly_username' && polyUsername) {
        if (hasAtInput || /^https?:/i.test(inputRaw)) {
          // Exact handle/URL: no fuzzy, resolve via profile only
          try {
            const addr = await resolveUsernameToAddress(polyUsername)
            if (addr) polyAddress = addr
          } catch {}
        } else {
          // Name without @: allow fuzzy, then fallback to exact resolve
          const results = await findWhaleFuzzy(polyUsername, 1)
          if (results.length && results[0]?.user_id) {
            polyAddress = results[0].user_id
          }
          if (!polyAddress) {
            try {
              const addr = await resolveUsernameToAddress(polyUsername)
              if (addr) polyAddress = addr
            } catch {}
          }
        }
      }

      if (!polyAddress) {
        if (hasAtInput) {
          const uname = inputRaw.replace(/^@/, '')
          const url = `https://polymarket.com/@${encodeURIComponent(uname)}`
          await ctx.reply(
            '❌ Could not resolve address for that handle right now.\n\n' +
            `Profile: ${url}\n` +
            'Tip: Try again later or provide the 0x wallet address.'
          )
          return
        }
        await ctx.reply('❌ Could not resolve a Polymarket address. Try an address, profile URL, or add @ for an exact handle.')
        return
      }

      await ctx.reply('⏳ Fetching profile...')

      // Fetch value, open and closed positions
      const [value, openPositions, closed] = await Promise.all([
        dataApi.getUserValue(polyAddress),
        dataApi.getUserPositions({ user: polyAddress, limit: 200 }),
        dataApi.getClosedPositions(polyAddress, 200)
      ])

      // Realized PnL from closed positions
      let realizedPnl = 0
      for (const p of closed) {
        const rp = (p as any).realizedPnl ?? (p as any).pnl ?? 0
        const n = typeof rp === 'number' ? rp : parseFloat(String(rp))
        if (!isNaN(n)) realizedPnl += n
      }

      // Unrealized PnL on opens (best-effort)
      let openInitial = 0
      let openCurrent = 0
      for (const p of openPositions) {
        const curRaw = (p as any).value ?? (p as any).currentValue ?? 0
        const initRaw = (p as any).initial_value ?? (p as any).initialValue ?? 0
        const cur = typeof curRaw === 'number' ? curRaw : parseFloat(String(curRaw))
        const init = typeof initRaw === 'number' ? initRaw : parseFloat(String(initRaw))
        if (!isNaN(cur)) openCurrent += cur
        if (!isNaN(init)) openInitial += init
      }
      const unrealizedPnl = openCurrent - openInitial

      // Top positions by current value
      const byValue = [...openPositions].sort((a,b)=>{
        const av = (a as any).value ?? (a as any).currentValue ?? 0
        const bv = (b as any).value ?? (b as any).currentValue ?? 0
        return (typeof bv==='number'?bv:parseFloat(String(bv))) - (typeof av==='number'?av:parseFloat(String(av)))
      }).slice(0,5)

      // Resolve market titles/links for top positions
      const uniqueMarkets = Array.from(new Set(byValue.map(p=>p.market))).slice(0,5)
      const marketMap = new Map<string, any>()
      for (const m of uniqueMarkets) {
        try {
          const mk = await gammaApi.getMarket(m as any)
          marketMap.set(m, mk)
        } catch {}
      }

      // Try to enrich from leaderboard
      let leaderboardLine = ''
      try {
        const lb = await findWhaleFuzzy(polyAddress, 1)
        if (lb.length) {
          const e = lb[0]
          const pnlNum = Math.round(e.pnl)
          leaderboardLine = `Rank: #${e.rank}  •  Leaderboard PnL: ${pnlNum >= 0 ? '+' : '-'}$${Math.abs(pnlNum).toLocaleString()}\n`
        }
      } catch {}

      const short = polyAddress.slice(0,6)+'...'+polyAddress.slice(-4)
      const profileUrl = getPolymarketProfileUrl(undefined, polyAddress)
      const valNum = parseFloat(value.value || '0')
      const realized = Math.round(realizedPnl)
      const unrealized = Math.round(unrealizedPnl)
      const realizedStr = `${realized >= 0 ? '+' : '-'}$${Math.abs(realized).toLocaleString()}`
      const unrealizedStr = `${unrealized >= 0 ? '+' : '-'}$${Math.abs(unrealized).toLocaleString()}`
      const roiStr = openInitial > 0 ? `${(((openCurrent - openInitial)/openInitial)*100).toFixed(1)}%` : '—'

      let msg = `👤 Polymarket Profile\n` +
        `Address: ${short}\n` +
        `🔗 ${profileUrl}\n\n` +
        (leaderboardLine ? leaderboardLine + '\n' : '') +
        `Portfolio Value: $${Math.round(valNum).toLocaleString()}\n` +
        `Open Positions: ${openPositions.length}  •  Closed: ${closed.length}\n` +
        `Unrealized PnL: ${unrealizedStr}  •  ROI: ${roiStr}\n` +
        `Realized PnL: ${realizedStr}\n\n`

      if (byValue.length) {
        msg += 'Top Positions:\n'
        for (const p of byValue) {
          const mk = marketMap.get(p.market)
          const title = mk?.question ? mk.question.slice(0,90) + (mk.question.length>90?'...':'') : p.market
          const url = mk ? getPolymarketMarketUrl(mk) : null
          const pv = (p as any).value ?? (p as any).currentValue ?? 0
          const piv = (p as any).initial_value ?? (p as any).initialValue ?? 0
          const v = Math.round(typeof pv==='number' ? pv : parseFloat(String(pv)) || 0)
          const iv = Math.round(typeof piv==='number' ? piv : parseFloat(String(piv)) || 0)
          const upnl = v - iv
          const upnlStr = `${upnl>=0?'+':'-'}$${Math.abs(upnl).toLocaleString()}`
          msg += `• ${title}\n   Value: $${v.toLocaleString()}  •  uPnL: ${upnlStr}${url?`\n   🔗 ${url}`:''}\n`
        }
        msg += '\n'
      }

      msg += '💡 Link your profile with /link to reuse it here.'

      await ctx.reply(msg)
    } catch (e:any) {
      logger.error('stats command failed', { error: e?.message })
      await ctx.reply('❌ Failed to fetch stats. Please try again with an address or profile URL.')
    }
  })

  // Price command
  bot.command('price', async (ctx) => {
    // Handle multi-line input: split by whitespace (including newlines), filter empty, rejoin
    const rawText = ctx.message.text
    const parts = rawText.split(/\s+/).filter(Boolean) // Split by any whitespace
    const args = parts.slice(1) // Remove command

    if (args.length === 0) {
      await ctx.reply(
        'Usage:\n' +
        '• /price <market_url> — Full Polymarket URL\n' +
        '• /price 0x<market_id> — Condition ID\n' +
        '• /price <market_slug> — e.g., trump-2024\n' +
        '• /price <search_term> — Search by keywords\n\n' +
        'Tip: Use /markets to find markets'
      );
      return;
    }

    const query = args.join(' ').trim(); // Join and trim for safety
    const userId = ctx.from?.id;
    logger.info('Price command', { userId, query });

    try {
      await ctx.reply('🔍 Loading market...');

      // Use resolveMarketFromInput to handle URLs, IDs, slugs, and search
      const market = await resolveMarketFromInput(query, true); // Allow fuzzy search

      if (!market) {
        await ctx.reply(
          `❌ No match for "${query}"\n\n` +
          'Try instead:\n' +
          '• /markets to browse trending\n' +
          '• Full market URL from Polymarket\n' +
          '• Different keywords (e.g., "election")\n' +
          '• Full market ID (0x...)'
        );
        return;
      }

      const conditionId = market.condition_id || market.conditionId;

      logger.info('price: market resolved', {
        conditionId,
        hasTokens: !!market.tokens,
        tokenCount: market.tokens?.length || 0
      });

      // If tokens are missing, try re-fetching by condition ID
      if (!market.tokens || market.tokens.length === 0) {
        logger.warn('price: market has no tokens, re-fetching by condition ID', { conditionId })
        try {
          const refetchedMarket = await gammaApi.getMarket(conditionId)
          if (refetchedMarket && refetchedMarket.tokens && refetchedMarket.tokens.length > 0) {
            logger.info('price: refetched market has tokens', {
              tokenCount: refetchedMarket.tokens.length
            })
            Object.assign(market, refetchedMarket) // Merge in the tokens
          } else {
            logger.warn('price: refetched market also has no tokens')
          }
        } catch (refetchErr) {
          logger.error('price: failed to refetch market', { error: refetchErr })
        }
      }

      // Extract price data
      const question = market.question || 'Unknown market';

      // Parse outcome prices
      let outcomes: { outcome: string; price: number }[] = [];

      // Try to get prices from tokens array
      if (Array.isArray(market.tokens) && market.tokens.length > 0) {
        outcomes = market.tokens.map((t: any) => ({
          outcome: t.outcome || 'Unknown',
          price: parseFloat(t.price || '0')
        }));
      }
      // Try to parse from outcomePrices string
      else if (market.outcomePrices || market.outcomes) {
        try {
          const prices = typeof market.outcomePrices === 'string'
            ? JSON.parse(market.outcomePrices)
            : market.outcomePrices;
          const outcomeNames = typeof market.outcomes === 'string'
            ? JSON.parse(market.outcomes)
            : market.outcomes;

          if (Array.isArray(prices) && Array.isArray(outcomeNames)) {
            outcomes = outcomeNames.map((name: string, i: number) => ({
              outcome: name,
              price: parseFloat(prices[i] || '0')
            }));
          }
        } catch (parseErr) {
          logger.error('price: failed to parse outcomes', { error: parseErr });
        }
      }

      if (outcomes.length === 0) {
        await ctx.reply('⚠️ This market doesn\'t have price data yet. Try /markets for active markets.');
        return;
      }

      // Format volume and liquidity
      const volNum = typeof market.volume === 'number' ? market.volume : parseFloat(market.volume || '0');
      const volume = isNaN(volNum) ? 'N/A' : `$${(volNum / 1_000_000).toFixed(2)}M`;

      const liqNum = typeof market.liquidity === 'number' ? market.liquidity : parseFloat(market.liquidity || '0');
      const liquidity = isNaN(liqNum) ? 'N/A' : `$${(liqNum / 1_000_000).toFixed(2)}M`;

      // Format end date
      const endDateIso = market.end_date_iso || market.endDateIso || market.endDate || market.end_date;
      const endDate = endDateIso ? new Date(endDateIso).toLocaleDateString() : 'N/A';

      // Build message
      let message = `📊 ${question}\n\n`;

      // Prices
      message += '💰 Current Prices:\n';
      outcomes.forEach(({ outcome, price }) => {
        const pricePercent = (price * 100).toFixed(1);
        const bar = '▰'.repeat(Math.floor(price * 10)) + '▱'.repeat(10 - Math.floor(price * 10));
        message += `   ${outcome}: ${pricePercent}% ${bar}\n`;
      });

      message += `\n📈 Volume: ${volume}\n`;
      message += `🧊 Liquidity: ${liquidity}\n`;
      message += `📅 Ends: ${endDate}\n\n`;

      // Add market URL from API
      const marketUrl = getPolymarketMarketUrl(market);
      if (marketUrl) {
        message += `🔗 Trade: ${marketUrl}\n`;
      }

      if (conditionId) {
        message += `\n💡 Follow price alerts:\n/follow ${conditionId}`;
      }

      await ctx.reply(message);

    } catch (error: any) {
      logger.error('Error in price command', { error: error?.message || error });
      await ctx.reply('❌ Unable to load market data. Try another market or use /markets to browse.');
    }
  });

  // (removed) search command — use /markets [query] and /whales [0x<market_id>|query]

  // (removed) subscribe command

  // (removed) unsubscribe command — use /unfollow instead

  // (removed) whale command

  // Whales leaderboard (global, by market, or search)
  bot.command('whales', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    const looksLikeCond = (s: string) => /^0x[a-fA-F0-9]{64}$/.test(s)
    const minBalanceDefault = 50
    let minBalance = minBalanceDefault

    try {
      // Case A: no args — global leaderboard
      if (args.length === 0) {
        // Use Polymarket leaderboard API for top whales (much faster!)
        await ctx.reply('🔍 Loading top traders...')
        try {
          logger.info('whales: fetching leaderboard (limit=10)')
          let leaderboard = await dataApi.getLeaderboard({ limit: 10 })
          logger.info('whales: leaderboard returned', { count: leaderboard.length })

          // Soft retry once if empty (transient bot protections)
          if (leaderboard.length === 0) {
            await new Promise(r => setTimeout(r, 400));
            logger.info('whales: retrying leaderboard fetch')
            leaderboard = await dataApi.getLeaderboard({ limit: 10 })
            logger.info('whales: retry returned', { count: leaderboard.length })
          }

          if (leaderboard.length === 0) {
            // Second fallback: Supabase snapshot (top_trader_daily)
            try {
              const url = `${process.env.SUPABASE_URL}/rest/v1/top_trader_daily?select=wallet,rank&order=day_utc.desc,rank.asc&limit=10`
              const res = await fetch(url, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '' } } as any)
              if (res.ok) {
                const json:any[] = await res.json()
                if (json && json.length) {
                  let msg = '🐳 Top Traders (snapshot)\n\n'
                  const keyboard: { text: string; callback_data: string }[][] = []
                  const addresses: string[] = []
                  let i = 0
                  for (const r of json) {
                    i += 1
                    const addr = (r.wallet || '').toLowerCase()
                    const short = addr.slice(0,6)+'...'+addr.slice(-4)
                    const profileUrl = getPolymarketProfileUrl(null, addr)
                    msg += `${i}. ${short}\n   🔗 ${profileUrl}\n\n`
                    try { const tok = await actionFollowWhaleAll(addr); keyboard.push([{ text: `Follow`, callback_data: `act:${tok}` }]) } catch {}
                    addresses.push(addr)
                  }
                  try { const tokAll = await actionFollowWhaleAllMany(addresses); const cb = `act:${tokAll}`; if (cb.length<=64) keyboard.push([{ text: 'Top10', callback_data: cb }]) } catch {}
                  await ctx.reply(msg, { reply_markup: { inline_keyboard: keyboard } as any })
                  return
                }
              }
            } catch (e:any) {
              logger.error('whales: snapshot fallback failed', { error: e?.message })
            }
            await ctx.reply('❌ Unable to load leaderboard right now. Try a specific market: `/whales 0x<market_id>`\n\nBrowse: https://polymarket.com/leaderboard', { parse_mode: 'Markdown' })
            return
          }

          let msg = '🐳 Top Traders (by PnL)\n\n'
          const keyboard: { text: string; callback_data: string }[][] = []
          const addresses: string[] = []

          // Show only first whale initially for cleaner UI
          const initialDisplay = 1
          const displayCount = Math.min(initialDisplay, leaderboard.length)
          const remaining = leaderboard.length - displayCount

          let i = 0
          for (const entry of leaderboard.slice(0, displayCount)) {
            i += 1
            const short = entry.user_id.slice(0,6)+'...'+entry.user_id.slice(-4)
            const name = entry.user_name || 'Anonymous'
            const pnl = entry.pnl > 0 ? `+$${Math.round(entry.pnl).toLocaleString()}` : `-$${Math.abs(Math.round(entry.pnl)).toLocaleString()}`
            const vol = `$${Math.round(entry.vol).toLocaleString()}`
            const profileUrl = getPolymarketProfileUrl(entry.user_name, entry.user_id)

            // Fetch win rate
            let winRateStr = '—'
            let winRateNum = 0
            try {
              const { winRate } = await dataApi.getUserWinRate(entry.user_id, 500)
              if (winRate > 0) {
                winRateNum = winRate
                winRateStr = `${winRate.toFixed(1)}%`
              }
            } catch (e) {
              logger.warn('Failed to fetch win rate', { user: entry.user_id, error: (e as any)?.message })
            }

            // Fetch whale score and generate description
            let whaleScoreStr = '—'
            let whaleDescription = ''
            try {
              const { getWalletWhaleStats, computeWhaleScore, generateWhaleDescription, buildDescriptionInput } = await import('@smtm/data')
              const stats = await getWalletWhaleStats(entry.user_id, { windowMs: 6*60*60*1000, maxEvents: 500 })
              const whaleScore = computeWhaleScore(stats, {})
              whaleScoreStr = `${Math.round(whaleScore)}`

              // Fetch additional data for description
              let portfolioValue = 0
              let accountAgeDays = null
              let totalPositions = 0
              try {
                const userValue = await dataApi.getUserValue(entry.user_id)
                portfolioValue = parseFloat(String(userValue?.value || '0'))
                totalPositions = userValue?.positions_count || 0
              } catch {}

              // Determine if new wallet (simple heuristic based on positions)
              const isNewWallet = totalPositions <= 5

              // Build description input
              const descInput = buildDescriptionInput({
                whaleScore,
                pnl: entry.pnl,
                winRate: winRateNum,
                avgBetSize: stats.avgBetUsd,
                tradesPerHour: stats.tradesPerHour,
                portfolioValue,
                accountAgeDays,
                totalTrades: stats.sampleCount,
                isNewWallet,
              })

              // Generate description for leaderboard whales (always show for top traders)
              // Fallback to data quality check for edge cases
              if (stats.sampleCount >= 5 || whaleScore >= 40) {
                whaleDescription = generateWhaleDescription(descInput, { context: 'leaderboard' })
              }
            } catch (e) {
              logger.warn('Failed to fetch whale score', { user: entry.user_id, error: (e as any)?.message })
            }

            msg += `${i}. ${name} (${short})\n`
            msg += `   💰 PnL: ${pnl} (Ranked) | Vol: ${vol}\n`
            msg += `   🎯 Win Rate: ${winRateStr} • 🐋 Whale Score: ${whaleScoreStr}\n`
            if (whaleDescription) {
              msg += `   \n   ${whaleDescription}\n`
            }
            msg += `   🔗 ${profileUrl}\n\n`
            addresses.push(entry.user_id)

            // Add buttons: Follow and Detailed Stats (on same row)
            const buttons: { text: string; callback_data: string }[] = []
            try {
              const tok = await actionFollowWhaleAll(entry.user_id)
              const cb = `act:${tok}`
            if (cb.length <= 64) buttons.push({ text: `Follow`, callback_data: cb })
            } catch {}
            buttons.push({ text: `Stats`, callback_data: `whale:stats:${entry.user_id}` })
            keyboard.push(buttons)
          }

          // Add "Show More" button if there are more whales
          if (remaining > 0) {
            const nextOffset = displayCount
            keyboard.push([{ text: `More`, callback_data: `whales:showmore:${nextOffset}` }])
          }

          msg += '💡 Tap 🐳 Follow to get alerts, or 📊 Stats for accurate PnL.'
          await replySafe(ctx, msg, { inline_keyboard: keyboard })
          return
        } catch (e: any) {
          logger.error('whales: leaderboard failed', { error: e?.message })
          await ctx.reply('❌ Unable to load leaderboard. Try a specific market: `/whales 0x<market_id>`', { parse_mode: 'Markdown' })
          return
        }
      }

      // By market or fallback to whale search
      const q = args.join(' ')
      const first = args[0]
      let market: any = null
      try { market = looksLikeCond(first) ? await gammaApi.getMarket(first) : await findMarket(q) } catch {}
      if (!market) {
        await ctx.reply('🔍 Searching top traders...')
        try {
          // Explicit handling: @username and exact address
          const raw = q.trim()
          const looksAddrDirect = /^0x[a-fA-F0-9]{40}$/
          if (looksAddrDirect.test(raw)) {
            const addr = raw.toLowerCase()
            const short = addr.slice(0,6)+'...'+addr.slice(-4)
            const url = getPolymarketProfileUrl(null, addr)
            // Whale score
            let whaleScoreStr = '—'
            try {
              const { getWalletWhaleStats, computeWhaleScore } = await import('@smtm/data')
              const stats = await getWalletWhaleStats(addr, { windowMs: 6*60*60*1000, maxEvents: 500 })
              whaleScoreStr = `${Math.round(computeWhaleScore(stats, {}))}`
            } catch {}
            let message = `🐳 Trader Found\n\n`
            message += `🐋 Whale Score: ${whaleScoreStr}\n`
            message += `ID: ${addr}\n`
            message += `🔗 ${url}\n\n`
            const keyboard: { text: string; callback_data: string }[][] = []
            try { const tok = await actionFollowWhaleAll(addr); const cb = `act:${tok}`; if (cb.length<=64) keyboard.push([{ text: `Follow`, callback_data: cb }]) } catch {}
                await replySafe(ctx, message, { inline_keyboard: keyboard })
            return
          }
          const parsedForAt = parsePolymarketProfile(raw)
          const hasAtInput = raw.startsWith('@') || Boolean(parsedForAt?.username)
          if (hasAtInput) {
            const uname = (parsedForAt?.username || raw).replace(/^@/, '')
            const profileUrl = `https://polymarket.com/@${encodeURIComponent(uname)}`
            let message = `🐳 Profile\n\n`
            message += `Handle: @${uname}\n`
            message += `🔗 ${profileUrl}\n\n`
            const keyboard: { text: string; callback_data: string }[][] = []
            try {
              const addr = await resolveUsernameToAddress(uname)
              if (addr) {
                const short = addr.slice(0,6)+'...'+addr.slice(-4)
                // Whale score (after we have address)
                let whaleScoreStr = '—'
                try {
                  const { getWalletWhaleStats, computeWhaleScore } = await import('@smtm/data')
                  const stats = await getWalletWhaleStats(addr, { windowMs: 6*60*60*1000, maxEvents: 500 })
                  whaleScoreStr = `${Math.round(computeWhaleScore(stats, {}))}`
                } catch {}
                message = `🐳 Profile\n\n🐋 Whale Score: ${whaleScoreStr}\n` + message.split('\n').slice(2).join('\n')
                const tok = await actionFollowWhaleAll(addr)
                const cb = `act:${tok}`
                if (cb.length<=64) keyboard.push([{ text: `Follow`, callback_data: cb }])
              }
            } catch {}
            await ctx.reply(message, { reply_markup: keyboard.length ? { inline_keyboard: keyboard } as any : undefined as any })
            return
          }
          // Collect all potential matches before deciding what to show
          let exactMatch: any = null
          let profileMatch: { addr: string; uname: string } | null = null

          // 1. Exact match on leaderboard user_name (case-insensitive)
          try {
            const leaderboard = await dataApi.getLeaderboard({ limit: 1000 })
            const exact = (leaderboard || []).filter(e => String(e.user_name || '').toLowerCase() === q.trim().toLowerCase())
            if (exact.length > 0) {
              // If positive PnL, return immediately
              const hasPositivePnl = exact.some(e => e.pnl > 0)
              if (hasPositivePnl) {
                let message = `🐳 Search Results (${exact.length})\n\n`
                const keyboard: { text: string; callback_data: string }[][] = []
                for (let i=0;i<exact.length;i++) {
                  const whale = exact[i]
                  const name = whale.user_name || 'Anonymous'
                  const short = whale.user_id.slice(0,6)+'...'+whale.user_id.slice(-4)
                  const pnl = whale.pnl > 0 ? `+$${Math.round(whale.pnl).toLocaleString()}` : `-$${Math.abs(Math.round(whale.pnl)).toLocaleString()}`
                  const vol = `$${Math.round(whale.vol).toLocaleString()}`
                  const profileUrl = getPolymarketProfileUrl(whale.user_name, whale.user_id)
                  message += `${i+1}. ${name} (${short})\n`
                  message += `   ID: ${whale.user_id}\n`
                  message += `   💰 PnL: ${pnl} | Vol: ${vol}\n`
                  message += `   Rank: #${whale.rank}\n`
                  message += `   🔗 ${profileUrl}\n\n`
                  try { const tok = await actionFollowWhaleAll(whale.user_id); keyboard.push([{ text: `Follow`, callback_data: `act:${tok}` }]) } catch {}
                }
                await replySafe(ctx, message, { inline_keyboard: keyboard })
                return
              }
              // Save exact match with negative PnL, but continue searching
              exactMatch = exact[0]
            }
          } catch {}

          // 2. Try profile page scraping with case variations
          try {
            const uname = q.trim()
            const variations = [
              uname, // Original case
              uname.toLowerCase(), // lowercase
              uname.charAt(0).toUpperCase() + uname.slice(1).toLowerCase(), // Title case
              uname.toUpperCase(), // UPPERCASE
            ]
            // Remove duplicates
            const uniqueVariations = Array.from(new Set(variations))

            for (const variant of uniqueVariations) {
              try {
                const addr = await resolveUsernameToAddressExact(variant)
                if (addr) {
                  profileMatch = { addr, uname: variant }
                  break
                }
              } catch {}
            }
          } catch {}

          // 3. Fuzzy search by name/id (leaderboard, wide pool)
          const results = await findWhaleFuzzyWide(q.replace(/^@/, ''), 5, 1000)

          // 4. Decide what to show based on what we found
          // Priority: fuzzy results > profileMatch > exactMatch (negative PnL) > nothing
          if (results.length > 0) {
            let message = `🐳 Search Results (${results.length})\n\n`
            const keyboard: { text: string; callback_data: string }[][] = []
            for (let i=0;i<results.length;i++) {
              const whale = results[i]
              const name = whale.user_name || 'Anonymous'
              const short = whale.user_id.slice(0,6)+'...'+whale.user_id.slice(-4)
              const pnl = whale.pnl > 0 ? `+$${Math.round(whale.pnl).toLocaleString()}` : `-$${Math.abs(Math.round(whale.pnl)).toLocaleString()}`
              const vol = `$${Math.round(whale.vol).toLocaleString()}`
              const profileUrl = getPolymarketProfileUrl(whale.user_name, whale.user_id)
              message += `${i+1}. ${name} (${short})\n`
              message += `   ID: ${whale.user_id}\n`
              // Whale score
              let whaleScoreStr = '—'
              try {
                const { getWalletWhaleStats, computeWhaleScore } = await import('@smtm/data')
                const stats = await getWalletWhaleStats(whale.user_id, { windowMs: 6*60*60*1000, maxEvents: 500 })
                whaleScoreStr = `${Math.round(computeWhaleScore(stats, {}))}`
              } catch {}
              message += `   💰 PnL: ${pnl} | Vol: ${vol} • 🐋 Score: ${whaleScoreStr}\n`
              message += `   Rank: #${whale.rank}\n`
              message += `   🔗 ${profileUrl}\n\n`
              try { const tok = await actionFollowWhaleAll(whale.user_id); keyboard.push([{ text: `Follow`, callback_data: `act:${tok}` }]) } catch {}
            }
            message += '💡 Use /whales for global leaderboard or add a market id to scope.'
            await replySafe(ctx, message, { inline_keyboard: keyboard })
            return
          }

          // If no fuzzy results but we found a profile match, show it
          if (profileMatch) {
            const short = profileMatch.addr.slice(0,6)+'...'+profileMatch.addr.slice(-4)
            const profileUrl = `https://polymarket.com/@${encodeURIComponent(profileMatch.uname)}`
            let message = `🐳 Profile\n\n`
            message += `Handle: @${profileMatch.uname}\n`
            message += `ID: ${profileMatch.addr}\n`
            message += `🔗 ${profileUrl}\n\n`
            const keyboard: { text: string; callback_data: string }[][] = []
            try { const tok = await actionFollowWhaleAll(profileMatch.addr); keyboard.push([{ text: `Follow`, callback_data: `act:${tok}` }]) } catch {}
            await ctx.reply(message, { reply_markup: keyboard.length ? { inline_keyboard: keyboard } as any : undefined as any })
            return
          }

          // If we have exact match with negative PnL, show it as last resort
          if (exactMatch) {
            const whale = exactMatch
            const name = whale.user_name || 'Anonymous'
            const short = whale.user_id.slice(0,6)+'...'+whale.user_id.slice(-4)
            const pnl = whale.pnl > 0 ? `+$${Math.round(whale.pnl).toLocaleString()}` : `-$${Math.abs(Math.round(whale.pnl)).toLocaleString()}`
            const vol = `$${Math.round(whale.vol).toLocaleString()}`
            const profileUrl = getPolymarketProfileUrl(whale.user_name, whale.user_id)
            // Whale score
            let whaleScoreStr = '—'
            try {
              const { getWalletWhaleStats, computeWhaleScore } = await import('@smtm/data')
              const stats = await getWalletWhaleStats(whale.user_id, { windowMs: 6*60*60*1000, maxEvents: 500 })
              whaleScoreStr = `${Math.round(computeWhaleScore(stats, {}))}`
            } catch {}
            let message = `🐳 Exact Match\n\n`
            message += `1. ${name} (${short})\n`
            message += `   ID: ${whale.user_id}\n`
            message += `   💰 PnL: ${pnl} | Vol: ${vol} • 🐋 Score: ${whaleScoreStr}\n`
            message += `   Rank: #${whale.rank}\n`
            message += `   🔗 ${profileUrl}\n\n`
            const keyboard: { text: string; callback_data: string }[][] = []
            try { const tok = await actionFollowWhaleAll(whale.user_id); keyboard.push([{ text: `Follow`, callback_data: `act:${tok}` }]) } catch {}
            await ctx.reply(message, { reply_markup: keyboard.length ? { inline_keyboard: keyboard } as any : undefined as any })
            return
          }

          await ctx.reply('❌ No traders match your query. Try different keywords or use /whales for leaderboard.')
          return
        } catch (e:any) {
          logger.error('whales: search fallback failed', { error: e?.message })
          await ctx.reply('❌ Unable to search traders. Try again later or use /whales for leaderboard.')
          return
        }
      }
      await ctx.reply('🔍 Loading market whales...')
      const holders = await dataApi.getTopHolders({ market: market.condition_id, limit: 20, minBalance })
      const uniq = new Map<string, number>()
      holders.forEach((t)=>t.holders.forEach((h)=>{
        const bal = parseFloat(h.balance || '0')
        if (!isNaN(bal)) uniq.set(h.address, Math.max(uniq.get(h.address) || 0, bal))
      }))
      const whales = Array.from(uniq.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10)
      if (whales.length === 0) {
        await ctx.reply('❌ No whales found for this market.')
        return
      }
      // Build URL - strip date suffixes for grouped markets and numeric suffixes
      let marketSlug = market.slug || market.market_slug || '';
      marketSlug = marketSlug.replace(/-(january|february|march|april|may|june|july|august|september|october|november|december)-\d+$/i, '');
      marketSlug = marketSlug.replace(/-\d+$/, '');
      let msg = `🐳 Whales — ${market.question}\n`;
      if (marketSlug) {
        msg += `🔗 https://polymarket.com/event/${marketSlug}\n`;
      }
      msg += '\n';
      const keyboard: { text: string; callback_data: string }[][] = []
      // Enrich with whale score (sequential to avoid burst)
      for (let i=0; i<whales.length; i++) {
        const [addr, bal] = whales[i]
        const short = addr.slice(0,6)+'...'+addr.slice(-4)
        const profileUrl = getPolymarketProfileUrl(null, addr)
        // Whale score
        let whaleScoreStr = '—'
        try {
          const { getWalletWhaleStats, computeWhaleScore } = await import('@smtm/data')
          const stats = await getWalletWhaleStats(addr, { windowMs: 6*60*60*1000, maxEvents: 500 })
          whaleScoreStr = `${Math.round(computeWhaleScore(stats, {}))}`
        } catch {}
        msg += `${i+1}. ${short}  — balance: ${Math.round(bal)}\n`
        msg += `   🐋 Whale Score: ${whaleScoreStr}\n`
        msg += `   ID: ${addr}\n`
        msg += `   🔗 ${profileUrl}\n`
        msg += `   ${'<code>'+esc(`/follow ${addr}`)+'</code>'}\n`
        msg += `   ${'<code>'+esc(`/follow ${addr} ${market.condition_id}`)+'</code>'}\n`
        try {
          const tokHere = await actionFollowWhaleMarket(addr, market.condition_id, market.question)
          keyboard.push([
            { text: `Here`, callback_data: `act:${tokHere}` },
          ])
        } catch {}
      }
      msg += `\n💡 Follow market price: <code>${esc(`/follow ${market.condition_id}`)}</code>`
      try {
        const tokMarket = await actionFollowMarket(market.condition_id, market.question)
        const kb = { inline_keyboard: [...keyboard, [{ text: 'Follow', callback_data: `act:${tokMarket}` }]] }
        await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb as any })
      } catch {
        await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } as any })
      }
    } catch (err) {
      logger.error('Error in whales command', err)
      await ctx.reply('❌ Unable to load whales. Try /markets for active markets or check your connection.')
    }
  })

  // Net positions by user for a market
  bot.command('net', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    if (args.length === 0) {
      await ctx.reply('Usage: /net <market_url|id|slug> — shows per-user net positions (top holders sample).')
      return
    }
    const query = args.join(' ')
    try {
      await ctx.reply('🔍 Loading market and holders...')

      // Check for multi-date markets first
      if (isEventUrlWithoutMarket(query)) {
        const slugs = await getEventSubMarketSlugs(query)
        if (slugs.length > 1) {
          for (const slug of slugs) {
            const m = await findMarket(slug)
            if (m) await processNetForMarket(ctx, m)
          }
          return
        }
      }

      const market = await resolveMarketFromInput(query)
      if (!market) { await ctx.reply('❌ Market not found. Try a full URL, ID (0x...), or slug.'); return }

      // Check if this is a group URL with multiple children
      const eventUrlMaybe = getEventUrlFromInput(query) || getPolymarketMarketUrl(market)
      const isGroupUrl = /^https?:\/\//i.test(query) && (()=>{ try { const u=new URL(query); const p=u.pathname.split('/').filter(Boolean); const i=p.findIndex(x=>x==='event'); return i>=0 && !!p[i+2] } catch { return false } })()

      if (isGroupUrl) {
        const childrenRaw = await getGroupSubMarkets(query)
        if (Array.isArray(childrenRaw) && childrenRaw.length > 1) {
          for (const child of childrenRaw) {
            await processNetForMarket(ctx, child)
          }
          return
        }
      }

      if (eventUrlMaybe) {
        const childrenRaw = await getEventSubMarkets(eventUrlMaybe)
        if (Array.isArray(childrenRaw) && childrenRaw.length > 1) {
          for (const child of childrenRaw) {
            await processNetForMarket(ctx, child)
          }
          return
        }
      }

      // Single market - process normally
      await processNetForMarket(ctx, market)
    } catch (e) {
      logger.error('net command failed', e)
      await ctx.reply('❌ Failed to load net positions. Try again later.')
    }
  })

  // Helper function to process net positions for a single market
  async function processNetForMarket(ctx: any, market: any) {
    try {
      const conditionId = market.condition_id || market.conditionId
      const holdersRes = await dataApi.getTopHolders({ market: conditionId, limit: 100, minBalance: 1 })
      if (!holdersRes?.length) { await ctx.reply('❌ No holder data available for this market.'); return }

      // Build address -> outcome balances
      type AddrPos = { [outcome: string]: number }
      const byAddr = new Map<string, AddrPos>()
      const outcomeNames = new Map<string,string>() // token -> outcome
      for (const t of market.tokens || []) outcomeNames.set(t.token_id, t.outcome || '')
      holdersRes.forEach((token) => {
        const out = market.tokens?.find((t:any)=>t.token_id===token.token)
        const outcome = out?.outcome || token.token
        token.holders.forEach((h)=>{
          const bal = parseFloat(h.balance || '0')
          if (isNaN(bal) || bal===0) return
          const cur = byAddr.get(h.address) || {}
          cur[outcome] = (cur[outcome] || 0) + bal
          byAddr.set(h.address, cur)
        })
      })

      // Compute net = largest - sum(others)
      const scored: Array<{ addr: string; net: number; dominant: string; breakdown: string }>=[]
      for (const [addr, pos] of byAddr.entries()) {
        const entries = Object.entries(pos)
        if (!entries.length) continue
        entries.sort((a,b)=>b[1]-a[1])
        const top = entries[0]
        const others = entries.slice(1).reduce((s,[,v])=>s+v,0)
        const net = top[1] - others
        const breakdown = entries.map(([k,v])=>`${k}:${Math.round(v)}`).join(' ')
        scored.push({ addr, net, dominant: top[0], breakdown })
      }
      scored.sort((a,b)=>Math.abs(b.net)-Math.abs(a.net))
      const topN = scored.slice(0,10)

      const url = getPolymarketMarketUrl(market)
      let msg = `🧮 Net Positions — ${market.question}\n`
      if (url) msg += `🔗 ${url}\n`
      msg += `Sampled top holders across outcomes.\n\n`
      if (!topN.length) { msg += 'No holder positions to display.'; await ctx.reply(msg); return }
      topN.forEach((r,i)=>{
        const short = r.addr.slice(0,6)+'...'+r.addr.slice(-4)
        const prof = getPolymarketProfileUrl(null, r.addr)
        msg += `${i+1}. ${short} — Net ${r.net>=0?'+':''}${Math.round(r.net)} (${r.dominant})\n   ${r.breakdown}\n   🔗 ${prof}\n`
      })
      await ctx.reply(msg)
    } catch (e) {
      logger.error('processNetForMarket failed', e)
      await ctx.reply('❌ Failed to load net positions for this market.')
    }
  }

  // Overview: positions by side with pricing + orderbook summary (public data)
  bot.command('overview', async (ctx) => {
    // Handle multi-line input: split by whitespace (including newlines), filter empty, rejoin
    const rawText = ctx.message.text
    const parts = rawText.split(/\s+/).filter(Boolean) // Split by any whitespace
    const args = parts.slice(1) // Remove command

    if (args.length === 0) {
      await ctx.reply('Usage: /overview <market_url|id>\n\nAccepts:\n• Full URL: https://polymarket.com/event/...\n• Condition ID: 0x...\n\nFor search, use /markets <query> instead.')
      return
    }
    const query = args.join(' ').trim() // Join and trim for safety

    try {
      // Wrap entire command in timeout (20 seconds - shorter for faster feedback)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Command timeout')), 20000)
      )

      const commandPromise = (async () => {
        await ctx.reply('🔍 Loading market overview...')
        logger.info('overview: resolving market from input (strict mode)', { query })
        // Special: If input is an event URL (no specific market slug), compute skew for all sub-markets
        if (isEventUrlWithoutMarket(query)) {
          try {
            const slugs = await getEventSubMarketSlugs(query)
            if (!slugs.length) {
              await ctx.reply('❌ No sub-markets found on this event page.');
              return
            }
            // Fetch full markets by slug sequentially to be gentle on rate limits
            for (const slug of slugs) {
              try {
                const m = await findMarket(slug)
                if (!m) continue
                const conditionId = m.condition_id || m.conditionId
                const yes = (m.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
                const no  = (m.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
                if (!conditionId || !yes || !no) continue
                const res = await getSmartSkew(conditionId, yes, no)
                const marketUrl = getPolymarketMarketUrl(m)
                if (res) {
                  let card = formatSkewCard(m.question || slug, marketUrl, res, true)
                  try {
                    const exs: any[] = Array.isArray((res as any).examples) ? (res as any).examples : []
                    if (exs.length) {
                      const insights = await analyzeSkewExamples(exs)
                      const bits: string[] = []
                      if (insights.hiReturn > 0) bits.push(`High‑return whales: ${insights.hiReturn}`)
                      if (insights.newBig > 0) bits.push(`New big bets: ${insights.newBig} • ⚠️ Possible insider? (informational)`)
                      if (bits.length) card += `\n${bits.join(' • ')}`
                    }
                  } catch {}
                  await ctx.reply(card, { parse_mode: 'HTML' })
                }
              } catch {}
            }
            return
          } catch (e) {
            logger.warn('overview: event sub-markets failed', { err: (e as any)?.message })
          }
        }
        // Strict mode: only accept URLs or condition IDs, no fuzzy search
        const market = await resolveMarketFromInput(query, false)
        // Check if this is a group URL (event + market slug) with multi-date children
        const eventUrlMaybe = getEventUrlFromInput(query) || (market ? getPolymarketMarketUrl(market) : null)
        const isGroupUrl = /^https?:\/\//i.test(query) && (()=>{ try { const u=new URL(query); const p=u.pathname.split('/').filter(Boolean); const i=p.findIndex(x=>x==='event'); return i>=0 && !!p[i+2] } catch { return false } })()
        if (isGroupUrl && market) {
          try {
            const childrenRaw = await getGroupSubMarkets(query)
            if (Array.isArray(childrenRaw) && childrenRaw.length > 1) {
              // Process each child market
              for (const child of childrenRaw) {
                try {
                  const cid = child.conditionId
                  const yes = (child.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
                  const no  = (child.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
                  if (!cid || !yes || !no) continue
                  const res = await getSmartSkew(cid, yes, no)
                  if (res) {
                    const marketUrl = `https://polymarket.com/event/${query.split('/event/')[1]?.split('/')[0]}/${child.slug}`
                    let card = formatSkewCard(child.question || child.slug, marketUrl, res, true)
                    try {
                      const exs: any[] = Array.isArray((res as any).examples) ? (res as any).examples : []
                      if (exs.length) {
                        const insights = await analyzeSkewExamples(exs)
                        const bits: string[] = []
                        if (insights.hiReturn > 0) bits.push(`High‑return whales: ${insights.hiReturn}`)
                        if (insights.newBig > 0) bits.push(`New big bets: ${insights.newBig} • ⚠️ Possible insider? (informational)`)
                        if (bits.length) card += `\n${bits.join(' • ')}`
                      }
                    } catch {}
                    await ctx.reply(card, { parse_mode: 'HTML' })
                  }
                } catch {}
              }
              return
            }
          } catch (e) {
            logger.warn('overview: group sub-markets failed', { err: (e as any)?.message })
          }
        }
        // Check if event URL has multiple children
        if (eventUrlMaybe && market) {
          try {
            const childrenRaw = await getEventSubMarkets(eventUrlMaybe)
            if (Array.isArray(childrenRaw) && childrenRaw.length > 1) {
              for (const child of childrenRaw) {
                try {
                  const cid = child.conditionId
                  const yes = (child.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
                  const no  = (child.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
                  if (!cid || !yes || !no) continue
                  const res = await getSmartSkew(cid, yes, no)
                  if (res) {
                    const marketUrl = `https://polymarket.com/event/${eventUrlMaybe.split('/event/')[1]}/${child.slug}`
                    let card = formatSkewCard(child.question || child.slug, marketUrl, res, true)
                    try {
                      const exs: any[] = Array.isArray((res as any).examples) ? (res as any).examples : []
                      if (exs.length) {
                        const insights = await analyzeSkewExamples(exs)
                        const bits: string[] = []
                        if (insights.hiReturn > 0) bits.push(`High‑return whales: ${insights.hiReturn}`)
                        if (insights.newBig > 0) bits.push(`New big bets: ${insights.newBig} • ⚠️ Possible insider? (informational)`)
                        if (bits.length) card += `\n${bits.join(' • ')}`
                      }
                    } catch {}
                    await ctx.reply(card, { parse_mode: 'HTML' })
                  }
                } catch {}
              }
              return
            }
          } catch (e) {
            logger.warn('overview: event sub-markets expansion failed', { err: (e as any)?.message })
          }
        }
        if (!market) {
          logger.warn('overview: market not found', { query })
          await ctx.reply('❌ Market not found.\n\nPlease provide:\n• Full market URL, or\n• Condition ID (0x...)\n\nFor search, use /markets <query> instead.')
          return
        }

        const conditionId = market.condition_id || market.conditionId
        logger.info('overview: market resolved', {
          conditionId,
          question: market.question?.slice(0, 50),
          hasTokens: !!market.tokens,
          tokenCount: market.tokens?.length || 0,
          marketKeys: Object.keys(market).sort()
        })

        // If tokens are missing, try re-fetching by condition ID
        if (!market.tokens || market.tokens.length === 0) {
          logger.warn('overview: market has no tokens, re-fetching by condition ID', { conditionId })
          try {
            const refetchedMarket = await gammaApi.getMarket(conditionId)
            if (refetchedMarket && refetchedMarket.tokens && refetchedMarket.tokens.length > 0) {
              logger.info('overview: refetched market has tokens', {
                tokenCount: refetchedMarket.tokens.length
              })
              Object.assign(market, refetchedMarket) // Merge in the tokens
            } else {
              logger.warn('overview: refetched market also has no tokens')
            }
          } catch (refetchErr) {
            logger.error('overview: failed to refetch market', { error: refetchErr })
          }
        }

        logger.info('overview: fetching holders', { conditionId })

        const holdersRes = await dataApi.getTopHolders({ market: conditionId, limit: 100, minBalance: 1 })

        logger.info('overview: holders fetched', { count: holdersRes?.length || 0 })
        if (!holdersRes?.length) {
          await ctx.reply('❌ No holder data available for this market.')
          return
        }

        // Process only YES outcome
        const url = getPolymarketMarketUrl(market)
        const yesToken = (market.tokens || []).find(t =>
          (t.outcome || '').toLowerCase() === 'yes'
        )

        logger.info('overview: looking for YES token', {
          hasTokens: !!market.tokens,
          tokenCount: market.tokens?.length || 0,
          foundYes: !!yesToken
        })

        if (!yesToken) {
          logger.error('overview: no YES token found', {
            conditionId,
            marketKeys: Object.keys(market),
            marketType: typeof market,
            tokensValue: market.tokens,
            url: query
          })
          await ctx.reply(
            `❌ This market has no tradeable outcomes.\n\n` +
            `Market ID: ${conditionId}\n\n` +
            `This could mean:\n` +
            `• Market is not yet active\n` +
            `• Market has been closed\n` +
            `• Data is temporarily unavailable\n\n` +
            `Try a different market or check: ${url || 'https://polymarket.com'}`
          )
          return
        }

        const token = yesToken
        const outcome = token.outcome || token.token_id
        const set = holdersRes.find(h=>h.token===token.token_id)
        logger.info('overview: processing YES token', { tokenId: token.token_id, outcome })

        // Get orderbook
        let book: any = null
        let midpoint: number|null = null
        let spread: number|null = null
        try {
          logger.info('overview: fetching orderbook', { tokenId: token.token_id })
          book = await clobApi.getOrderbook(token.token_id)
          logger.info('overview: orderbook fetched', { tokenId: token.token_id, hasBids: !!book?.bids?.length, hasAsks: !!book?.asks?.length })
          const bestBid = book.bids?.length ? parseFloat(book.bids[0].price) : null
          const bestAsk = book.asks?.length ? parseFloat(book.asks[0].price) : null
          if (bestBid!=null && bestAsk!=null) {
            midpoint = (bestBid + bestAsk) / 2
            spread = bestAsk - bestBid
          }
        } catch (err) {
          logger.error('overview: orderbook fetch failed', { tokenId: token.token_id, error: err })
        }

        // Build orderbook overview message
        let msg = `📊 Orderbook Overview <b>(YES)</b>\n\n${market.question}\n\n`
          if (spread!=null && midpoint!=null) {
            msg += `Spread: ${(spread*100).toFixed(1)}¢, Midpoint: ${(midpoint*100).toFixed(1)}¢\n\n`
          }

          if (book && (book.bids?.length || book.asks?.length)) {
            msg += `<code>Price    Size     Total</code>\n`
            msg += `<code>━━━━━━━━━━━━━━━━━━━━━━━━</code>\n`

            // Show top 4 asks (reversed order)
            const asks = (book.asks || []).slice(0, 4).reverse()
            for (const ask of asks) {
              const price = (parseFloat(ask.price)*100).toFixed(1)
              const size = Math.round(parseFloat(ask.size))
              const total = Math.round(parseFloat(ask.price) * parseFloat(ask.size))
              msg += `<code>${price.padStart(4)}¢  ${String(size).padStart(6)}   $${total}</code>\n`
            }

            msg += `<code>━━━━━━━━━━━━━━━━━━━━━━━━</code>\n`

            // Show top 4 bids
            const bids = (book.bids || []).slice(0, 4)
            for (const bid of bids) {
              const price = (parseFloat(bid.price)*100).toFixed(1)
              const size = Math.round(parseFloat(bid.size))
              const total = Math.round(parseFloat(bid.price) * parseFloat(bid.size))
              msg += `<code>${price.padStart(4)}¢  ${String(size).padStart(6)}   $${total}</code>\n`
            }
          } else {
            msg += `No orderbook data available.\n`
          }

        logger.info('overview: sending orderbook message', { tokenId: token.token_id })
        await ctx.reply(msg, { parse_mode: 'HTML' })
        logger.info('overview: orderbook message sent', { tokenId: token.token_id })

        // Smart Money Skew block (detailed)
        try {
          const res = await getSmartSkew(conditionId,
            (market.tokens||[]).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id,
            (market.tokens||[]).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id,
          )
          const marketUrl = getPolymarketMarketUrl(market)
          if (res) {
            let card = formatSkewCard(market.question || 'Market', marketUrl, res, true)
            // Cautious informational notes
            try {
              const exs: any[] = Array.isArray((res as any).examples) ? (res as any).examples : []
              if (exs.length) {
                const insights = await analyzeSkewExamples(exs)
                const bits: string[] = []
                if (insights.hiReturn > 0) bits.push(`High‑return whales: ${insights.hiReturn}`)
                if (insights.newBig > 0) bits.push(`New big bets: ${insights.newBig} • ⚠️ Possible insider? (informational)`) // cautious wording
                if (bits.length) card += `\n${bits.join(' • ')}`
              }
            } catch {}
            const kb = { inline_keyboard: [[{ text: 'Refresh', callback_data: `skew:${conditionId}` }]] }
            await ctx.reply(card, { parse_mode: 'HTML', reply_markup: kb as any })
          } else {
            await ctx.reply('⚖️ Smart Money Skew: not enough data to assess for this market.', { disable_web_page_preview: true })
          }
        } catch (e) {
          logger.warn('overview: skew block failed', { err: (e as any)?.message })
        }

        // Build net position overview (YES only)
        if (set && set.holders.length > 0) {
          // Build address -> share mapping
          const positions = set.holders.map(h => ({
            address: h.address,
            shares: Math.round(parseFloat(h.balance || '0'))
          })).filter(p => p.shares > 0).sort((a,b) => b.shares - a.shares).slice(0, 10)

          let posMsg = `📊 Net Position Overview <b>(YES)</b>\n\n${market.question}\n\n`
          positions.forEach((p, i) => {
            const short = p.address.slice(0, 6) + '...' + p.address.slice(-4)
            posMsg += `${i+1}. ${short} : ${p.shares.toLocaleString()}\n`
          })

          logger.info('overview: sending position message', { tokenId: token.token_id })
          await ctx.reply(posMsg, { parse_mode: 'HTML' })
          logger.info('overview: position message sent', { tokenId: token.token_id })
        }
        logger.info('overview: command completed successfully')
      })()

      // Race between command execution and timeout
      await Promise.race([commandPromise, timeoutPromise])
      logger.info('overview: Promise.race completed')
    } catch (e: any) {
      if (e?.message === 'Command timeout') {
        logger.warn('overview command timed out', { query })
        await ctx.reply('⏱️ Request timed out. This market may be too large or the API is slow. Please try again.')
      } else {
        logger.error('overview command failed', e)
        await ctx.reply('❌ Failed to load overview. Try again later.')
      }
    }
  })

  // Smart Skew command: compute and show skew for a single market or all sub‑markets of an event
  bot.command('skew', async (ctx) => {
    const rawText = ctx.message.text
    const args = rawText.split(/\s+/).filter(Boolean).slice(1)
    if (args.length === 0) {
      await ctx.reply('Usage: /skew <market_url|id|event_url>\n\nExamples:\n• /skew https://polymarket.com/event/...\n• /skew 0x<condition_id>')
      return
    }
    const input = args.join(' ').trim()
    // Hard timeout so this command never hangs silently
    const COMMAND_TIMEOUT_MS = 20000
    const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Command timeout')), COMMAND_TIMEOUT_MS))
    logger.info({ userId: ctx.from?.id, chatId: ctx.chat?.id, input }, 'skew: command invoked')

    const commandPromise = (async () => {
      await ctx.reply('⚖️ Calculating smart skew...')
      // Case A: Event URL without specific market -> compute for all sub‑markets
      if (isEventUrlWithoutMarket(input)) {
        const slugs = await getEventSubMarketSlugs(input)
        if (!slugs.length) { await ctx.reply('❌ No sub‑markets found for this event.'); return }
        for (const slug of slugs) {
          try {
            const m = await findMarket(slug)
            if (!m) continue
            const conditionId = m.condition_id || m.conditionId
            const yes = (m.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
            const no  = (m.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
            if (!conditionId || !yes || !no) continue
            const res = await getSmartSkew(conditionId, yes, no)
            const url = getPolymarketMarketUrl(m)
            if (!res) continue
            let card = formatSkewCard(m.question || slug, url, res, true)
            // Cautious insights
            try {
              const exs: any[] = Array.isArray((res as any).examples) ? (res as any).examples : []
              if (exs.length) {
                const insights = await analyzeSkewExamples(exs)
                const bits: string[] = []
                if (insights.hiReturn > 0) bits.push(`High‑return whales: ${insights.hiReturn}`)
                if (insights.newBig > 0) bits.push(`New big bets: ${insights.newBig} • ⚠️ Possible insider? (informational)`)
                if (bits.length) card += `\n${bits.join(' • ')}`
              }
            } catch {}
            // Refresh button
            const tok = condToToken(conditionId)
            const kb = tok ? { inline_keyboard: [[{ text: 'Refresh', callback_data: `skw:${tok}` }]] } : undefined
            await replySafe(ctx, card, kb)
          } catch {}
        }
        return
      }
      // Case B: Single market (URL/ID/slug) — if it is an event container with sub‑markets, compute for each sub‑market; otherwise compute once
      let market = await resolveMarketFromInput(input, false)
      if (!market) { await ctx.reply('❌ Market not found. Provide full URL or 0x<condition_id>.'); return }

      // DEBUG: Log the resolved market object to see what fields are available
      logger.info({
        marketKeys: Object.keys(market),
        conditionId: market.condition_id || market.conditionId,
        slug: market.slug || market.market_slug,
        question: market.question?.slice(0, 80),
        hasTokens: !!market.tokens,
        tokenCount: market.tokens?.length,
        events: market.events,
        hasEvents: !!market.events
      }, 'skew: DEBUG resolved market object')

      let conditionId = market.condition_id || market.conditionId

      // Fetch full market with tokens if missing
      if (!market.tokens || market.tokens.length === 0) {
        try {
          if (conditionId) {
            logger.info({ conditionId }, 'skew: fetching full market to get tokens')
            const fullMarket = await gammaApi.getMarket(conditionId)
            if (fullMarket?.tokens?.length) {
              market = Object.assign({}, market, fullMarket)
              logger.info({ tokenCount: fullMarket.tokens.length }, 'skew: successfully fetched tokens')
            }
          }
        } catch (e) {
          logger.warn({ err: (e as any)?.message }, 'skew: failed to fetch full market')
        }
      }

      let yes = (market.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
      let no  = (market.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id

      // Check if this is a multi-outcome market (more than 2 outcomes)
      const tokens = market.tokens || []
      const isMultiOutcome = tokens.length > 2
      logger.info({
        tokenCount: tokens.length,
        outcomes: tokens.map((t: any) => t.outcome || t.name),
        isMultiOutcome,
        hasYesNo: !!yes && !!no
      }, 'skew: token analysis for multi-outcome detection')

      // If this looks like an event container (no YES/NO tokens or multi‑date series), expand to sub‑markets using the event page
      try {
        // Prefer event slug from market.events field if available (most reliable)
        let eventSlug: string | undefined
        if (market.events && Array.isArray(market.events) && market.events.length > 0) {
          eventSlug = market.events[0].slug
          logger.info({ eventSlugFromMarket: eventSlug, eventsCount: market.events.length }, 'skew: extracted event slug from market.events')
        }

        // Fallback: parse from URL
        const eventUrlMaybe = getEventUrlFromInput(input) || getPolymarketMarketUrl(market)
        const isGroupUrl = /^https?:\/\//i.test(input) && (()=>{ try { const u=new URL(input); const p=u.pathname.split('/').filter(Boolean); const i=p.findIndex(x=>x==='event'); return i>=0 && !!p[i+2] } catch { return false } })()

        if (!eventSlug && eventUrlMaybe) {
          eventSlug = eventUrlMaybe.split('/event/')[1]?.split('/')[0]
        }

        logger.info({ isGroupUrl, eventUrlMaybe, eventSlug, input }, 'skew: multi-market detection')

        // Try API-based approach first (more reliable than HTML scraping)
        if (eventSlug) {
          // Add timeout to prevent hanging (max 15 seconds)
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('getMarketsByEvent timeout')), 15000)
          )
          const childrenRaw = await Promise.race([
            getMarketsByEvent(eventSlug),
            timeoutPromise
          ]).catch(err => {
            logger.warn({ err: err?.message }, 'skew: getMarketsByEvent failed or timed out')
            return []
          })
          if (Array.isArray(childrenRaw) && childrenRaw.length > 1) {
              const children: Array<{ slug: string; m: any; cid: string; y: string; n: string; endTs: number | null }> = []
              for (const child of childrenRaw) {
                try {
                  const cid = child.conditionId
                  const y = (child.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
                  const n = (child.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
                  if (!cid || !y || !n) continue
                  let endTs: number | null = null
                  try { endTs = child.end_date_iso ? Date.parse(String(child.end_date_iso)) : null } catch { endTs = null }
                  children.push({ slug: child.slug, m: child, cid, y, n, endTs })
                } catch {}
              }
              children.sort((a,b)=>{ const ax=a.endTs??Number.POSITIVE_INFINITY; const bx=b.endTs??Number.POSITIVE_INFINITY; return ax-bx })
              const toSend = children.slice(0,10)
              for (const ch of toSend) {
                try {
                  const res = await getSmartSkew(ch.cid, ch.y, ch.n)
                  if (!res) continue
                  const url = `https://polymarket.com/event/${eventSlug}/${ch.slug}`
                  const dIso = (ch as any).m?.end_date_iso || (ch as any).endTs || null
                  const dateStr = dIso ? formatDateYYYYMMDD(dIso) : null
                  const baseTitle = ch.m.question || ch.slug
                  const title = dateStr ? `${baseTitle} (${dateStr})` : baseTitle
                  let card = formatSkewCard(title, url, res, true)
                  try {
                    const exs: any[] = Array.isArray((res as any).examples) ? (res as any).examples : []
                    if (exs.length) {
                      const insights = await analyzeSkewExamples(exs)
                      const bits: string[] = []
                      if (insights.hiReturn > 0) bits.push(`High‑return whales: ${insights.hiReturn}`)
                      if (insights.newBig > 0) bits.push(`New big bets: ${insights.newBig} • ⚠️ Possible insider? (informational)`)
                      if (bits.length) card += `\n${bits.join(' • ')}`
                    }
                  } catch {}
                  const tok = condToToken(ch.cid)
                  const kb = tok ? { inline_keyboard: [[{ text: 'Refresh', callback_data: `skw:${tok}` }]] } : undefined
                  await replySafe(ctx, card, kb)
                } catch {}
              }
              return
            }
          }

        // Fallback to HTML scraping if API approach didn't work
        if (isGroupUrl) {
          // Group page (event + market slug): extract children from the same page
          const childrenRaw = await getGroupSubMarkets(input)
          logger.info({ count: childrenRaw?.length || 0, children: childrenRaw?.map(c => ({ slug: c.slug, cid: c.conditionId?.slice(0,10) })) }, 'skew: getGroupSubMarkets result')
          if (Array.isArray(childrenRaw) && childrenRaw.length > 1) {
            const children: Array<{ slug: string; m: any; cid: string; y: string; n: string; endTs: number | null }> = []
            for (const child of childrenRaw) {
              try {
                const cid = child.conditionId
                let y: string | undefined = undefined
                let n: string | undefined = undefined
                const toks: any[] = Array.isArray((child as any).tokens) ? (child as any).tokens as any[] : []
                if (toks.length) {
                  y = toks.find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
                  n = toks.find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
                }
                if (!y || !n) {
                  try {
                    const m2 = await gammaApi.getMarket(cid)
                    const yesT = (m2.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
                    const noT  = (m2.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
                    if (yesT && noT) { y = yesT; n = noT }
                  } catch {}
                }
                const anyWinner = Array.isArray((child as any).tokens) && (child as any).tokens.some((t:any)=> t?.winner===true)
                if (!cid || !y || !n || anyWinner || child.closed === true || child.archived === true) continue
                let endTs: number | null = null
                try { endTs = child.end_date_iso ? Date.parse(String(child.end_date_iso)) : null } catch { endTs = null }
                children.push({ slug: child.slug, m: child, cid, y, n, endTs })
              } catch {}
            }
            children.sort((a,b)=>{ const ax=a.endTs??Number.POSITIVE_INFINITY; const bx=b.endTs??Number.POSITIVE_INFINITY; return ax-bx })
            const toSend = children.slice(0,10)
            const batchSize = 3
            for (let i = 0; i < toSend.length; i += batchSize) {
              const batch = toSend.slice(i, i + batchSize)
              await Promise.all(batch.map(async (ch) => {
                try {
                  const res = await getSmartSkew(ch.cid, ch.y, ch.n)
                  const url = buildChildMarketUrl(ch.m, eventSlug)
                  if (!res) return
                  const dIso = (ch as any).m?.end_date_iso || (ch as any).endTs || null
                  const dateStr = dIso ? formatDateYYYYMMDD(dIso) : null
                  const baseTitle = ch.m.question || ch.slug
                  const title = dateStr ? `${baseTitle} (${dateStr})` : baseTitle
                  let card = formatSkewCard(title, url, res, true)
                  try {
                    const exs: any[] = Array.isArray((res as any).examples) ? (res as any).examples : []
                    if (exs.length) {
                      const insights = await analyzeSkewExamples(exs)
                      const bits: string[] = []
                      if (insights.hiReturn > 0) bits.push(`High‑return whales: ${insights.hiReturn}`)
                      if (insights.newBig > 0) bits.push(`New big bets: ${insights.newBig} • ⚠️ Possible insider? (informational)`)
                      if (bits.length) card += `\n${bits.join(' • ')}`
                    }
                  } catch {}
                  const tok = condToToken(ch.cid)
                  const kb = tok ? { inline_keyboard: [[{ text: 'Refresh', callback_data: `skw:${tok}` }]] } : undefined
                  await replySafe(ctx, card, kb)
                } catch {}
              }))
            }
            return
          }
        }
        if (eventUrlMaybe) {
          // Prefer structured extraction with condition IDs to avoid slug → market lookups
          logger.info({ eventUrlMaybe }, 'skew: trying getEventSubMarkets fallback')
          const childrenRaw = await getEventSubMarkets(eventUrlMaybe)
          logger.info({ count: childrenRaw?.length || 0, children: childrenRaw?.map(c => ({ slug: c.slug, cid: c.conditionId?.slice(0,10) })) }, 'skew: getEventSubMarkets result')
          // If multiple sub‑markets exist, compute skew for each unresolved child
          if (Array.isArray(childrenRaw) && childrenRaw.length > 1) {
            const children: Array<{ slug: string; m: any; cid: string; y: string; n: string; endTs: number | null }> = []
            for (const child of childrenRaw) {
              try {
                const m = child
                const cid = child.conditionId
                // Resolve YES/NO tokens from the payload; fallback to API if missing
                let y: string | undefined = undefined
                let n: string | undefined = undefined
                const toks: any[] = Array.isArray((child as any).tokens) ? (child as any).tokens as any[] : []
                if (toks.length) {
                  y = toks.find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
                  n = toks.find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
                }
                if (!y || !n) {
                  try {
                    const m2 = await gammaApi.getMarket(cid)
                    const yesT = (m2.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
                    const noT  = (m2.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
                    if (yesT && noT) { y = yesT; n = noT }
                  } catch {}
                }
                const anyWinner = Array.isArray((child as any).tokens) && (child as any).tokens.some((t:any)=> t?.winner===true)
                if (!cid || !y || !n || anyWinner || child.closed === true || child.archived === true) continue
                let endTs: number | null = null
                try { endTs = child.end_date_iso ? Date.parse(String(child.end_date_iso)) : null } catch { endTs = null }
                children.push({ slug: child.slug, m: child, cid, y, n, endTs })
              } catch {}
            }
            // Sort by end date ascending when available
            children.sort((a,b)=>{
              const ax = a.endTs ?? Number.POSITIVE_INFINITY
              const bx = b.endTs ?? Number.POSITIVE_INFINITY
              return ax - bx
            })
            // Safety cap: avoid excessively large event expansions (send first 10 if huge)
            const toSend = children.slice(0, 10)
            // Process in small batches to avoid one slow child blocking others
            const batchSize = 3
            for (let i = 0; i < toSend.length; i += batchSize) {
              const batch = toSend.slice(i, i + batchSize)
              await Promise.all(batch.map(async (ch) => {
                try {
                  const res = await getSmartSkew(ch.cid, ch.y, ch.n)
                  const url = buildChildMarketUrl(ch.m)
                  if (!res) return
                  const dIso = (ch as any).m?.end_date_iso || (ch as any).endTs || null
                  const dateStr = dIso ? formatDateYYYYMMDD(dIso) : null
                  const baseTitle = ch.m.question || ch.slug
                  const title = dateStr ? `${baseTitle} (${dateStr})` : baseTitle
                  let card = formatSkewCard(title, url, res, true)
                  try {
                    const exs: any[] = Array.isArray((res as any).examples) ? (res as any).examples : []
                    if (exs.length) {
                      const insights = await analyzeSkewExamples(exs)
                      const bits: string[] = []
                      if (insights.hiReturn > 0) bits.push(`High‑return whales: ${insights.hiReturn}`)
                      if (insights.newBig > 0) bits.push(`New big bets: ${insights.newBig} • ⚠️ Possible insider? (informational)`)
                      if (bits.length) card += `\n${bits.join(' • ')}`
                    }
                  } catch {}
                  const tok = condToToken(ch.cid)
                  const kb = tok ? { inline_keyboard: [[{ text: 'Refresh', callback_data: `skw:${tok}` }]] } : undefined
                  await replySafe(ctx, card, kb)
                } catch {}
              }))
            }
            return
          }
        }
      } catch {}
      // Tokens should already be fetched earlier, but double-check
      if (!yes || !no) {
        yes = (market.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
        no  = (market.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
      }
      if (!yes || !no) {
        // Last attempt: if input is a URL with a market slug, resolve by slug directly
        try {
          const looksUrl = /^https?:\/\//i.test(input)
          if (looksUrl) {
            const u = new URL(input)
            const parts = u.pathname.split('/').filter(Boolean)
            const idx = parts.findIndex(p=>p==='event')
            const slug = idx>=0 ? (parts[idx+2] || parts[idx+1]) : ''
            if (slug) {
              const m2 = await findMarket(decodeURIComponent(slug))
              if (m2?.tokens?.length) {
                market = m2
                conditionId = market.condition_id || market.conditionId
                yes = (market.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
                no  = (market.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
              }
            }
          }
        } catch {}
      }
      if (!conditionId || !yes || !no) { await ctx.reply('❌ Missing market outcomes for skew (try pasting the market page URL without extra parameters).'); return }
      const res = await getSmartSkew(conditionId, yes, no)
      if (!res) { await ctx.reply('⚠️ Not enough data to assess skew.'); return }
      const url = getPolymarketMarketUrl(market)
      let card = formatSkewCard(market.question || 'Market', url, res, true)
      try {
        const exs: any[] = Array.isArray((res as any).examples) ? (res as any).examples : []
        if (exs.length) {
          const insights = await analyzeSkewExamples(exs)
          const bits: string[] = []
          if (insights.hiReturn > 0) bits.push(`High‑return whales: ${insights.hiReturn}`)
          if (insights.newBig > 0) bits.push(`New big bets: ${insights.newBig} • ⚠️ Possible insider? (informational)`)
          if (bits.length) card += `\n${bits.join(' • ')}`
        }
      } catch {}
      const tok = condToToken(conditionId)
      const kb = tok ? { inline_keyboard: [[{ text: 'Refresh', callback_data: `skw:${tok}` }]] } : undefined
      await replySafe(ctx, card, kb)
      return
    })()

    try {
      await Promise.race([commandPromise, timeoutPromise])
    } catch (e:any) {
      if (e?.message === 'Command timeout') {
        logger.warn('skew command timed out', { input })
        await ctx.reply('⏱️ Skew calculation timed out. This event/market may be large or the API is slow. Try again, or use a specific market URL.')
      } else {
        logger.error('skew command failed', { err: e?.message, stack: e?.stack, input })
        await ctx.reply('❌ Failed to compute skew. Try again later.')
      }
    }
  })

  // Alpha: return the freshest alpha found (optionally filter by market)
  bot.command('alpha', async (ctx) => {
    try {
      // Per-user guard to prevent overlapping /alpha runs and rapid repeats
      const userId = ctx.from?.id
      const nowTs = Date.now()
      if (userId) {
        // Initialize locks map if not present
        const gAny: any = global as any
        if (!gAny._alphaLocks) gAny._alphaLocks = new Map<number, { running: boolean; lastTs: number }>()
        const alphaLocks: Map<number, { running: boolean; lastTs: number }> = gAny._alphaLocks
        const prev = alphaLocks.get(userId)
        if (prev?.running) {
          await ctx.reply('⏳ A scan is already running for you. Please wait…')
          return
        }
        if (prev && nowTs - prev.lastTs < 60_000) {
          await ctx.reply('⌛ Please wait ~1 minute before running /alpha again.')
          return
        }
        alphaLocks.set(userId, { running: true, lastTs: nowTs })
      }
      const parts = ctx.message.text.split(/\s+/).filter(Boolean)
      const query = parts.slice(1).join(' ').trim()
      let tokenIds: string[] | undefined
      let marketTitle: string | undefined

      if (query) {
        // Try to resolve market and collect its token IDs to filter alpha
        const market = await resolveMarketFromInput(query)
        if (market && Array.isArray(market.tokens) && market.tokens.length > 0) {
          tokenIds = market.tokens.map((t: any) => t.token_id).filter(Boolean)
          marketTitle = market.question
        }
      }

      // Show searching indicator first
      const searching = await ctx.reply('🔎 Searching for alpha…')
      const ctxRef = ctx

      const { AlphaAggregator } = await import('../services/alpha-aggregator')
      let latest = AlphaAggregator.getLatest(1, tokenIds)
      // Log-only: probe DB for unseen fresh alpha (<=12h) and log, do not return it to the user
      try {
        if (DB_LOG_ONLY_PROBE && ctx.from?.id) {
          const userId = ctx.from.id
          const { fetchRecentAlpha, fetchSeenAlphaIds } = await import('../services/alpha-store')
          const seenIds = await fetchSeenAlphaIds({ telegramUserId: userId, maxAgeSec: 12*60*60 })
          const recents = await fetchRecentAlpha({ tokenIds, limit: 3, maxAgeSec: 12*60*60, excludeIds: seenIds })
          for (const a of recents || []) {
            try {
              if (!a.conditionId) continue
              const m = await gammaApi.getMarket(a.conditionId)
              const closed = m?.closed === true || m?.archived === true
              const tokens = Array.isArray(m?.tokens) ? m.tokens : []
              const winner = tokens.some((t:any)=>t?.winner === true)
              const extreme = tokens.length>0 && tokens.every((t:any)=>{ const p = parseFloat(String(t?.price ?? 'NaN')); return Number.isFinite(p) && (p>=0.99 || p<=0.01) })
              if (closed || winner || extreme) continue
              logger.info({
                id: a.id,
                kind: a.kind,
                conditionId: a.conditionId,
                tokenId: a.tokenId,
                alpha: a.alpha,
              }, 'alpha:db unseen')
            } catch {}
          }
        }
      } catch {}
      // Try cached best trade (10-15 min) before HTTP (disabled when DB-first is off)
      if (latest.length === 0 && DB_FIRST_ENABLED) {
        const { TradeBuffer } = await import('@smtm/data')
        const cached = TradeBuffer.getBestForTokens(tokenIds || [], 15*60*1000)
        if (cached) {
          logger.info('alpha:cache hit', { tokenId: cached.tokenId, notional: Math.round(cached.notional) })
          let msg = `✨ <b>Cached Best Trade</b>\n\n`
          msg += `TRADE $${Math.round(cached.notional).toLocaleString()} @ ${(cached.price*100).toFixed(1)}¢\n`
          await ctx.telegram.editMessageText(searching.chat.id, searching.message_id, undefined, msg, { parse_mode: 'HTML' })
          return
        }
      }
      if (latest.length === 0 && DB_FIRST_ENABLED) {
        // DB-first (per-user unseen): surface recent alpha unseen by this user
        try {
          const userId = ctx.from?.id
          if (userId) {
            const { fetchRecentAlpha, fetchSeenAlphaIds, markAlphaSeen } = await import('../services/alpha-store')
            const seenIds = await fetchSeenAlphaIds({ telegramUserId: userId, maxAgeSec: 12*60*60 })
            const recents = await fetchRecentAlpha({ tokenIds, limit: 3, maxAgeSec: 12*60*60, excludeIds: seenIds })
            for (const a of recents || []) {
              try {
                if (!a.conditionId) continue
                const m = await gammaApi.getMarket(a.conditionId)
                const closed = m?.closed === true || m?.archived === true
                const tokens = Array.isArray(m?.tokens) ? m.tokens : []
                const winner = tokens.some((t:any)=>t?.winner === true)
                const extreme = tokens.length>0 && tokens.every((t:any)=>{ const p = parseFloat(String(t?.price ?? 'NaN')); return Number.isFinite(p) && (p>=0.99 || p<=0.01) })
                if (closed || winner || extreme) continue
                // Build richer DB-first card using stored columns
                let message = ''
                if (a.kind === 'whale') {
                  // Compose headline with side, notional, and price when present
                  const d: any = a.data || {}
                  const side = d.side || 'TRADE'
                  const notional = d.notional_usd ?? d.weightedNotionalUsd
                  const notionalStr = notional != null ? `$${Math.round(Number(notional)).toLocaleString()}` : ''
                  const price = d.price
                  const priceStr = Number.isFinite(Number(price)) ? ` @ ${(Number(price)*100).toFixed(1)}¢` : ''
                  message = `✨ <b>Fresh Trade</b>\n\n${side}${notionalStr ? ` ${notionalStr}` : ''}${priceStr}`
                  // If we have market context, prefer market question as title and add link
                  try {
                    const urlM = await gammaApi.getMarket(a.conditionId!)
                    const url = getPolymarketMarketUrl(urlM)
                    if (urlM?.question) message = `✨ <b>${esc(urlM.question)}</b>\n\n` + message.split('\n\n').slice(1).join('\n\n')
                    // Defer appending the market link to the common footer below
                  } catch {}

                  // Generate whale description for alpha context
                  let whaleDescription = ''
                  try {
                    const addr = (a.wallet || '').toLowerCase()
                    if (addr) {
                      const { getWalletWhaleStats, computeWhaleScore, generateAlphaWhaleDescription, buildDescriptionInput } = await import('@smtm/data')
                      const stats = await getWalletWhaleStats(addr, { windowMs: 6*60*60*1000, maxEvents: 500 })
                      const whaleScore = computeWhaleScore(stats, {})

                      // Fetch portfolio value for richer descriptions
                      let portfolioValue = 0
                      let totalPositions = 0
                      try {
                        const userValue = await dataApi.getUserValue(addr)
                        portfolioValue = parseFloat(String(userValue?.value || '0'))
                        totalPositions = userValue?.positions_count || 0
                      } catch {}

                      // Fetch win rate
                      let winRate = 0
                      try {
                        const wr = await dataApi.getUserWinRate(addr)
                        winRate = wr.winRate || 0
                      } catch {}

                      // Fetch recent trades for context
                      let recentTrades12h = 0
                      try {
                        const raw = await dataApi.getTrades({ user: addr, limit: 1000 })
                        const cutoff = Date.now() - 12*60*60*1000
                        recentTrades12h = (raw || []).filter((t:any)=>{
                          const r = t.timestamp || t.match_time || t.last_update
                          const ts = typeof r === 'number' ? (r > 1e12 ? r : r*1000) : Date.parse(String(r))
                          return Number.isFinite(ts) && ts >= cutoff
                        }).length
                      } catch {}

                      // Determine if new wallet
                      const isNewWallet = totalPositions <= 5

                      // Get market tags for context
                      let marketTags: string[] = []
                      try {
                        if (a.conditionId) {
                          const tm = await gammaApi.getMarket(a.conditionId)
                          if (Array.isArray(tm?.tags)) marketTags = tm.tags.slice(0, 2)
                        }
                      } catch {}

                      // Get PnL for description
                      let pnl = 0
                      try {
                        const pnlData = await dataApi.getUserAccuratePnL(addr)
                        pnl = pnlData.totalPnL || 0
                      } catch {}

                      // Build description input with current trade context
                      const descInput = buildDescriptionInput({
                        whaleScore,
                        pnl,
                        winRate,
                        avgBetSize: stats.avgBetUsd,
                        tradesPerHour: stats.tradesPerHour,
                        portfolioValue,
                        accountAgeDays: null,
                        totalTrades: stats.sampleCount,
                        recentTrades12h,
                        tags: marketTags,
                        isNewWallet,
                        currentTrade: {
                          notionalUsd: d.notional_usd ?? d.weightedNotionalUsd ?? 0,
                          side: d.side === 'BUY' ? 'BUY' : 'SELL',
                          marketCategory: marketTags[0],
                        },
                      })

                      // Generate alpha-aware description (only if sufficient data)
                      if (stats.sampleCount >= 5 || whaleScore >= 40) {
                        whaleDescription = generateAlphaWhaleDescription(descInput, { maxLength: 140 })
                      }
                    }
                  } catch (e) {
                    logger.warn('Failed to generate whale description for alpha', { error: (e as any)?.message })
                  }

                  // Add description to message if generated
                  if (whaleDescription) {
                    message += `\n\n${whaleDescription}`
                  }

                  // Enrich trader details to match live output when wallet is available
                  try {
                    const addr = (a.wallet || '').toLowerCase()
                    if (addr) {
                      const disp = (d.trader_display_name || d.traderDisplayName || '') as string
                      const profileUrl = getPolymarketProfileUrl(disp || null, addr)
                      const short = `${addr.slice(0,6)}…${addr.slice(-4)}`
                      const [pnlAgg, winr, val, openPos, closedPos, prof] = await Promise.all([
                        dataApi.getUserAccuratePnL(addr).catch(()=>({ totalPnL: 0, realizedPnL:0, unrealizedPnL:0, currentValue:0 })),
                        dataApi.getUserWinRate(addr).catch(()=>({ wins:0, total:0, winRate:0 })),
                        dataApi.getUserValue(addr).catch(()=>({ user: addr, value:'0', positions_count: 0 })),
                        dataApi.getUserPositions({ user: addr, limit: 100 }).catch(()=>[]),
                        dataApi.getClosedPositions(addr, 200).catch(()=>[]),
                        dataApi.getUserProfileMetrics(addr).catch(()=>({})) as any,
                      ])
                      // Prefer UI hero PnL when it disagrees materially
                      try {
                        const uiPnl = await dataApi.getUserPnLFromProfile(disp || addr).catch(()=>null)
                        if (uiPnl != null) {
                          const comp = Number(pnlAgg.totalPnL || 0)
                          const disagree = (Math.sign(uiPnl) !== Math.sign(comp)) || (Math.abs(uiPnl) > Math.abs(comp) * 1.5)
                          if (disagree || Math.abs(comp) < 1) {
                            const pnlAggAny: any = pnlAgg
                            pnlAggAny.totalPnL = uiPnl
                          }
                        }
                      } catch {}
                      const name = disp || short
                      const pnlStr = `${pnlAgg.totalPnL >= 0 ? '+' : '-'}$${Math.abs(Math.round(pnlAgg.totalPnL)).toLocaleString()}`
                      const winStr = `${Math.round(winr.winRate)}% (${winr.wins}/${winr.total})`
                      const valNum = parseFloat(String((val as any).value || '0'))
                      const valStr = `$${Math.round(valNum).toLocaleString()}`
                      const whaleScore = (d.whale_score != null ? d.whale_score : d.whaleScore)
                      const whaleStr = whaleScore != null ? ` • 🐋 ${Math.round(Number(whaleScore))}` : ''
                      // Trades in last 12h (best-effort)
                      let trades12h = 0
                      try {
                        const raw = await dataApi.getTrades({ user: addr, limit: 1000 })
                        const cutoff = Date.now() - 12*60*60*1000
                        trades12h = (raw || []).filter((t:any)=>{
                          const r = t.timestamp || t.match_time || t.last_update
                          const ts = typeof r === 'number' ? (r > 1e12 ? r : r*1000) : Date.parse(String(r))
                          return Number.isFinite(ts) && ts >= cutoff
                        }).length
                      } catch {}
                      // New wallet badge heuristics: few positions and young account
                      let totalPositions = (val as any).positions_count || 0
                      if (!totalPositions) totalPositions = (openPos?.length || 0) + (closedPos?.length || 0)
                      let firstTs = Infinity
                      for (const p of [...(openPos||[]), ...(closedPos||[])]) {
                        const cAt = (p as any)?.created_at
                        const t = cAt ? Date.parse(String(cAt)) : NaN
                        if (Number.isFinite(t)) firstTs = Math.min(firstTs, t)
                      }
                      const ageDays = Number.isFinite(firstTs) ? Math.max(0, Math.floor((Date.now() - firstTs) / (24*60*60*1000))) : null
                      const isNewWallet = (totalPositions <= 5) && (ageDays == null || ageDays <= 14)
                      const newBadge = isNewWallet ? ' • 🆕' : ''
                      // Tags from market (best-effort)
                      let tagsLine = ''
                      try {
                        if (a.conditionId) {
                          const tm = await gammaApi.getMarket(a.conditionId)
                          if (Array.isArray(tm?.tags) && tm.tags.length) {
                            const tags = Array.from(new Set(tm.tags)).slice(0,4).join(', ')
                            tagsLine = `\n🏷️ Tags: ${esc(tags)}`
                          }
                        }
                      } catch {}
                      // Compose trader lines
                      message += `\n\n👤 Trader: <a href=\"${esc(profileUrl)}\">${esc(name)}</a>${whaleStr}${newBadge}`
                      message += `\n📈 PnL: ${pnlStr} • 🏆 Win: ${winStr}`
                      message += `\n💼 Portfolio: ${valStr}`
                      if (trades12h) message += `\n🧾 Trades (12h): ${trades12h}`
                      if (tagsLine) message += tagsLine
                    }
                  } catch {}
                } else if (a.kind === 'smart_skew') {
                  const direction = (a.data as any)?.direction || ''
                  const skew = (a.data as any)?.skew ? Math.round((a.data as any).skew*100) : null
                  const pool = (a.data as any)?.smart_pool_usd != null ? Math.round(Number((a.data as any).smart_pool_usd)).toLocaleString() : null
                  message = `✨ <b>Smart-Skew Alpha</b>\n\n`
                  const parts: string[] = []
                  if (direction) parts.push(direction)
                  if (skew!=null) parts.push(`Skew ${skew}%`)
                  if (pool) parts.push(`Pool $${pool}`)
                  if (parts.length) message += parts.join(' • ')
                } else if (a.kind === 'insider') {
                  message = `✨ <b>Insider Alpha</b>`
                } else {
                  message = `✨ <b>${esc(a.title || 'Alpha')}</b>\n\n${a.summary || ''}`
                }
                const url = getPolymarketMarketUrl(m); if (url) message += `\n🔗 <a href=\"${esc(url)}\">Market</a>`
                await ctx.reply(message, { parse_mode: 'HTML', reply_markup: { inline_keyboard: [[{ text: 'More', callback_data: 'alpha:more:trade' }]] } as any })
                try { await markAlphaSeen({ alphaId: a.id, telegramUserId: userId, chatId: (ctx.chat?.id as any) }) } catch {}
                return
              } catch {}
            }
          }
        } catch {}
      }
      if (latest.length === 0) {
        if (DB_FIRST_ENABLED) {
          logger.info('alpha:buffer empty, trying Supabase/store + fallbacks', { tokenIds: tokenIds?.length || 0, query: query || null })
        } else {
          logger.info('alpha:live scan starting', { tokenIds: tokenIds?.length || 0, query: query || null })
        }

        // New: Trade-first alpha scan (Data API global trades)
        try {
          const { scanAlphaFromTrades } = await import('@smtm/data')
          const best = await scanAlphaFromTrades({ windowMs: 12*60*60*1000, minNotionalUsd: 1000, limit: 1000, maxBatches: 3, onLog: (m, ctx) => logger.info({ ...ctx }, `alpha:trades_first ${m}`) })
          if (best) {
            const notionalStr = `$${Math.round(best.notional).toLocaleString()}`
            let msg = `✨ <b>Fresh Trade</b>\n\n`
            msg += `${best.side || 'TRADE'} ${notionalStr} @ ${(best.price*100).toFixed(1)}¢\n`
            let marketTitle: string | undefined
            let marketSlug: string | undefined
            let marketUrl: string | null | undefined
            try {
              const m = await gammaApi.getMarket(best.marketId)
              marketUrl = getPolymarketMarketUrl(m)
              // event slug preferred
              marketSlug = (Array.isArray(m?.events) && m.events[0]?.slug) ? String(m.events[0].slug) : (m?.slug ? String(m.slug) : undefined)
              if (m?.question) {
                marketTitle = String(m.question)
                msg = `✨ <b>${esc(marketTitle)}</b>\n\n` + msg
              }
              if (marketUrl) msg += `\n🔗 <a href=\"${esc(marketUrl)}\">Market</a>`
            } catch {}
            // Enrich trader details: PnL, win rate, portfolio, new wallet badge, categories
            try {
              const addr = best.wallet
              const disp = (best as any).displayName || ''
              const profileUrl = getPolymarketProfileUrl(disp || null, addr)
              const short = `${addr.slice(0,6)}…${addr.slice(-4)}`
              const [pnlAgg, winr, val, openPos, closedPos, prof] = await Promise.all([
                dataApi.getUserAccuratePnL(addr).catch(()=>({ totalPnL: 0, realizedPnL:0, unrealizedPnL:0, currentValue:0 })),
                dataApi.getUserWinRate(addr).catch(()=>({ wins:0, total:0, winRate:0 })),
                dataApi.getUserValue(addr).catch(()=>({ user: addr, value:'0', positions_count: 0 })),
                dataApi.getUserPositions({ user: addr, limit: 100 }).catch(()=>[]),
                dataApi.getClosedPositions(addr, 200).catch(()=>[]),
                dataApi.getUserProfileMetrics(addr).catch(()=>({})) as any,
              ])
              // Always fetch UI hero PnL and prefer it when it disagrees materially
              try {
                const uiPnl = await dataApi.getUserPnLFromProfile(disp || addr).catch(()=>null)
                if (uiPnl != null) {
                  const comp = Number(pnlAgg.totalPnL || 0)
                  const disagree = (Math.sign(uiPnl) !== Math.sign(comp)) || (Math.abs(uiPnl) > Math.abs(comp) * 1.5)
                  if (disagree || Math.abs(comp) < 1) {
                    const pnlAggAny: any = pnlAgg
                    pnlAggAny.totalPnL = uiPnl
                  }
                }
              } catch {}
              const name = disp || short
              const pnlStr = `${pnlAgg.totalPnL >= 0 ? '+' : '-'}$${Math.abs(Math.round(pnlAgg.totalPnL)).toLocaleString()}`
              const winStr = `${Math.round(winr.winRate)}% (${winr.wins}/${winr.total})`
              const valNum = parseFloat(String((val as any).value || '0'))
              const valStr = `$${Math.round(valNum).toLocaleString()}`
              const whaleStr = (best as any).whaleScore != null ? ` • 🐋 ${Math.round((best as any).whaleScore)}` : ''
              // Trades in last 12h (best-effort)
              let trades12h = 0
              try {
                const raw = await dataApi.getTrades({ user: addr, limit: 1000 })
                const cutoff = Date.now() - 12*60*60*1000
                trades12h = (raw || []).filter((t:any)=>{
                  const r = t.timestamp || t.match_time || t.last_update
                  const ts = typeof r === 'number' ? (r > 1e12 ? r : r*1000) : Date.parse(String(r))
                  return Number.isFinite(ts) && ts >= cutoff
                }).length
              } catch {}
              // New wallet badge heuristics: few positions and young account
              let totalPositions = (val as any).positions_count || 0
              if (!totalPositions) totalPositions = (openPos?.length || 0) + (closedPos?.length || 0)
              let firstTs = Infinity
              for (const p of [...(openPos||[]), ...(closedPos||[])]) {
                const cAt = (p as any)?.created_at
                const t = cAt ? Date.parse(String(cAt)) : NaN
                if (Number.isFinite(t)) firstTs = Math.min(firstTs, t)
              }
              const ageDays = Number.isFinite(firstTs) ? Math.max(0, Math.floor((Date.now() - firstTs) / (24*60*60*1000))) : null
              const isNewWallet = (totalPositions <= 5) && (ageDays == null || ageDays <= 14)
              const newBadge = isNewWallet ? ' • 🆕' : ''
              // Categorization flags
              const notional = Math.round((best as any).notional || 0)
              const whaleScore = (best as any).whaleScore || 0
              const highReturn = (pnlAgg.totalPnL >= 20000 && winr.winRate >= 55)
              const insiderish = (notional >= 20000) && (isNewWallet || whaleScore >= 80)
              const catParts: string[] = []
              if (highReturn) catParts.push('📈 High Return')
              if (insiderish) catParts.push('🕵️ Potential Insider')
              // Compose message
              msg += `\n👤 Trader: <a href=\"${esc(profileUrl)}\">${esc(name)}</a>${whaleStr}${newBadge}`
              msg += `\n📈 PnL: ${pnlStr} • 🏆 Win: ${winStr}`
              msg += `\n💼 Portfolio: ${valStr}`
              if (trades12h) msg += `\n🧾 Trades (12h): ${trades12h}`
              const preds = (prof as any)?.predictions
              if (preds != null) msg += `\n📟 Predictions: ${preds}`
              if ((best as any).tags && (best as any).tags.length) {
                const tags = Array.from(new Set((best as any).tags)).slice(0,4).join(', ')
                msg += `\n🏷️ Tags: ${esc(tags)}`
              }
              if (catParts.length) {
                msg += `\n🔎 ${catParts.join(' • ')}`
              }
            } catch {}
            const kb = { inline_keyboard: [[{ text: 'More', callback_data: `alpha:more:trade` }]] }
            await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb as any })
            // Persist this alpha to DB if enabled
            try {
              const { persistAlphaEvent, markAlphaSeen } = await import('../services/alpha-store')
              const alphaScore = best.notional >= 50000 ? 90 : best.notional >= 20000 ? 80 : best.notional >= 10000 ? 70 : 60
              const insertedId = await persistAlphaEvent({
                id: `${Date.now()}-${best.tokenId}-${Math.round(best.notional)}`,
                ts: Date.now(),
                kind: 'whale',
                tokenId: best.tokenId,
                conditionId: best.marketId || undefined,
                wallet: (best as any).wallet || null,
                alpha: alphaScore,
                marketName: marketTitle,
                marketSlug,
                marketUrl: marketUrl || undefined,
                title: 'Fresh Trade',
                summary: `${best.side || 'TRADE'} $${Math.round(best.notional).toLocaleString()} @ ${(best.price*100).toFixed(1)}¢`,
                data: {
                  weightedNotionalUsd: best.notional,
                  whaleScore: (best as any).whaleScore ?? null,
                  recommendation: null,
                  side: best.side || null,
                  price: best.price || null,
                  size: best.size || null,
                  traderDisplayName: (best as any).displayName || null,
                },
              } as any)
              if (insertedId && ctx.from?.id) {
                await markAlphaSeen({ alphaId: insertedId, telegramUserId: ctx.from.id, chatId: ctx.chat?.id as any })
              }
            } catch {}
            return
          }
        } catch (e) {
          logger.warn({ err: String((e as any)?.message || e) }, 'alpha:trades_first_error')
        }
        // New fallback: Smart Money Skew scan (deprecates legacy progressive scan)
        try {
          const active = await gammaApi.getActiveMarkets(80, 'volume').catch(()=>[] as any[])
          const pairs: Array<{ cond: string; yes: string; no: string; title: string }> = []
          for (const m of active) {
            const yes = (m.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='yes')?.token_id
            const no = (m.tokens || []).find((t:any)=> String(t.outcome||'').toLowerCase()==='no')?.token_id
            if (m.condition_id && yes && no) pairs.push({ cond: m.condition_id, yes, no, title: m.question || m.slug || m.condition_id })
            if (pairs.length >= 35) break
          }
          let bestSkew: any = null
          for (const p of pairs) {
            try {
              const { computeSmartSkewFromHolders } = await import('@smtm/data')
              const res = await computeSmartSkewFromHolders({ conditionId: p.cond, yesTokenId: p.yes, noTokenId: p.no }, { onLog: (m, c)=> logger.info({ ...c }, `alpha:skew ${m}`) })
              if (res.trigger) {
                const score = res.alpha + res.smartPoolUsd/100
                if (!bestSkew || score > bestSkew._score) bestSkew = { ...res, _score: score, pair: p }
              }
            } catch {}
          }
          if (bestSkew) {
            const m = await gammaApi.getMarket(bestSkew.pair.cond)
            const url = getPolymarketMarketUrl(m)
            const directionEmoji = bestSkew.direction === 'YES' ? '✅' : '❌'
            let msg = `✨ <b>${esc(m.question || bestSkew.pair.title)}</b>\n\n`
            msg += `⚖️ Smart-Skew Alpha: <b>${bestSkew.alpha}</b>\n`
            msg += `${directionEmoji} ${bestSkew.direction} • Skew ${Math.round(bestSkew.skew*100)}% • Pool $${Math.round(bestSkew.smartPoolUsd).toLocaleString()}\n`
            // Per-direction wallet examples (top 3 on skewed side)
            if (Array.isArray((bestSkew as any).examples) && (bestSkew as any).examples.length) {
              msg += `\nTop Wallets (${bestSkew.direction}):\n`
              for (const ex of (bestSkew as any).examples) {
                const short = ex.wallet.slice(0,6)+"…"+ex.wallet.slice(-4)
                const pnlStr = `${ex.pnl >= 0 ? '+' : '-'}$${Math.abs(Math.round(ex.pnl)).toLocaleString()}`
                msg += `• <code>${short}</code> — $${Math.round(ex.valueUsd).toLocaleString()} • 🐋 ${Math.round(ex.whaleScore)} • PnL ${pnlStr}\n`
              }
            }
            if (url) msg += `\n🔗 <a href=\"${esc(url)}\">Market</a>`
            const kb = { inline_keyboard: [[{ text: 'More', callback_data: `alpha:more:trade` }]] }
            await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb as any })
            // Persist smart-skew alpha and mark seen
            try {
              const { persistAlphaEvent, markAlphaSeen } = await import('../services/alpha-store')
              const insertedId = await persistAlphaEvent({
                id: `${Date.now()}-skew-${bestSkew.pair.cond}`,
                ts: Date.now(),
                kind: 'smart_skew',
                tokenId: bestSkew.direction === 'YES' ? bestSkew.pair.yes : bestSkew.pair.no,
                conditionId: bestSkew.pair.cond,
                alpha: bestSkew.alpha,
                title: `Smart-Skew Alpha ${bestSkew.alpha}`,
                summary: `${bestSkew.direction} • Skew ${Math.round(bestSkew.skew*100)}% • Pool $${Math.round(bestSkew.smartPoolUsd).toLocaleString()}`,
                data: bestSkew,
              } as any)
              if (insertedId && ctx.from?.id) {
                await markAlphaSeen({ alphaId: insertedId, telegramUserId: ctx.from.id, chatId: ctx.chat?.id as any })
              }
            } catch {}
            return
          }
        } catch (e) {
          logger.warn({ err: String((e as any)?.message || e) }, 'alpha:skew_fallback_error')
        }
        // Nothing found
        await ctx.reply('⚠️ No fresh alpha found in the recent window.', { disable_web_page_preview: true })
        return
        // Fallback: hit CLOB API for recent big orders (real trades)
        const { findRecentBigOrders } = await import('@smtm/data')
        let bigs = await findRecentBigOrders({
          tokenIds,
          minNotionalUsd: 2000,
          withinMs: 24*60*60*1000,
          perTokenLimit: 50,
          onLog: (m, ctx) => logger.info({ ...ctx }, `alpha:big ${m}`)
        })
        logger.info('alpha:fallback big orders', { count: bigs.length, threshold: 2000 })
        if (!bigs.length) {
          // Try largest trade even if below threshold
          const any = await findRecentBigOrders({ tokenIds, minNotionalUsd: 0, withinMs: 24*60*60*1000, perTokenLimit: 50, onLog: (m, ctx) => logger.info({ ...ctx }, `alpha:any ${m}`) })
          logger.info('alpha:fallback any orders', { count: any.length })
          if (any.length) {
            any.sort((a,b)=>b.notional - a.notional)
            bigs = [any[0]]
          }
        }
        if (!bigs.length) {
          // Last-resort: show most recent buffered trade if any
          const { TradeBuffer, buildWhaleAlphaForTrade } = await import('@smtm/data')
          const trades = tokenIds?.length ? TradeBuffer.getTrades(1, { tokenIds }) : TradeBuffer.getTrades(1)
          logger.info('alpha:fallback buffer trade count', { count: trades.length })
          if (!trades.length) {
            // Progressive live scan across trending + active universe (sequential up to ~5m)
            const { progressiveLiveScan } = await import('@smtm/data')
            let tooManyErrors = false
            let totalTokens = 0
            let lastIdx = 0
            let startedAt = Date.now()
            let lastEditAt = 0
            const throttleMs = 1200

            function makeProgressLine(idx: number, total: number, extra?: string) {
              const t = Math.max(1, total || 1)
              const i = Math.min(Math.max(0, idx), t)
              const pct = Math.round((i / t) * 100)
              const bars = 10
              const filled = Math.round((pct / 100) * bars)
              const bar = '▰'.repeat(filled) + '▱'.repeat(bars - filled)
              const tail = extra ? ` • ${extra}` : ''
              return `⏳ ${pct}% ${bar} (${i}/${t})${tail}`
            }

            const best = await progressiveLiveScan({
              minNotionalUsd: 2000,
              withinMs: 24*60*60*1000,
              perTokenLimit: 100,
              maxMarkets: 100,
              delayMs: 250,
              maxDurationMs: 5*60*1000,
              maxErrors: 10,
              onLog: async (m, ctx) => {
                logger.info({ ...ctx }, `alpha:prog ${m}`)
                try {
                  const now = Date.now()
                  if (m === 'progressive.start') {
                    startedAt = now
                    await ctxRef.telegram.editMessageText(searching.chat.id, searching.message_id, undefined, `🔎 Scanning markets for fresh alpha…`, {})
                  } else if (m === 'progressive.markets_fetched') {
                    const tr = ctx?.trending ?? 0, ac = ctx?.active ?? 0
                    await ctxRef.telegram.editMessageText(searching.chat.id, searching.message_id, undefined, `🔎 Preparing scan set… Trending: ${tr}, Active: ${ac}`, {})
                  } else if (m === 'progressive.final_token_count') {
                    totalTokens = ctx?.count || 0
                    await ctxRef.telegram.editMessageText(searching.chat.id, searching.message_id, undefined, `🔎 Scan set ready • ${totalTokens} tokens`, {})
                  } else if (m === 'progressive.trades') {
                    const idx = (ctx && ctx.idx) || 0
                    const total = (ctx && ctx.total) || totalTokens || 0
                    // Throttle UI updates
                    if (now - lastEditAt > throttleMs && (idx !== lastIdx)) {
                      lastIdx = idx
                      lastEditAt = now
                      const line = makeProgressLine(idx, total)
                      await ctxRef.telegram.editMessageText(searching.chat.id, searching.message_id, undefined, `🔎 Searching…\n${line}`, { })
                    }
                  } else if (m === 'progressive.best_update') {
                    const notionalStr = ctx?.notional ? `$${Math.round(ctx.notional).toLocaleString()}` : '$0'
                    await ctxRef.telegram.editMessageText(searching.chat.id, searching.message_id, undefined, `✨ Candidate found: ${notionalStr}`, {})
                  } else if (m === 'progressive.too_many_errors') {
                    tooManyErrors = true
                    await ctxRef.telegram.editMessageText(searching.chat.id, searching.message_id, undefined, `❌ Scan stopped due to repeated errors.`, {})
                  } else if (m === 'progressive.timeout') {
                    await ctxRef.telegram.editMessageText(searching.chat.id, searching.message_id, undefined, `⏱️ Scan timed out. Partial results only.`, {})
                  }
                } catch {}
              }
            })
            logger.info('alpha:fallback live scan', { found: !!best, notional: best ? Math.round(best.notional) : 0 })
            if (!best) {
              const elapsed = Math.round((Date.now() - startedAt)/1000)
              const scanned = lastIdx || 0
              const total = totalTokens || scanned
              const summary = tooManyErrors
                ? '❌ Scan stopped due to repeated errors. Please try again later.'
                : '⚠️ No fresh alpha found in the recent window.'
              const line = makeProgressLine(scanned, total, `${elapsed}s`)
              await ctx.reply(`${summary}\n\n${line}`, { disable_web_page_preview: true })
              return
            }
            const notionalStr = `$${Math.round(best.notional).toLocaleString()}`
            let msg = `✨ <b>Live Scan: Big Trade</b>\n\n`
            msg += `${best.side || 'TRADE'} ${notionalStr} @ ${(best.price*100).toFixed(1)}¢\n`
            try {
              const m = await gammaApi.getMarket(best.marketId || (query || ''))
              const url = getPolymarketMarketUrl(m)
              if (m?.question) msg = `✨ <b>${esc(m.question)}</b>\n\n` + msg
              if (url) msg += `\n🔗 <a href=\"${esc(url)}\">Market</a>`
            } catch {}
            await ctx.reply(msg, { parse_mode: 'HTML' })
            // Persist
            try {
              const { persistAlphaEvent } = await import('../services/alpha-store')
              const alphaScore = best.notional >= 50000 ? 90 : best.notional >= 20000 ? 80 : best.notional >= 10000 ? 70 : 60
              await persistAlphaEvent({
                id: `${Date.now()}-${best.tokenId}-${Math.round(best.notional)}`,
                ts: Date.now(),
                kind: 'whale',
                tokenId: best.tokenId,
                conditionId: best.marketId || undefined,
                alpha: alphaScore,
                title: 'Live Scan: Big Trade',
                summary: `${best.side || 'TRADE'} $${Math.round(best.notional).toLocaleString()} @ ${(best.price*100).toFixed(1)}¢`,
                data: { weightedNotionalUsd: best.notional, whaleScore: null, recommendation: null },
              } as any)
            } catch {}
            return
          }
          const t = trades[trades.length - 1]
          const alpha = await buildWhaleAlphaForTrade({ wallet: (t.wallet||'').toLowerCase(), sizeShares: t.size, price: t.price, tokenId: t.tokenId })
          const short = t.wallet ? t.wallet.slice(0,6)+'...'+t.wallet.slice(-4) : 'unknown'
          let msg = `✨ <b>Latest Trade</b>\n\n`
          msg += `🐋 WhaleScore: ${alpha.whaleScore} • Alpha: ${alpha.alpha} (${alpha.recommendation})\n`
          msg += `Value: $${Math.round(t.notional).toLocaleString()}\n`
          msg += `Wallet: <code>${short}</code>`
          await ctx.reply(msg, { parse_mode: 'HTML' })
          return
        }
        const b = bigs[0]
        const notionalStr = `$${Math.round(b.notional).toLocaleString()}`
        const titleText = b.notional >= 2000 ? 'Big Order Detected' : 'Largest Recent Trade'
        let msg = `✨ <b>${titleText}</b>\n\n`
        msg += `${b.side || 'TRADE'} ${notionalStr} @ ${(b.price*100).toFixed(1)}¢\n`
        // Try to attach market link if possible
        try {
          const m = await gammaApi.getMarket(b.marketId || (query || ''))
          const url = getPolymarketMarketUrl(m)
          if (m?.question) msg = `✨ <b>${esc(m.question)}</b>\n\n` + msg
          if (url) msg += `\n🔗 <a href="${esc(url)}">Market</a>`
        } catch {}
        await ctx.reply(msg, { parse_mode: 'HTML' })
        // Persist this fallback alpha so subsequent /alpha can read it as fresh
        try {
          const { persistAlphaEvent } = await import('../services/alpha-store')
          const alphaScore = b.notional >= 50000 ? 90 : b.notional >= 20000 ? 80 : b.notional >= 10000 ? 70 : 60
          await persistAlphaEvent({
            id: `${Date.now()}-${b.tokenId}-${Math.round(b.notional)}`,
            ts: Date.now(),
            kind: 'whale',
            tokenId: b.tokenId,
            conditionId: b.marketId || undefined,
            alpha: alphaScore,
            title: titleText,
            summary: `${b.side || 'TRADE'} $${Math.round(b.notional).toLocaleString()} @ ${(b.price*100).toFixed(1)}¢`,
            data: { weightedNotionalUsd: b.notional, whaleScore: null, recommendation: null },
          } as any)
        } catch {}
        return
      }

      const a = latest[0]
      const title = marketTitle || a.marketName || 'Fresh Alpha'
      // Try to build a market URL
      let marketUrl: string | null = null
      if (query) {
        const market = await resolveMarketFromInput(query)
        if (market) marketUrl = getPolymarketMarketUrl(market)
      } else if (a.conditionId) {
        try { const m = await gammaApi.getMarket(a.conditionId); marketUrl = getPolymarketMarketUrl(m) } catch {}
      }
      const wallet = a.wallet ? (a.wallet.slice(0,6)+'...'+a.wallet.slice(-4)) : ''
      let msg = `✨ <b>${title}</b>\n\n`
      if (a.kind === 'whale') {
        const rec = a.data?.recommendation ? ` (${a.data.recommendation})` : ''
        msg += `🐋 Whale Alpha: <b>${a.alpha}</b>${rec}\n`
        if (a.data?.whaleScore != null) msg += `WhaleScore: ${a.data.whaleScore}\n`
        if (a.data?.weightedNotionalUsd != null) msg += `Value: $${Number(a.data.weightedNotionalUsd).toLocaleString()}\n`
        if (wallet) {
          const profileUrl = getPolymarketProfileUrl(null, a.wallet!)
          msg += `Wallet: <code>${wallet}</code>\n`
          msg += `🔗 <a href="${esc(profileUrl)}">Profile</a>\n`
        }
      } else if (a.kind === 'smart_skew') {
        msg += `⚖️ Smart-Skew Alpha: <b>${a.alpha}</b>\n${a.summary}\n`
      } else if (a.kind === 'insider') {
        msg += `🕵️ Insider Alpha: <b>${a.alpha}</b>\n${a.summary}\n`
      }
      if (marketUrl) msg += `\n🔗 <a href="${esc(marketUrl)}">Market</a>`

      const when = new Date(a.ts).toISOString().replace('T',' ').slice(0, 19) + 'Z'
      msg += `\n🕒 ${when}`
      const kb = { inline_keyboard: [[{ text: 'More', callback_data: `alpha:more:1${tokenIds && tokenIds.length?':'+tokenIds.join(','):''}` }]] }
      // Edit the searching message if possible, otherwise send a new one
      try {
        await ctx.telegram.editMessageText(searching.chat.id, searching.message_id, undefined, msg, { parse_mode: 'HTML', reply_markup: kb as any })
      } catch {
        await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb as any })
      }
    } catch (e) {
      logger.error('alpha command failed', e)
      await ctx.reply('❌ Failed to fetch alpha. Try again later.')
    } finally {
      const userId = ctx.from?.id
      if (userId && (global as any)._alphaLocks) {
        const alphaLocks: Map<number, { running: boolean; lastTs: number }> = (global as any)._alphaLocks
        alphaLocks.set(userId, { running: false, lastTs: Date.now() })
      }
    }
  })

  // Alpha pagination via inline button
  bot.on('callback_query', async (ctx, next) => {
    try {
      const data = (ctx.callbackQuery as any)?.data as string | undefined
      if (!data) return await next()
      if (!data.startsWith('alpha:more:')) return await next()
      await ctx.answerCbQuery('Loading more alpha...')
      const parts = data.split(':')
      // Trade-first refresh path
      if (parts[2] === 'trade') {
        try {
          // Log-only DB probe for unseen alpha (do not display)
          try {
            if (DB_LOG_ONLY_PROBE && ctx.from?.id) {
              const userId = ctx.from.id
              const { fetchRecentAlpha, fetchSeenAlphaIds } = await import('../services/alpha-store')
              const seenIds = await fetchSeenAlphaIds({ telegramUserId: userId, maxAgeSec: 12*60*60 })
              const recents = await fetchRecentAlpha({ limit: 3, maxAgeSec: 12*60*60, excludeIds: seenIds })
              for (const a of recents || []) {
                logger.info({ id: a.id, kind: a.kind, conditionId: a.conditionId, tokenId: a.tokenId, alpha: a.alpha }, 'alpha:db unseen')
              }
            }
          } catch {}
          // DB-first disabled during schema enrichment
          const { scanAlphaFromTrades } = await import('@smtm/data')
          let best = await scanAlphaFromTrades({ windowMs: 12*60*60*1000, minNotionalUsd: 1000, limit: 1000, maxBatches: 3, onLog: (m, c) => logger.info({ ...c }, `alpha:trades_first ${m}`) })
          if (!best) {
            try { best = await scanAlphaFromTrades({ windowMs: 12*60*60*1000, minNotionalUsd: 500, limit: 1000, maxBatches: 3, onLog: (m, c) => logger.info({ ...c }, `alpha:trades_first_retry ${m}`) }) } catch {}
          }
          if (!best) { await ctx.reply('No fresh trades right now. Try again soon.'); return }
          const notionalStr = `$${Math.round(best.notional).toLocaleString()}`
          let msg = `✨ <b>Fresh Trade</b>\n\n`
          msg += `${best.side || 'TRADE'} ${notionalStr} @ ${(best.price*100).toFixed(1)}¢\n`
          try {
            const m = await gammaApi.getMarket(best.marketId)
            const url = getPolymarketMarketUrl(m)
            if (m?.question) msg = `✨ <b>${esc(m.question)}</b>\n\n` + msg
            if (url) msg += `\n🔗 <a href=\"${esc(url)}\">Market</a>`
          } catch {}
          try {
            const addr = best.wallet
            const disp = (best as any).displayName || ''
            const profileUrl = getPolymarketProfileUrl(disp || null, addr)
            const short = `${addr.slice(0,6)}…${addr.slice(-4)}`
            const [pnlAgg, winr, val, openPos, closedPos] = await Promise.all([
              dataApi.getUserAccuratePnL(addr).catch(()=>({ totalPnL: 0, realizedPnL:0, unrealizedPnL:0, currentValue:0 })),
              dataApi.getUserWinRate(addr).catch(()=>({ wins:0, total:0, winRate:0 })),
              dataApi.getUserValue(addr).catch(()=>({ user: addr, value:'0', positions_count: 0 })),
              dataApi.getUserPositions({ user: addr, limit: 100 }).catch(()=>[]),
              dataApi.getClosedPositions(addr, 200).catch(()=>[]),
            ])
            try {
              const uiPnl = await dataApi.getUserPnLFromProfile(disp || addr).catch(()=>null)
              if (uiPnl != null) {
                const comp = Number(pnlAgg.totalPnL || 0)
                const disagree = (Math.sign(uiPnl) !== Math.sign(comp)) || (Math.abs(uiPnl) > Math.abs(comp) * 1.5)
                if (disagree || Math.abs(comp) < 1) {
                  const pnlAggAny: any = pnlAgg
                  pnlAggAny.totalPnL = uiPnl
                }
              }
            } catch {}
            const name = disp || short
            const pnlStr = `${pnlAgg.totalPnL >= 0 ? '+' : '-'}$${Math.abs(Math.round(pnlAgg.totalPnL)).toLocaleString()}`
            const winStr = `${Math.round(winr.winRate)}% (${winr.wins}/${winr.total})`
            const valNum = parseFloat(String((val as any).value || '0'))
            const valStr = `$${Math.round(valNum).toLocaleString()}`
            const whaleStr = (best as any).whaleScore != null ? ` • 🐋 ${Math.round((best as any).whaleScore)}` : ''
            let totalPositions = (val as any).positions_count || 0
            if (!totalPositions) totalPositions = (openPos?.length || 0) + (closedPos?.length || 0)
            let firstTs = Infinity
            for (const p of [...(openPos||[]), ...(closedPos||[])]) {
              const cAt = (p as any)?.created_at
              const t = cAt ? Date.parse(String(cAt)) : NaN
              if (Number.isFinite(t)) firstTs = Math.min(firstTs, t)
            }
            const ageDays = Number.isFinite(firstTs) ? Math.max(0, Math.floor((Date.now() - firstTs) / (24*60*60*1000))) : null
            const isNewWallet = (totalPositions <= 5) && (ageDays == null || ageDays <= 14)
            const newBadge = isNewWallet ? ' • 🆕' : ''
            const notional = Math.round((best as any).notional || 0)
            const whaleScore = (best as any).whaleScore || 0
            const highReturn = (pnlAgg.totalPnL >= 20000 && winr.winRate >= 55)
            const insiderish = (notional >= 20000) && (isNewWallet || whaleScore >= 80)
            const catParts: string[] = []
            if (highReturn) catParts.push('📈 High Return')
            if (insiderish) catParts.push('🕵️ Potential Insider')
            msg += `\n👤 Trader: <a href=\"${esc(profileUrl)}\">${esc(name)}</a>${whaleStr}${newBadge}`
            msg += `\n📈 PnL: ${pnlStr} • 🏆 Win: ${winStr}`
            msg += `\n💼 Portfolio: ${valStr}`
            if ((best as any).tags && (best as any).tags.length) {
              const tags = Array.from(new Set((best as any).tags)).slice(0,4).join(', ')
              msg += `\n🏷️ Tags: ${esc(tags)}`
            }
            if (catParts.length) { msg += `\n🔎 ${catParts.join(' • ')}` }
          } catch {}
          const kb = { inline_keyboard: [[{ text: 'More', callback_data: `alpha:more:trade` }]] }
          await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb as any })
          return
        } catch (e) {
          logger.error('alpha:more trade-first failed', e)
          await ctx.reply('Error fetching fresh trade. Please try again.')
          return
        }
      }
      const offset = parseInt(parts[2] || '1', 10)
      const tokenIdsArg = parts[3] ? parts[3].split(',') : undefined
      const { AlphaAggregator } = await import('../services/alpha-aggregator')
      const list = AlphaAggregator.getLatest(offset + 1, tokenIdsArg)
      if (list.length <= offset) {
        await ctx.reply('No more alpha right now. Check back soon!')
        return
      }
      const a = list[list.length - 1 - offset]
      const title = a.marketName || 'Alpha'
      // Build market URL if possible
      let marketUrl: string | null = null
      if (a.conditionId) {
        try { const m = await gammaApi.getMarket(a.conditionId); marketUrl = getPolymarketMarketUrl(m) } catch {}
      }
      const wallet = a.wallet ? (a.wallet.slice(0,6)+'...'+a.wallet.slice(-4)) : ''
      let msg = `✨ <b>${title}</b>\n\n`
      if (a.kind === 'whale') {
        const rec = a.data?.recommendation ? ` (${a.data.recommendation})` : ''
        msg += `🐋 Whale Alpha: <b>${a.alpha}</b>${rec}\n`
        if (a.data?.whaleScore != null) msg += `WhaleScore: ${a.data.whaleScore}\n`
        if (a.data?.weightedNotionalUsd != null) msg += `Value: $${Number(a.data.weightedNotionalUsd).toLocaleString()}\n`
        if (wallet) msg += `Wallet: <code>${wallet}</code>\n`
      } else if (a.kind === 'smart_skew') {
        msg += `⚖️ Smart-Skew Alpha: <b>${a.alpha}</b>\n${a.summary}\n`
      } else if (a.kind === 'insider') {
        msg += `🕵️ Insider Alpha: <b>${a.alpha}</b>\n${a.summary}\n`
      }
      if (marketUrl) msg += `\n🔗 <a href="${esc(marketUrl)}">Market</a>`
      const when = new Date(a.ts).toISOString().replace('T',' ').slice(0, 19) + 'Z'
      msg += `\n🕒 ${when}`
      const nextOffset = offset + 1
      const kb = { inline_keyboard: [[{ text: 'More', callback_data: `alpha:more:${nextOffset}${tokenIdsArg && tokenIdsArg.length?':'+tokenIdsArg.join(','):''}` }]] }
      await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb as any })
    } catch (e) {
      logger.error('alpha:more failed', e)
      try { await ctx.answerCbQuery('Error loading more alpha') } catch {}
    }
  })

  // Alpha DB health check
  bot.command(['alpha-db','alpha_db'], async (ctx) => {
    try {
      const { alphaStoreHealth, fetchRecentAlpha, fetchSeenAlphaIds } = await import('../services/alpha-store')
      const { env } = await import('@smtm/shared/env')
      const status = await alphaStoreHealth()
      let msg = '🗄️ Alpha DB Health\n\n'
      msg += `Enabled: ${status.enabled ? 'yes' : 'no'}\n`
      msg += `Available: ${status.available ? 'yes' : 'no'}\n`
      msg += `Readable: ${status.canRead ? 'yes' : 'no'}\n`
      msg += `Save Enabled (SUPABASE_ALPHA_ENABLED): ${env.SUPABASE_ALPHA_ENABLED === 'true' ? 'yes' : 'no'}\n`
      msg += `Analytics Enabled (SUPABASE_ANALYTICS_ENABLED): ${(env as any).SUPABASE_ANALYTICS_ENABLED === 'true' ? 'yes' : 'no'}\n`
      if (status.reason && !status.canRead) msg += `Reason: ${status.reason}\n`
      // Recent counts (best-effort)
      try {
        const recent = await fetchRecentAlpha({ limit: 3, maxAgeSec: 12*60*60 })
        msg += `Recent alpha (<=12h): ${recent.length}\n`
        if (ctx.from?.id) {
          const seen = await fetchSeenAlphaIds({ telegramUserId: ctx.from.id, maxAgeSec: 12*60*60 })
          const unseen = recent.filter(r => !seen.includes(r.id)).length
          msg += `Unseen for you: ${unseen}\n`
        }
      } catch {}
      await ctx.reply(msg)
    } catch (e) {
      await ctx.reply('DB health check failed. Check server logs.')
    }
  })

  // Alpha DB preview: list recent alpha events from DB and show seen status without altering UX
  bot.command(['alpha_db_preview','alpha-db-preview','alpha_db_unseen'], async (ctx) => {
    try {
      const { alphaStoreHealth, fetchRecentAlpha, fetchSeenAlphaIds } = await import('../services/alpha-store')
      const { env } = await import('@smtm/shared/env')
      const ok = await alphaStoreHealth()
      if (!ok.enabled || !ok.available) {
        await ctx.reply('DB save/read disabled or unavailable. Run /alpha_db for details.')
        return
      }
      const userId = ctx.from?.id
      // For preview, lower criteria aggressively: look back 72h and do not filter by seen status for display
      const seenIds = (userId && env.SUPABASE_ANALYTICS_ENABLED === 'true')
        ? await fetchSeenAlphaIds({ telegramUserId: userId, maxAgeSec: 72*60*60 })
        : []
      const events = await fetchRecentAlpha({ limit: 10, maxAgeSec: 72*60*60 })
      if (!events.length) {
        await ctx.reply('No recent alpha in DB (<=12h).')
        return
      }
      // Build a simple list with seen flag
      let msg = '🗄️ DB Alpha Preview (<=72h)\n\n'
      let i = 0
      for (const a of events) {
        i += 1
        const seen = seenIds.includes(a.id)
        msg += `${i}. ${a.kind} • α=${a.alpha} • seen=${seen ? 'yes' : 'no'}\n   id=${a.id} cond=${a.conditionId || ''}\n`
      }
      await ctx.reply(msg)

      // Also show a rich preview for the first unseen if available
      const firstAny = events[0]
      if (firstAny?.conditionId) {
        try {
          const m = await gammaApi.getMarket(firstAny.conditionId)
          const url = getPolymarketMarketUrl(m)
          let card = ''
          if (firstAny.kind === 'whale') {
            const d: any = firstAny.data || {}
            const notional = d.notional_usd ?? d.weightedNotionalUsd
            const side = d.side || 'TRADE'
            const notionalStr = notional != null ? `$${Math.round(Number(notional)).toLocaleString()}` : ''
            const price = d.price
            const priceStr = Number.isFinite(Number(price)) ? ` @ ${(Number(price)*100).toFixed(1)}¢` : ''
            card = `✨ <b>Fresh Trade (DB Preview)</b>\n\n${side}${notionalStr ? ` ${notionalStr}` : ''}${priceStr}`
            // Enrich trader and context similar to live output
            try {
              const addr = (firstAny.wallet || '').toLowerCase()
              if (addr) {
                const disp = (d.trader_display_name || d.traderDisplayName || '') as string
                const profileUrl = getPolymarketProfileUrl(disp || null, addr)
                const short = `${addr.slice(0,6)}…${addr.slice(-4)}`
                const [pnlAgg, winr, val, openPos, closedPos, prof] = await Promise.all([
                  dataApi.getUserAccuratePnL(addr).catch(()=>({ totalPnL: 0, realizedPnL:0, unrealizedPnL:0, currentValue:0 })),
                  dataApi.getUserWinRate(addr).catch(()=>({ wins:0, total:0, winRate:0 })),
                  dataApi.getUserValue(addr).catch(()=>({ user: addr, value:'0', positions_count: 0 })),
                  dataApi.getUserPositions({ user: addr, limit: 100 }).catch(()=>[]),
                  dataApi.getClosedPositions(addr, 200).catch(()=>[]),
                  dataApi.getUserProfileMetrics(addr).catch(()=>({})) as any,
                ])
                // Prefer UI hero PnL when it disagrees materially
                try {
                  const uiPnl = await dataApi.getUserPnLFromProfile(disp || addr).catch(()=>null)
                  if (uiPnl != null) {
                    const comp = Number(pnlAgg.totalPnL || 0)
                    const disagree = (Math.sign(uiPnl) !== Math.sign(comp)) || (Math.abs(uiPnl) > Math.abs(comp) * 1.5)
                    if (disagree || Math.abs(comp) < 1) {
                      const pnlAggAny: any = pnlAgg
                      pnlAggAny.totalPnL = uiPnl
                    }
                  }
                } catch {}
                const name = disp || short
                const pnlStr = `${pnlAgg.totalPnL >= 0 ? '+' : '-'}$${Math.abs(Math.round(pnlAgg.totalPnL)).toLocaleString()}`
                const winStr = `${Math.round(winr.winRate)}% (${winr.wins}/${winr.total})`
                const valNum = parseFloat(String((val as any).value || '0'))
                const valStr = `$${Math.round(valNum).toLocaleString()}`
                const whaleScore = (d.whale_score != null ? d.whale_score : d.whaleScore)
                const whaleStr = whaleScore != null ? ` • 🐋 ${Math.round(Number(whaleScore))}` : ''
                // Trades in last 12h (best-effort)
                let trades12h = 0
                try {
                  const raw = await dataApi.getTrades({ user: addr, limit: 1000 })
                  const cutoff = Date.now() - 12*60*60*1000
                  trades12h = (raw || []).filter((t:any)=>{
                    const r = t.timestamp || t.match_time || t.last_update
                    const ts = typeof r === 'number' ? (r > 1e12 ? r : r*1000) : Date.parse(String(r))
                    return Number.isFinite(ts) && ts >= cutoff
                  }).length
                } catch {}
                // New wallet badge heuristics: few positions and young account
                let totalPositions = (val as any).positions_count || 0
                if (!totalPositions) totalPositions = (openPos?.length || 0) + (closedPos?.length || 0)
                let firstTs = Infinity
                for (const p of [...(openPos||[]), ...(closedPos||[])]) {
                  const cAt = (p as any)?.created_at
                  const t = cAt ? Date.parse(String(cAt)) : NaN
                  if (Number.isFinite(t)) firstTs = Math.min(firstTs, t)
                }
                const ageDays = Number.isFinite(firstTs) ? Math.max(0, Math.floor((Date.now() - firstTs) / (24*60*60*1000))) : null
                const isNewWallet = (totalPositions <= 5) && (ageDays == null || ageDays <= 14)
                const newBadge = isNewWallet ? ' • 🆕' : ''
                // Categories
                const notionalNum = Math.round(Number(notional || 0))
                const highReturn = (pnlAgg.totalPnL >= 20000 && winr.winRate >= 55)
                const insiderish = (notionalNum >= 20000) && (isNewWallet || (Number(whaleScore) >= 80))
                const catParts: string[] = []
                if (highReturn) catParts.push('📈 High Return')
                if (insiderish) catParts.push('🕵️ Potential Insider')
                // Tags: use market data fetched above
                let tagsLine = ''
                if (Array.isArray(m?.tags) && m.tags.length) {
                  const tags = Array.from(new Set(m.tags)).slice(0,4).join(', ')
                  tagsLine = `\n🏷️ Tags: ${esc(tags)}`
                }
                // Append trader section
                card += `\n\n👤 Trader: <a href=\"${esc(profileUrl)}\">${esc(name)}</a>${whaleStr}${newBadge}`
                card += `\n📈 PnL: ${pnlStr} • 🏆 Win: ${winStr}`
                card += `\n💼 Portfolio: ${valStr}`
                if (trades12h) card += `\n🧾 Trades (12h): ${trades12h}`
                if (tagsLine) card += tagsLine
                if (catParts.length) card += `\n🔎 ${catParts.join(' • ')}`
              }
            } catch {}
          } else if (firstAny.kind === 'smart_skew') {
            const direction = (firstAny.data as any)?.direction || ''
            const skew = (firstAny.data as any)?.skew ? Math.round((firstAny.data as any).skew*100) : null
            const pool = (firstAny.data as any)?.smart_pool_usd != null ? Math.round(Number((firstAny.data as any).smart_pool_usd)).toLocaleString() : null
            card = `✨ <b>Smart-Skew (DB Preview)</b>\n\n${direction}${skew!=null ? ` • Skew ${skew}%` : ''}${pool? ` • Pool $${pool}`:''}`
          } else {
            card = `✨ <b>${firstAny.title || 'Alpha (DB Preview)'}</b>\n\n${firstAny.summary || ''}`
          }
          if (m?.question) card = `✨ <b>${esc(m.question)}</b>\n\n` + card.split('\n\n').slice(1).join('\n\n')
          if (url) card += `\n🔗 <a href=\"${esc(url)}\">Market</a>`
          await ctx.reply(card, { parse_mode: 'HTML' })
        } catch {
          // Ignore preview errors
        }
      }
    } catch (e) {
      await ctx.reply('DB preview failed. Check logs for details.')
    }
  })

  // List subscriptions command
  bot.command('list', async (ctx) => {
    const userId = ctx.from!.id;
    logger.info('List command', { userId });

    try {
      const { getUserRows } = await import('../services/subscriptions')
      const rows = await getUserRows(userId)
      if (rows.length === 0) {
        await ctx.reply('📭 No follows yet! Get started:\n\n• /markets — Browse markets\n• /whales — Find top traders\n• /follow <market_id> — Set up alerts')
        return
      }
      let i=0
      let msg = '📋 Your Follows\n\n'
      const keyboard: { text: string; callback_data: string }[][] = []
      for (const r of rows) {
        i+=1
        const mid = r.market_condition_id || '—'
        if (r.type === 'market') {
          msg += `${i}. 📈 ${r.market_name}\n   Market ID: ${mid}\n   ➖ Unfollow: /unfollow ${mid}\n\n`
          try {
            const tok = await actionUnfollowMarket({ tokenId: r.token_id || undefined, conditionId: r.market_condition_id || undefined, marketName: r.market_name })
            keyboard.push([{ text: `Unfollow`, callback_data: `act:${tok}` }])
          } catch {}
        } else if (r.type === 'whale_all') {
          // Hide default all-markets follows from the list to reduce noise
          i -= 1
          continue
        } else {
          const w = r.address_filter ? r.address_filter : 'wallet'
          const short = w.length > 10 ? w.slice(0,6)+'...'+w.slice(-4) : w
          msg += `${i}. 🐳 ${r.market_name} — ${short}\n   Market ID: ${mid}\n   ➖ Unfollow: /unfollow ${w} ${mid}\n\n`
          try {
            if (r.address_filter) {
              const tok = await actionUnfollowWhaleMarket({ address: r.address_filter, tokenId: r.token_id || undefined, conditionId: r.market_condition_id || undefined, marketName: r.market_name })
              keyboard.push([{ text: `Unfollow`, callback_data: `act:${tok}` }])
            }
          } catch {}
        }
      }
      await ctx.reply(msg, { reply_markup: { inline_keyboard: keyboard } as any })
    } catch (error) {
      logger.error('Error in list command', error);
      await ctx.reply('❌ Unable to load your follows. Please try again or contact support if this persists.');
    }
  });

  // Deprecated command
  bot.command('whales_top', async (ctx) => {
    await ctx.reply(`⚠️ This command is deprecated. Use /whales to see the global leaderboard or /whales <market_id> to see whales for a specific market.`)
  })

  // Status command - Check WebSocket connection
  bot.command('status', async (ctx) => {
    logger.info('Status command', { userId: ctx.from?.id });

    try {
      const status = wsMonitor.getStatus();

      const eta = !status.connected && status.nextReconnectInMs != null
        ? `${Math.ceil(status.nextReconnectInMs/1000)}s`
        : null

      const message =
        '🔌 WebSocket Status\n\n' +
        `Connection: ${status.connected ? '✅ Connected' : '❌ Disconnected'}\n` +
        `Active market subscriptions: ${status.marketSubscriptions}\n` +
        `Active whale subscriptions: ${status.whaleSubscriptions}\n` +
        `Total users monitoring: ${status.totalUsers}\n` +
        (!status.connected
          ? `Reconnect attempt: ${status.reconnectAttempts}/${10}\n`
          : '') +
        (!status.connected && eta ? `Next reconnect in: ${eta}\n` : '') +
        (!status.connected && status.rateLimited ? 'Rate limit cooldown active ⏳\n' : '') +
        '\n' +
        (status.connected ? 'All systems operational! 🚀' : 'Attempting to reconnect...');

      await ctx.reply(message);
    } catch (error) {
      logger.error('Error in status command', error);
      await ctx.reply('❌ Unable to check status. Please try again.');
    }
  });

  // Markets command - Hot list or fuzzy search
  bot.command('markets', async (ctx) => {
    const userId = ctx.from?.id;
    const args = ctx.message.text.split(' ').slice(1)
    const firstArg = args[0]?.toLowerCase() // Declare outside try block for error logging
    logger.info('Markets command', { userId, argsLen: args.length });

    try {
      // Check for segment keywords (trending, breaking, new, ending)
      const segments = ['trending', 'breaking', 'new', 'ending']
      const isSegment = segments.includes(firstArg)

      // If a query is provided (and not a segment), perform fuzzy search
      if (args.length > 0 && !isSegment) {
        const query = args.join(' ')
        await ctx.reply('🔍 Searching...')
        const results = await findMarketFuzzy(query, 5)
        if (!results.length) {
          await ctx.reply(`❌ No matches for "${query}"\n\nTry different keywords (e.g., "election") or run /markets to browse trending.`)
          return
        }
        let message = `🔍 Search Results (${results.length})\n\n`
        const keyboard: { text: string; callback_data: string }[][] = []
        for (let i=0;i<results.length;i++) {
          const market = results[i]
          const title = market.question || 'Untitled'
          const conditionId = market.condition_id || market.conditionId
          let priceStr = 'N/A'
          try {
            if (market.outcomePrices) {
              const prices = typeof market.outcomePrices === 'string' ? JSON.parse(market.outcomePrices) : market.outcomePrices
              if (Array.isArray(prices) && prices.length > 0) priceStr = `${(parseFloat(prices[0]) * 100).toFixed(1)}%`
            }
          } catch {}
          message += `${i+1}. ${title.slice(0,80)}${title.length>80?'...':''}\n`
          message += `   Price: ${priceStr}\n`
          const url = getPolymarketMarketUrl(market)
          if (url) message += `   🔗 ${url}\n`
          if (conditionId) {
            message += `   /price ${conditionId}\n`
            try { const tok = await actionFollowMarket(conditionId, title); keyboard.push([{ text: `Follow`, callback_data: `act:${tok}` }]) } catch {}
          }
          message += '\n'
        }
        message += '💡 Use /price <market_id> for details'
        await ctx.reply(message, { reply_markup: { inline_keyboard: keyboard } as any })
        return
      }

      // Determine segment and display label (default to 'trending' to match Polymarket UI)
      const segment = isSegment ? firstArg : 'trending'
      const segmentLabels: Record<string, string> = {
        'trending': '📈 Trending',
        'breaking': '⚡ Breaking',
        'new': '🆕 New',
        'ending': '⏰ Ending Soon'
      }
      const displayLabel = segmentLabels[segment] || '📈 Trending'

      await ctx.reply('🔍 Loading markets...');

      // Primary: active markets by volume or segment-specific order
      let markets: any[] = []
      let orderBy: 'volume' | 'liquidity' | 'volume_24hr' | 'end_date_min' = 'volume'

      // Set order based on segment
      // Note: Gamma API only reliably supports 'volume' and 'liquidity' ordering
      // Use 'volume' and do client-side sorting/filtering for other segments
      if (segment === 'trending') {
        orderBy = 'volume' // Use total volume as proxy for trending
      } else if (segment === 'breaking') {
        orderBy = 'volume' // Fetch by volume first, then sort by price change
      } else if (segment === 'new') {
        orderBy = 'volume' // Will filter by recent createdAt later
      } else if (segment === 'ending') {
        orderBy = 'volume' // Will sort by end_date client-side
      }

      // For breaking and ending, fetch more markets to calculate/sort
      const fetchLimit = (segment === 'breaking' || segment === 'ending') ? 50 : 20

      try {
        logger.info(`markets: using gammaApi.getActiveMarkets(${fetchLimit}, ${orderBy})`)
        markets = await gammaApi.getActiveMarkets(fetchLimit, orderBy)
        const c = Array.isArray(markets) ? markets.length : -1
        logger.info(`markets: gammaApi active returned count=${c} type=${typeof markets}`)
      } catch (inner: any) {
        logger.error('markets: gammaApi active failed', { error: inner?.message || String(inner) })
        // Fallback to direct fetch with timeout
        const url = `https://gamma-api.polymarket.com/markets?active=true&limit=${fetchLimit}&order=${orderBy}&ascending=false`
        logger.info(`markets: fallback fetch (active by ${orderBy})`, { url })
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), 7000);
        let res: Response
        try {
          res = await fetch(url, { signal: controller.signal, headers: { 'accept': 'application/json' } })
        } finally {
          clearTimeout(to)
        }
        logger.info('markets: fallback status', { status: res.status, ok: res.ok, contentType: res.headers.get('content-type') })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          logger.error('markets: fallback http error', { status: res.status, bodySnippet: text.slice(0, 200) })
          throw new Error(`gamma http ${res.status}`)
        }
        try {
          markets = await res.json()
          logger.info('markets: fallback parsed json', { count: Array.isArray(markets) ? markets.length : -1 })
        } catch (parseErr: any) {
          const text = await res.text().catch(() => '')
          logger.error('markets: json parse failed', { error: parseErr?.message, snippet: text.slice(0, 200) })
          throw parseErr
        }
      }

      // Normalize to array
      if (!Array.isArray(markets)) {
        logger.warn('markets: unexpected payload type; wrapping into array?')
        markets = markets ? [markets] as any : []
      }

      // Keep only ACTIVE markets with future end_date, minimum volume and liquidity
      // Note: /markets endpoint doesn't include tokens array, so we can't filter on that here
      const before = markets.length
      const now = Date.now()
      const minLiquidity = parseFloat(process.env.MARKET_MIN_LIQUIDITY || '1000')
      const minVolume = parseFloat(process.env.MARKET_MIN_VOLUME || '1000')
      let filtered = (markets || []).filter((m: any) => {
        const active = m?.active === true
        const closed = m?.closed === true
        const resolved = m?.resolved === true
        const archived = m?.archived === true
        const endIso = m?.end_date_iso || m?.endDateIso || m?.endDate || m?.end_date
        const endTime = endIso ? Date.parse(endIso) : NaN
        const futureEnd = Number.isFinite(endTime) && endTime > now
        const liq = parseFloat(m?.liquidity || '0')
        const hasLiq = !Number.isNaN(liq) && liq >= minLiquidity
        const vol = parseFloat(m?.volume || '0')
        const hasVol = !Number.isNaN(vol) && vol >= minVolume
        return active && !closed && !resolved && !archived && futureEnd && hasLiq && hasVol
      })
      logger.info(`markets: filtered ACTIVE+futureEnd+liq>=${minLiquidity}+vol>=${minVolume} before=${before} after=${filtered.length}`)
      if (filtered.length < 3 && before > 0) {
        // Don't relax volume/liquidity - keep minimum standards
        logger.info(`markets: only ${filtered.length} markets meet criteria, not relaxing standards`)
      }
      markets = filtered

      // Apply segment-specific filtering
      if (segment === 'new' && markets.length > 0) {
        // For "new", prioritize recently created markets
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
        markets = markets.filter((m: any) => {
          const createdAt = m?.createdAt ? Date.parse(m.createdAt) : NaN
          return Number.isFinite(createdAt) && createdAt > sevenDaysAgo
        })
        logger.info(`markets: filtered for new markets (last 7 days), count=${markets.length}`)
      } else if (segment === 'breaking' && markets.length > 0) {
        // For "breaking", calculate 24hr price changes and sort by magnitude
        logger.info(`markets: calculating price changes for ${markets.length} breaking candidates`)

        const marketsWithChange = await Promise.all(
          markets.slice(0, 30).map(async (m: any) => {
            try {
              // Get first token ID for price history
              const tokenId = m?.tokens?.[0]?.token_id
              if (!tokenId) return { market: m, priceChange: 0 }

              // Fetch 1-day price history
              const history = await clobApi.getPricesHistory({ market: tokenId, interval: '1d', fidelity: 10 })

              if (!history?.history || history.history.length < 2) {
                return { market: m, priceChange: 0 }
              }

              // Calculate price change from 24h ago to now
              const oldPrice = history.history[0].p
              const newPrice = history.history[history.history.length - 1].p
              const priceChange = Math.abs(newPrice - oldPrice)

              return { market: m, priceChange }
            } catch (error) {
              logger.warn(`Failed to calculate price change for market`, { error: (error as any)?.message })
              return { market: m, priceChange: 0 }
            }
          })
        )

        // Sort by price change (descending) and take top 20
        markets = marketsWithChange
          .sort((a, b) => b.priceChange - a.priceChange)
          .map(item => item.market)

        logger.info(`markets: sorted by price change for breaking markets, count=${markets.length}`)
      } else if (segment === 'ending' && markets.length > 0) {
        // For "ending", sort by end_date_iso (ascending - soonest first)
        markets = markets.sort((a: any, b: any) => {
          const aEnd = a?.end_date_iso || a?.endDateIso || a?.endDate || a?.end_date
          const bEnd = b?.end_date_iso || b?.endDateIso || b?.endDate || b?.end_date
          const aTime = aEnd ? Date.parse(aEnd) : Infinity
          const bTime = bEnd ? Date.parse(bEnd) : Infinity
          return aTime - bTime // Ascending - soonest first
        })
        logger.info(`markets: sorted by end_date for ending soon markets, count=${markets.length}`)
      }

      // Secondary fallback: if empty, try trending as last resort and re-filter
      if (markets.length === 0) {
        try {
          logger.info('markets: trying gammaApi.getTrendingMarkets(20) as fallback')
          const alt = await gammaApi.getTrendingMarkets(20)
          markets = Array.isArray(alt) ? alt : []
          logger.info(`markets: trending fallback returned count=${markets.length}`)
          if (markets.length) {
            const minLiquidity2 = parseFloat(process.env.MARKET_MIN_LIQUIDITY || '1000')
            const minVolume2 = parseFloat(process.env.MARKET_MIN_VOLUME || '1000')
            const now2 = Date.now()
            markets = markets.filter((m: any)=>{
              const active = m?.active === true
              const closed = m?.closed === true
              const resolved = m?.resolved === true
              const archived = m?.archived === true
              const endIso = m?.end_date_iso || m?.endDateIso || m?.endDate || m?.end_date
              const endTime = endIso ? Date.parse(endIso) : NaN
              const futureEnd = Number.isFinite(endTime) && endTime > now2
              const liq = parseFloat(m?.liquidity || '0')
              const hasLiq = !Number.isNaN(liq) && liq >= minLiquidity2
              const vol = parseFloat(m?.volume || '0')
              const hasVol = !Number.isNaN(vol) && vol >= minVolume2
              return active && !closed && !resolved && !archived && futureEnd && hasLiq && hasVol
            })
            logger.info(`markets: trending fallback filtered to ${markets.length}`)
          }
        } catch (e: any) {
          logger.error('markets: trending fallback failed', { error: e?.message })
        }
      }

      if (markets.length === 0) {
        await ctx.reply('❌ No active markets right now. Try /markets <query> to find specific markets.');
        return;
      }

      let message = `${esc(displayLabel)}\n\n`;
      const keyboard: { text: string; callback_data: string }[][] = []

      // Show only first market initially for cleaner UI
      const initialDisplay = 1
      const displayCount = Math.min(initialDisplay, markets.length)
      const remaining = markets.length - displayCount
      const displayMarkets = markets.slice(0, displayCount)

      let followButton: { text: string; callback_data: string } | null = null
      let skewButton: { text: string; callback_data: string } | null = null
      let idx = 0
      for (const market of displayMarkets as any[]) {
        idx += 1
        const title = esc(String(market.question || 'Untitled market'))

        // Parse outcome prices from string array
        let priceNum = NaN
        try {
          const outcomePrices = market?.outcomePrices || market?.tokens?.[0]?.price
          if (typeof outcomePrices === 'string') {
            const prices = JSON.parse(outcomePrices)
            if (Array.isArray(prices) && prices.length > 0) {
              priceNum = parseFloat(prices[0])
            }
          } else if (typeof outcomePrices === 'number') {
            priceNum = outcomePrices
          }
        } catch {}
        const price = isNaN(priceNum) ? 'N/A' : (priceNum * 100).toFixed(1)

        // Format volume with smart scaling
        const volNum = typeof market.volume === 'number' ? market.volume : parseFloat(market.volume || '0')
        let volDisplay = '—'
        if (!isNaN(volNum)) {
          if (volNum >= 1_000_000) {
            volDisplay = `$${(volNum / 1_000_000).toFixed(1)}M`
          } else if (volNum >= 1_000) {
            volDisplay = `$${(volNum / 1_000).toFixed(1)}K`
          } else {
            volDisplay = `$${Math.round(volNum)}`
          }
        }

        // Format liquidity with smart scaling
        const liqNum = typeof market.liquidity === 'number' ? market.liquidity : parseFloat(market.liquidity || '0')
        let liqDisplay = '—'
        if (!isNaN(liqNum)) {
          if (liqNum >= 1_000_000) {
            liqDisplay = `$${(liqNum / 1_000_000).toFixed(2)}M`
          } else if (liqNum >= 1_000) {
            liqDisplay = `$${(liqNum / 1_000).toFixed(1)}K`
          } else {
            liqDisplay = `$${Math.round(liqNum)}`
          }
        }

        // Get condition id (API uses camelCase conditionId)
        let cond: string | null = market?.conditionId || market?.condition_id || null
        if (!cond) {
          try {
            const via = market?.market_slug || market?.slug || title
            cond = await gammaApi.findConditionId(String(via))
          } catch {}
        }

        // Build market URL from API data (prefer events[0].slug)
        const url = getPolymarketMarketUrl(market)
        message += `${idx}. ${title}\n`
        message += `   📊 Price: ${price}%\n`
        message += `   💰 Volume: ${volDisplay}\n`
        message += `   🧊 Liquidity: ${liqDisplay}\n`
        // Optional skew badge from cache (do not compute here)
        if (cond) {
          const cached = SkewCache.get(cond)
          const badge = cached ? formatSkewBadge(cached.result) : null
          if (badge) message += `   ${badge}\n`
        }
        if (url) { message += `   🔗 ${esc(url)}\n` }
        if (cond) {
          message += `   ➕ Follow: <code>/follow ${esc(cond)}</code>\n\n`
        } else {
          message += `   ➕ Follow: <code>${esc('/follow <copy market id from event>')}</code>\n\n`
        }
        // Store follow button for later (to combine with "Give me 1 more" on same row)
        if (cond) {
          try {
            const tok = await actionFollowMarket(cond, market.question || 'Market')
            if (String(`act:${tok}`).length <= 64) {
              followButton = { text: `Follow`, callback_data: `act:${tok}` }
            }
            const cbt = condToToken(cond)
            const cb = `skw:${cbt}`
            if (cbt && cb.length <= 64) {
              skewButton = { text: 'Skew', callback_data: cb }
            }
          } catch {}
        }
      }

      // Add buttons on same row: Follow + Smart Skew + "Give me 1 more"
      const buttonRow: { text: string; callback_data: string }[] = []
      if (followButton) {
        buttonRow.push(followButton)
      }
      if (skewButton) {
        buttonRow.push(skewButton)
      }
      if (remaining > 0) {
        buttonRow.push({ text: `More`, callback_data: `markets:showmore:${segment}:${displayCount}` })
      }
      if (buttonRow.length > 0) {
        keyboard.push(buttonRow)
      }

      // Footer removed for brevity

      await replySafe(ctx, message, { inline_keyboard: keyboard })
    } catch (error: any) {
      logger.error('Error in markets command', {
        error: error?.message || String(error),
        stack: error?.stack,
        segment: firstArg || 'trending'
      })
      await ctx.reply(
        '❌ Could not fetch markets right now. Please try again soon.\n' +
          'Browse directly: https://polymarket.com/markets'
      );
    }
  });

  // (removed) test_push command

  // Follow command (standardized):
  // /follow 0x<market_id> => market price alerts
  // /follow 0x<wallet> => all whale trades (copy trading)
  // /follow 0x<wallet> 0x<market_id> => wallet whale alerts in specific market
  bot.command('follow', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    const userId = ctx.from!.id
    const looksLikeAddress = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s)
    const looksLikeCond = (s: string) => /^0x[a-fA-F0-9]{64}$/.test(s)
    const looksLikeUrl = (s: string) => /^https?:\/\//i.test(s)
    const looksLikeHandle = (s: string) => /^@?[-_A-Za-z0-9]{3,}$/i.test(s)

    // New: Follow by URL (market or profile) or @handle
    if (args.length >= 1 && (looksLikeUrl(args[0]) || args[0].startsWith('@'))) {
      try {
        // Case A: Profile URL or @handle -> whale follow (all markets or specific market via 2nd arg)
        const maybeProfile = args[0]
        let wallet: string | undefined
        if (looksLikeUrl(maybeProfile)) {
          try {
            const u = new URL(maybeProfile)
            if (u.hostname.includes('polymarket.com') && u.pathname.includes('/profile')) {
              const { parsePolymarketProfile, resolveUsernameToAddress } = await import('../services/links')
              const parsed = parsePolymarketProfile(maybeProfile)
              if (parsed?.address) wallet = parsed.address
              else if (parsed?.username) wallet = await resolveUsernameToAddress(parsed.username)
            }
          } catch {}
        } else if (maybeProfile.startsWith('@') || looksLikeHandle(maybeProfile)) {
          const { resolveUsernameToAddress } = await import('../services/links')
          wallet = await resolveUsernameToAddress(maybeProfile.replace(/^@/, ''))
        }

        // If we successfully resolved a wallet, treat as whale follow
        if (wallet && /^0x[a-fA-F0-9]{40}$/i.test(wallet)) {
          // If second arg provided, try to treat as market (URL or condition id)
          if (args[1]) {
            const marketInput = args[1]
            const market = looksLikeCond(marketInput) ? await (async()=>({ condition_id: marketInput, tokens: [{ token_id: null }], question: '' }))() : await resolveMarketFromInput(marketInput)
            if (!market) { await ctx.reply('❌ Could not resolve the market from your input.'); return }
            const conditionId = (market as any).condition_id || (market as any).conditionId
            let tokenId = (market as any)?.tokens?.[0]?.token_id as string | undefined
            if (!tokenId && conditionId) {
              try { const m = await gammaApi.getMarket(conditionId); tokenId = m?.tokens?.[0]?.token_id } catch {}
            }
            const name = (market as any)?.question || 'Market'
            if (!conditionId) { await ctx.reply('❌ Market not found from URL/input.'); return }
            const ok = wsMonitor.subscribePendingWhale(userId, conditionId, name, botConfig.websocket.whaleTrademinSize, wallet)
            const { addWhaleSubscription } = await import('../services/subscriptions')
            await addWhaleSubscription(userId, tokenId || '', name, botConfig.websocket.whaleTrademinSize, wallet, conditionId)
            await ctx.reply(`✅ Following whale ${wallet.slice(0,6)}...${wallet.slice(-4)} on this market!`)
            return
          }
          // No market specified -> whale across all markets
          const ok = wsMonitor.subscribeToWhaleTradesAll(userId, wallet, botConfig.websocket.whaleTrademinSize)
          const { addWhaleSubscriptionAll } = await import('../services/subscriptions')
          await addWhaleSubscriptionAll(userId, wallet, botConfig.websocket.whaleTrademinSize)
          await ctx.reply(`✅ Following whale ${wallet.slice(0,6)}...${wallet.slice(-4)} on all markets!`)
          return
        }

        // Case B: Market URL -> price alerts
        if (looksLikeUrl(args[0])) {
          const market = await resolveMarketFromInput(args[0])
          if (!market) { await ctx.reply('❌ Could not resolve a market from that URL.'); return }
          const conditionId = (market as any).condition_id
          const tokenId = (market as any)?.tokens?.[0]?.token_id
          const name = (market as any)?.question || 'Market'
          if (!tokenId || !conditionId) { await ctx.reply('❌ Market is not ready for alerts yet.'); return }
          const ok = wsMonitor.subscribeToMarket(userId, tokenId, name, botConfig.websocket.priceChangeThreshold)
          if (!ok) { await ctx.reply('⚠️ You are already following this market.'); return }
          const { addMarketSubscription } = await import('../services/subscriptions')
          await addMarketSubscription(userId, tokenId, name, conditionId, botConfig.websocket.priceChangeThreshold)
          await ctx.reply(`✅ Price alerts enabled for: ${name}`)
          return
        }
      } catch (e) {
        logger.error('follow by URL/handle failed', { err: (e as any)?.message })
        await ctx.reply('❌ Could not process your input. Try a Polymarket URL, @handle, 0x<address>, or 0x<market_id>.')
        return
      }
    }

    // Case 1: Follow a market (price alerts)
    if (args.length === 1 && looksLikeCond(args[0])) {
      const marketId = args[0]
      try {
        await ctx.reply('⏳ Setting up price alerts...')
        const market = await gammaApi.getMarket(marketId)
        const now = Date.now()
        const endIso = (market as any)?.end_date_iso || (market as any)?.endDateIso || (market as any)?.endDate || (market as any)?.end_date
        const endTime = endIso ? Date.parse(endIso) : NaN
        // Only reject if explicitly closed/resolved or past end date
        const isClosed = (market as any)?.closed === true
        const isResolved = (market as any)?.resolved === true
        const isArchived = (market as any)?.archived === true
        const isPastEnd = Number.isFinite(endTime) && endTime < now
        if (isClosed || isResolved || isArchived || isPastEnd) {
          await ctx.reply('⚠️ This market is not active. Use /markets to choose an active market.');
          return
        }
        let tokenId = market?.tokens?.[0]?.token_id as string | undefined
        if (!tokenId) { await ctx.reply('❌ This market isn\'t ready for alerts yet. Try /markets for active markets.'); return }
        const ok = wsMonitor.subscribeToMarket(userId, tokenId, market.question, botConfig.websocket.priceChangeThreshold)
        if (!ok) { await ctx.reply('⚠️ You are already following this market.'); return }
        const { addMarketSubscription } = await import('../services/subscriptions')
        await addMarketSubscription(userId, tokenId, market.question, marketId, botConfig.websocket.priceChangeThreshold)
        await ctx.reply(`✅ Price alerts enabled! 🔔\n\nMarket: ${market.question}\n\nYou'll get notified when prices change significantly.`)
      } catch (e: any) {
        logger.error('follow market failed', { marketId, error: e?.message })
        await ctx.reply('❌ Failed to follow market. Use /follow 0x<market_id>.')
      }
      return
    }

    // Case 2: Follow a whale across ALL markets (copy trading)
    if (args.length === 1 && looksLikeAddress(args[0])) {
      const wallet = args[0]
      try {
        await ctx.reply('🔍 Setting up whale alerts...')
        // Subscribe to all whale trades (no specific market filter)
        const ok = wsMonitor.subscribeToWhaleTradesAll(userId, wallet, botConfig.websocket.whaleTrademinSize)
        if (!ok) {
          await ctx.reply('⚠️ You are already following this whale across all markets.');
          return
        }
        const { addWhaleSubscriptionAll } = await import('../services/subscriptions')
        await addWhaleSubscriptionAll(userId, wallet, botConfig.websocket.whaleTrademinSize)
        const shortAddr = wallet.slice(0, 6) + '...' + wallet.slice(-4)
        await ctx.reply(`✅ Following whale ${shortAddr} on all markets! 🔔\n\nYou'll get alerts on every trade they make.`)
      } catch (e: any) {
        logger.error('follow whale all failed', { wallet, error: e?.message })
        await ctx.reply('❌ Failed to follow whale. Use: /follow 0x<wallet_address>.')
      }
      return
    }

    // Case 3: Follow a whale on a specific market
    if (args.length === 2 && looksLikeAddress(args[0]) && looksLikeCond(args[1])) {
      const wallet = args[0]
      const marketId = args[1]
      try {
        await ctx.reply('⏳ Setting up whale alerts...')
        const market = await gammaApi.getMarket(marketId)
        const now = Date.now()
        const endIso = (market as any)?.end_date_iso || (market as any)?.endDateIso || (market as any)?.endDate || (market as any)?.end_date
        const endTime = endIso ? Date.parse(endIso) : NaN
        // Only reject if explicitly closed/resolved or past end date
        const isClosed = (market as any)?.closed === true
        const isResolved = (market as any)?.resolved === true
        const isArchived = (market as any)?.archived === true
        const isPastEnd = Number.isFinite(endTime) && endTime < now
        if (isClosed || isResolved || isArchived || isPastEnd) {
          await ctx.reply('⚠️ This market is not active. Use /markets to choose an active market.');
          return
        }
        let tokenId = market?.tokens?.[0]?.token_id as string | undefined
        if (!tokenId) { await ctx.reply('❌ Unable to resolve token for this market right now. Try again shortly.'); return }
        const ok = wsMonitor.subscribeToWhaleTrades(userId, tokenId, market.question, botConfig.websocket.whaleTrademinSize, wallet)
        if (!ok) { await ctx.reply('⚠️ You are already following this wallet in this market.'); return }
        const { addWhaleSubscription } = await import('../services/subscriptions')
        await addWhaleSubscription(userId, tokenId, market.question, botConfig.websocket.whaleTrademinSize, wallet, marketId)
        const shortAddr = wallet.slice(0, 6) + '...' + wallet.slice(-4)
        await ctx.reply(`✅ Following whale ${shortAddr} on this market! 🔔\n\nMarket: ${market.question}\n\nYou'll get alerts when they trade.`)
      } catch (e: any) {
        logger.error('follow wallet failed', { marketId, error: e?.message })
        await ctx.reply('❌ Failed to follow whale on this market. Use: /follow 0x<wallet> 0x<market_id>.')
      }
      return
    }

    await ctx.reply(
      '📖 Follow Command Usage:\n\n' +
      '🔔 Market price alerts:\n' +
      '• /follow 0x<market_id>\n\n' +
      '🐳 Copy whale trades:\n' +
      '• /follow 0x<wallet> — ALL markets\n' +
      '• /follow 0x<wallet> 0x<market_id> — specific market\n\n' +
      '💡 Get market IDs from /markets'
    )
  })

  // Unfollow (standardized)
  bot.command('unfollow', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    const userId = ctx.from!.id
    const isAddr = (s:string)=>/^0x[a-fA-F0-9]{40}$/.test(s)
    const isCond = (s:string)=>/^0x[a-fA-F0-9]{64}$/.test(s)

    // Case 1: Unfollow a market by market_id
    if (args.length===1 && isCond(args[0])) {
      const marketId = args[0]
      try {
        await ctx.reply('🔍 Looking up market...')
        const m = await gammaApi.getMarket(marketId)
        const tokenId = m?.tokens?.[0]?.token_id
        if (tokenId) {
          const ok = wsMonitor.unsubscribeFromMarket(userId, tokenId)
          const { removeMarketSubscription, removePendingMarketByCondition } = await import('../services/subscriptions')
          if (ok) await removeMarketSubscription(userId, tokenId)
          await removePendingMarketByCondition(userId, marketId)
          await ctx.reply(`✅ Price alerts disabled.\n\nMarket: ${m?.question || marketId}`)
        } else {
          const { removePendingMarketByCondition } = await import('../services/subscriptions')
          const removed = await removePendingMarketByCondition(userId, marketId)
          await ctx.reply(removed>0 ? `✅ Alerts disabled for pending market: ${m?.question || marketId}` : '⚠️ No follow found for this market. Use /list to see active follows.')
        }
      } catch (e:any) {
        logger.error('unfollow market failed', { marketId, error: e?.message })
        await ctx.reply('❌ Failed to unfollow. Ensure format: /unfollow 0x<market_id>.')
      }
      return
    }

    // Case 2: Unfollow a whale from ALL markets
    if (args.length===1 && isAddr(args[0])) {
      const wallet = args[0]
      try {
        const ok = wsMonitor.unsubscribeFromWhaleTradesAll(userId, wallet)
        const { removeWhaleSubscriptionAll } = await import('../services/subscriptions')
        await removeWhaleSubscriptionAll(userId, wallet)
        const shortAddr = wallet.slice(0, 6) + '...' + wallet.slice(-4)
        if (ok) {
          await ctx.reply(`✅ Stopped following whale ${shortAddr} on all markets.`)
        } else {
          await ctx.reply(`✅ Removed whale ${shortAddr} from pending follows.`)
        }
      } catch (e:any) {
        logger.error('unfollow whale all failed', { wallet, error: e?.message })
        await ctx.reply('❌ Failed to unfollow. Ensure format: /unfollow 0x<wallet_address>.')
      }
      return
    }

    // Case 3: Unfollow a whale from a specific market
    if (args.length===2 && isAddr(args[0]) && isCond(args[1])) {
      const wallet = args[0]
      const marketId = args[1]
      try {
        await ctx.reply('🔍 Looking up market...')
        const m = await gammaApi.getMarket(marketId)
        const tokenId = m?.tokens?.[0]?.token_id
        const { removeWhaleSubscription, removePendingWhaleByCondition } = await import('../services/subscriptions')
        if (tokenId) {
          const ok = wsMonitor.unsubscribeFromWhaleTrades(userId, tokenId)
          if (ok) await removeWhaleSubscription(userId, tokenId)
        }
        await removePendingWhaleByCondition(userId, marketId, wallet)
        const shortAddr = wallet.slice(0, 6) + '...' + wallet.slice(-4)
        await ctx.reply(`✅ Stopped following whale ${shortAddr}.\n\nMarket: ${m?.question || marketId}`)
      } catch (e:any) {
        logger.error('unfollow wallet failed', { marketId, error: e?.message })
        await ctx.reply('❌ Failed to unfollow. Ensure format: /unfollow 0x<wallet> 0x<market_id>.')
      }
      return
    }

    await ctx.reply(
      '📖 Unfollow Command Usage:\n\n' +
      '• /unfollow 0x<market_id> — stop market price alerts\n' +
      '• /unfollow 0x<wallet> — stop whale alerts (all markets)\n' +
      '• /unfollow 0x<wallet> 0x<market_id> — stop whale alerts (specific market)'
    )
  })

  // Daily tip command - Get daily rewards from Polymarket
  bot.command('daily_tip', async (ctx) => {
    logger.info('Daily_tip command', { userId: ctx.from?.id });

    try {
      await ctx.reply('🔍 Loading today\'s top reward...');

      const topReward = await getTopRewardMarket();

      if (!topReward) {
        await ctx.reply(
          'ℹ️ Unable to fetch reward markets right now.\n\n' +
            'Browse current rewards here:\n' +
            '• https://polymarket.com/rewards\n' +
            'Learn how liquidity rewards work:\n' +
            '• https://docs.polymarket.com/polymarket-learn/trading/liquidity-rewards'
        );
        return;
      }

      const message = formatRewardInfo(topReward);
      await ctx.reply(message, { parse_mode: 'Markdown' });

      logger.info('Daily_tip sent', {
        userId: ctx.from?.id,
        market: topReward.question,
        rewardRate: topReward.rewardRate,
      });
    } catch (error) {
      logger.error('Error in daily_tip command', error);
      await ctx.reply(
        '❌ Sorry, I encountered an error fetching reward data.\n\n' +
          'Please try again later or visit: https://polymarket.com/rewards'
      );
    }
  });

  // Removed /profile command per product direction focusing on flex cards

  // Profile card — generate a shareable image and send it
  bot.command('profile_card', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    const userId = ctx.from!.id
    let address: string | undefined // Declare outside try block for error logging
    try {
      // Reuse stats resolution for address
      let input = args.join(' ').trim()
      if (!input) {
        const linked = await getLinks(userId)
        if (linked?.polymarket_address) {
          address = linked.polymarket_address
        } else if (linked?.polymarket_username) {
          address = await resolveUsernameToAddress(linked.polymarket_username)
        }

        if (!address) {
          await ctx.reply(
            '❌ No linked Polymarket address found.\n\n' +
            'First link your address:\n' +
            '/link 0x<your_address>\n\n' +
            'Or create a profile card for anyone:\n' +
            '/profile_card 0x<address>\n' +
            '/profile_card @username'
          )
          return
        }
      } else if (/^0x[a-fA-F0-9]{40}$/.test(input)) {
        address = input
        logger.info({ input, address }, 'profile_card: Direct address provided')
      } else if (/^https?:\/\//i.test(input)) {
        const parsed = parsePolymarketProfile(input)
        logger.info({ input, parsed }, 'profile_card: Parsed URL')
        address = parsed?.address
        if (!address && parsed?.username) {
          logger.info({ username: parsed.username }, 'profile_card: Resolving username from URL via resolveUsernameToAddress (exact)')
          try { address = await resolveUsernameToAddress(parsed.username) } catch {}
          logger.info({ username: parsed.username, address }, 'profile_card: Username resolution result')
        }
      } else {
        const username = input.replace(/^@/, '')
        const hasAt = input.startsWith('@')
        logger.info({ input, username }, 'profile_card: Resolving username via exact/fuzzy')
        if (hasAt) {
          try { address = await resolveUsernameToAddress(username) } catch {}
        } else {
          const res = await findWhaleFuzzy(username, 1)
          address = res[0]?.user_id
          if (!address) {
            try { address = await resolveUsernameToAddress(username) } catch {}
          }
        }
        logger.info({ username, address }, 'profile_card: Username resolution result')
      }

      if (!address) {
        logger.warn({ input, userId }, 'profile_card: Could not resolve address')
        const unameFromInput = input.startsWith('@') ? input.slice(1) : undefined
        if (unameFromInput) {
          const url = `https://polymarket.com/@${encodeURIComponent(unameFromInput)}`
          await ctx.reply(
            '❌ Could not resolve address for that handle right now.\n\n' +
            `Profile: ${url}\n` +
            'Tip: Try again later or provide the 0x wallet address.'
          )
        } else {
          await ctx.reply(
            '❌ Could not resolve Polymarket address.\n\n' +
            'Try:\n' +
            '• /profile_card 0x<address>\n' +
            '• /profile_card @username\n' +
            '• /profile_card <profile_url>'
          )
        }
        return
      }

      logger.info({ address, userId }, 'profile_card: Starting card generation')
      await ctx.reply('⏳ Creating your profile card...')

      // Add timeout wrapper to prevent hanging
      const timeout = (ms: number) => new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), ms)
      )

      logger.info({ address }, 'profile_card: Fetching user data from APIs')
      const [value, positions, closed, lb] = await Promise.race([
        Promise.all([
          dataApi.getUserValue(address).catch(e => { logger.error({ err: e, address }, 'getUserValue failed'); throw e; }),
          dataApi.getUserPositions({ user: address, limit: 200 }).catch(e => { logger.error({ err: e, address }, 'getUserPositions failed'); throw e; }),
          dataApi.getClosedPositions(address, 200).catch(e => { logger.error({ err: e, address }, 'getClosedPositions failed'); throw e; }),
          findWhaleFuzzy(address, 1).catch(e => { logger.error({ err: e, address }, 'findWhaleFuzzy failed'); throw e; })
        ]),
        timeout(30000) // 30 second timeout
      ]) as any

      logger.info({
        address,
        valueData: value?.value,
        positionsCount: positions?.length,
        closedCount: closed?.length,
        lbCount: lb?.length
      }, 'profile_card: Data fetched successfully')

      let realized = 0
      for (const p of closed) {
        const rp = (p as any).realizedPnl ?? (p as any).pnl ?? 0
        const n = typeof rp === 'number' ? rp : parseFloat(String(rp))
        if (!isNaN(n)) realized += n
      }
      let openInitial = 0, openCurrent = 0
      for (const p of positions) {
        const curRaw = (p as any).value ?? (p as any).currentValue ?? 0
        const initRaw = (p as any).initial_value ?? (p as any).initialValue ?? 0
        const cur = typeof curRaw === 'number' ? curRaw : parseFloat(String(curRaw)) || 0
        const init = typeof initRaw === 'number' ? initRaw : parseFloat(String(initRaw)) || 0
        if (!isNaN(init)) openInitial += init
        if (!isNaN(cur)) openCurrent += cur
      }
      const unrealized = openCurrent - openInitial
      const pnlTotal = Math.round(realized + unrealized)
      const roi = openInitial>0 ? (((openCurrent-openInitial)/openInitial)*100).toFixed(1)+'%' : '—'
      const rank = lb.length ? String(lb[0].rank) : ''
      const pnlLb = lb.length ? ((lb[0].pnl>=0?'+':'-')+'$'+Math.abs(Math.round(lb[0].pnl)).toLocaleString()) : ''

      // Log success/failure of fetching user PNL
      if ((positions?.length ?? 0) === 0 && (closed?.length ?? 0) === 0) {
        logger.warn({ address, positions: positions?.length || 0, closed: closed?.length || 0 }, 'profile_card: No positions found; user PnL may be zero')
      }
      if (Number.isFinite(pnlTotal)) {
        logger.info({ address, realized, unrealized, pnlTotal }, 'profile_card: Successfully computed user PnL')
      } else {
        logger.error({ address, realized, unrealized, pnlTotal }, 'profile_card: Failed to compute user PnL')
      }

      const base = 'https://smtm.ai'
      const short = address.slice(0,6)+'...'+address.slice(-4)
      // Determine display name (prefer Polymarket username)
      const displayName = (Array.isArray(lb) && lb[0]?.user_name) ? lb[0].user_name : short
      const approxTotalUsers = 120000 // conservative public estimate; override as needed
      const url = `${base}/api/og/profile?address=${encodeURIComponent(address)}&username=${encodeURIComponent(displayName.startsWith('@')?displayName:'@'+displayName)}&title=${encodeURIComponent('Polymarket Profile')}`+
        `&pnl=${encodeURIComponent(String(pnlTotal))}`+
        `&value=${encodeURIComponent(value.value||'0')}&invested=${encodeURIComponent(String(Math.round(openInitial)))}`+
        `&realized=${encodeURIComponent((realized>=0?'+':'-')+'$'+Math.abs(Math.round(realized)).toLocaleString())}`+
        `&unrealized=${encodeURIComponent((unrealized>=0?'+':'-')+'$'+Math.abs(Math.round(unrealized)).toLocaleString())}`+
        `&roi=${encodeURIComponent(roi)}&rank=${encodeURIComponent(rank)}&pnlLb=${encodeURIComponent(pnlLb)}&total=${approxTotalUsers}`

      logger.info({ address, url, realized, unrealized, roi, rank }, 'profile_card: Generated image URL, fetching to verify')

      // Fetch the image first to verify it exists and is valid
      const imageResponse = await fetch(url)
      logger.info({
        address,
        status: imageResponse.status,
        contentType: imageResponse.headers.get('content-type'),
        contentLength: imageResponse.headers.get('content-length')
      }, 'profile_card: Image fetch response')

      if (!imageResponse.ok) {
        throw new Error(`Image generation failed: ${imageResponse.status} ${imageResponse.statusText}`)
      }

      const buffer = Buffer.from(await imageResponse.arrayBuffer())

      if (buffer.length === 0) {
        throw new Error('Image generation returned empty file')
      }

      logger.info({ address, imageSize: buffer.length }, 'profile_card: Image fetched successfully, sending to Telegram')

      await ctx.replyWithPhoto({ source: buffer }, { caption: `👤 Profile — ${short}\nView: https://polymarket.com/profile/${address}` })

      logger.info({ address }, 'profile_card: Successfully sent profile card')
    } catch (e: any) {
      logger.error({
        err: e,
        message: e?.message,
        stack: e?.stack,
        response: e?.response,
        code: e?.code,
        address,
        userId
      }, 'profile_card: Command failed with error')
      console.error('Full profile_card error:', e)
      const errorMsg = e?.message || String(e)
      if (errorMsg.includes('not found') || errorMsg.includes('404')) {
        await ctx.reply('❌ Profile not found. Make sure the address has activity on Polymarket.')
      } else if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
        await ctx.reply('❌ Request timed out. Please try again in a moment.')
      } else {
        await ctx.reply(
          '❌ Failed to create profile card.\n\n' +
          'This may happen if:\n' +
          '• The address has no Polymarket activity\n' +
          '• Polymarket API is temporarily unavailable\n' +
          '• The image generation service is down\n\n' +
          'Please try again in a moment.'
        )
      }
    }
  })

  // (removed) whale_card alias — use /profile_card for all profiles

  // Trade card (user crafts a flex card)
  // Usage: /trade_card <market> <yes|no> <stake_$> [entry_%] [current_%]
  bot.command('trade_card', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    if (args.length < 3) {
      await ctx.reply(
        'Create a trade card to flex your wins! 💪\n\n' +
        'Usage: /trade_card <market> <yes|no> <stake_$> [entry_%] [current_%]\n\n' +
        'Example:\n' +
        '/trade_card 0x123... yes 1000 65 72'
      )
      return
    }
    try {
      const side = args[1].toLowerCase()
      const stakeStr = args[2].replace(/[$,]/g,'')
      const stake = Number(stakeStr)
      if (!Number.isFinite(stake) || stake<=0) { await ctx.reply('❌ Invalid stake.'); return }
      const marketInput = args[0]
      const market = await resolveMarketFromInput(marketInput)
      if (!market) { await ctx.reply('❌ Market not found.'); return }
      let entry = args[3] ? Number(args[3].replace(/[%]/g,''))/100 : NaN
      let exit = args[4] ? Number(args[4].replace(/[%]/g,''))/100 : NaN
      if (!Number.isFinite(exit)) {
        // try current mid
        const tokenId = market.tokens?.[0]?.token_id
        if (tokenId) { const mid = await clobApi.getCurrentPrice(tokenId); if (mid!=null) exit = mid }
      }
      if (!Number.isFinite(entry)) entry = exit // if only one provided, use same
      const pnl = Number.isFinite(entry) && Number.isFinite(exit) ? Math.round((exit-entry)*stake) : 0
      const roi = Number.isFinite(entry) && Number.isFinite(exit) && entry!==0 ? (((exit-entry)/entry)*100).toFixed(1)+'%' : '—'

      const base = 'https://smtm.ai'
      const title = (market.question || 'Trade').slice(0, 110)
      const url = `${base}/api/og/trade?title=${encodeURIComponent(title)}&side=${encodeURIComponent(side)}`+
        `&stake=${encodeURIComponent('$'+Math.round(stake).toLocaleString())}`+
        `&entry=${encodeURIComponent(Number.isFinite(entry)?(entry*100).toFixed(1)+'%':'—')}`+
        `&exit=${encodeURIComponent(Number.isFinite(exit)?(exit*100).toFixed(1)+'%':'—')}`+
        `&pnl=${encodeURIComponent((pnl>=0?'+':'-')+'$'+Math.abs(pnl).toLocaleString())}`+
        `&roi=${encodeURIComponent(roi)}`

      const marketUrl = getPolymarketMarketUrl(market)
      await ctx.replyWithPhoto({ url }, { caption: `🧾 Trade Card — ${title}\n${marketUrl ? '🔗 '+marketUrl : ''}` })
    } catch (e) {
      logger.error('card_trade failed', e)
      await ctx.reply('❌ Failed to create your trade card. Please check your inputs and try again.')
    }
  })

  // (removed) legacy card_* alias commands

  logger.info('Commands registered');
}
