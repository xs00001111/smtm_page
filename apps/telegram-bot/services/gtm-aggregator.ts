import { dataApi } from '@smtm/data/clients/data-api'
import { gammaApi } from '@smtm/data'
import type { Position } from '@smtm/data/types'

type PnlSnapshot = { totalPnL: number; realizedPnL: number; unrealizedPnL: number; currentValue: number }

export type Holding = {
  market: string
  assetId: string
  outcome: string
  size: number
  value: number
  marketName?: string
  marketSlug?: string
}

export type TraderSnapshot = {
  address: string
  name?: string
  pnl: PnlSnapshot
  topHoldings: Holding[]
  label: 'good' | 'bad'
}

// Simple in-memory cache
const cache = new Map<string, { ts: number; data: any }>()
const now = () => Date.now()

function parseNum(v: any): number { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0')); return Number.isFinite(n) ? n : 0 }

function top5Holdings(positions: Position[]): Holding[] {
  const items = (positions || []).map(p => {
    const market = (p as any).market || (p as any).conditionId || (p as any).condition_id || (p as any).market_id || ''
    const assetId = (p as any).asset_id || (p as any).assetId || ''
    const outcome = (p as any).outcome || ''
    const size = parseNum((p as any).size)
    const value = parseNum((p as any).value ?? (p as any).currentValue ?? (p as any).current_value)
    return { market, assetId, outcome, size, value }
  }).filter(h => Number.isFinite(h.value))
  items.sort((a, b) => b.value - a.value)
  return items.slice(0, 5)
}

async function getSnapshot(address: string, name?: string): Promise<TraderSnapshot> {
  const [pnl, positions] = await Promise.all([
    dataApi.getUserAccuratePnL(address).catch(() => ({ totalPnL: 0, realizedPnL: 0, unrealizedPnL: 0, currentValue: 0 })),
    dataApi.getUserPositions({ user: address, limit: 500 }).catch(() => [] as Position[]),
  ])
  const label: 'good' | 'bad' = pnl.totalPnL >= 0 ? 'good' : 'bad'
  const base: TraderSnapshot = {
    address,
    name,
    pnl,
    topHoldings: top5Holdings(positions).filter(h => h && Number.isFinite(h.value)),
    label,
  }
  base.topHoldings = await enrichHoldingsWithMarketNames(base.topHoldings)
  return base
}

function extractAddressFromTrade(t: any): string | null {
  const candidates = [
    t?.maker_address, t?.maker, t?.taker, t?.user, t?.trader,
    t?.makerAddress, t?.takerAddress
  ]
  for (const c of candidates) {
    const s = String(c || '').toLowerCase()
    if (s.startsWith('0x') && s.length === 42) return s
  }
  return null
}

async function findLosers(candidateAddrs: string[], need: number): Promise<string[]> {
  const losers: { addr: string; pnl: number }[] = []
  const seen = new Set<string>()
  const addrs = candidateAddrs.filter(a => { const s=a.toLowerCase(); if (seen.has(s)) return false; seen.add(s); return true })

  const concurrency = 4
  let i = 0
  async function worker() {
    while (i < addrs.length && losers.length < need * 2) {
      const addr = addrs[i++]
      try {
        const p = await dataApi.getUserAccuratePnL(addr)
        if (p.totalPnL < 0) losers.push({ addr, pnl: p.totalPnL })
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: concurrency }).map(() => worker()))
  losers.sort((a,b)=>a.pnl-b.pnl)
  return losers.slice(0, need).map(x => x.addr)
}

export async function getGameSet(ttlSec = 60): Promise<TraderSnapshot[]> {
  const key = `game:${ttlSec}`
  const ent = cache.get(key)
  if (ent && now() - ent.ts < ttlSec * 1000) return ent.data

  // 1) Winners from leaderboard (fast path)
  const winnersRaw = await dataApi.getLeaderboard({ limit: 50 /* best-effort scrape */ })
  const topWinners = (winnersRaw || [])
    .filter(x => x?.user_id)
    .slice(0, 8)
    .map(x => ({ addr: String(x.user_id).toLowerCase(), name: x.user_name }))

  // 2) Candidate losers from recent trades
  const recentTrades = await dataApi.getTrades({ limit: 500 }).catch(()=>[] as any[])
  const tradeAddrs = Array.from(new Set(recentTrades.map(extractAddressFromTrade).filter(Boolean) as string[]))

  const loserAddrs = await findLosers(tradeAddrs, 5)

  // Fallback if not enough losers were found: try more addresses from winners list (some may be negative)
  let needed = 5 - loserAddrs.length
  if (needed > 0) {
    const moreAddrs = topWinners.map(w => w.addr).slice(5) // beyond top-5
    const extra = await findLosers(moreAddrs, needed)
    loserAddrs.push(...extra)
  }

  // Winners addresses (take first 5 distinct)
  const winnerAddrs = Array.from(new Set(topWinners.map(w=>w.addr))).slice(0, 5)

  // Build snapshots
  const snapshots: TraderSnapshot[] = []
  const mapName = new Map(topWinners.map(w => [w.addr, w.name]))
  const allAddrs = Array.from(new Set([...winnerAddrs, ...loserAddrs])).slice(0, 20)
  const tasks = allAddrs.map(addr => getSnapshot(addr, mapName.get(addr)))
  const results = await Promise.all(tasks)
  // Ensure label distribution: keep best 5 >=0 as good, best 5 negative as bad
  const goods = results.filter(r => r.pnl.totalPnL >= 0).sort((a,b)=>b.pnl.totalPnL - a.pnl.totalPnL).slice(0,5)
  const bads = results.filter(r => r.pnl.totalPnL < 0).sort((a,b)=>a.pnl.totalPnL - b.pnl.totalPnL).slice(0,5)
  // Build unique final set: prefer top goods then top bads, enforce 5/5 if possible
  const seen = new Set<string>()
  const final: TraderSnapshot[] = []
  let goodCount = 0, badCount = 0
  for (const g of goods) {
    if (!seen.has(g.address) && goodCount < 5) {
      seen.add(g.address); final.push({ ...g, label: 'good' }); goodCount++
    }
    if (goodCount >= 5) break
  }
  for (const b of bads) {
    if (!seen.has(b.address) && badCount < 5) {
      seen.add(b.address); final.push({ ...b, label: 'bad' }); badCount++
    }
    if (badCount >= 5) break
  }
  // If still short due to scarcity, backfill with remaining unique results irrespective of label
  if (final.length < 10) {
    for (const r of results) {
      if (seen.has(r.address)) continue
      const label: 'good' | 'bad' = r.pnl.totalPnL >= 0 ? 'good' : 'bad'
      if ((label === 'good' && goodCount >= 5) || (label === 'bad' && badCount >= 5)) continue
      seen.add(r.address); final.push({ ...r, label }); if (label==='good') goodCount++; else badCount++
      if (final.length >= 10) break
    }
  }

  cache.set(key, { ts: now(), data: final.slice(0, 10) })
  return final.slice(0, 10)
}

export async function getTrader(address: string): Promise<TraderSnapshot> {
  return getSnapshot(address)
}

// --- Market metadata enrichment ---
const marketMetaCache = new Map<string, { ts: number; name: string; slug: string }>()
const MARKET_TTL_MS = 12 * 60 * 60 * 1000

async function getMarketMeta(conditionId: string): Promise<{ name: string; slug: string }> {
  if (!conditionId) return { name: '', slug: '' }
  try {
    const ent = marketMetaCache.get(conditionId)
    if (ent && (now() - ent.ts) < MARKET_TTL_MS) return { name: ent.name, slug: ent.slug }
  } catch {}
  try {
    const m = await gammaApi.getMarket(conditionId)
    const name = (m as any)?.question || (m as any)?.slug || ''
    let slug = (m as any)?.slug || (m as any)?.market_slug || ''
    if (!slug) {
      try {
        // Fallback: let the site redirect /market/<conditionId> -> /market/<slug>
        const url = `https://polymarket.com/market/${conditionId}`
        const resp = await fetch(url as any, { redirect: 'follow' } as any)
        const final = (resp as any)?.url || ''
        const idx = final.lastIndexOf('/market/')
        if (idx >= 0) slug = final.substring(idx + '/market/'.length)
      } catch {}
    }
    marketMetaCache.set(conditionId, { ts: now(), name: name || '', slug: slug || '' })
    return { name: name || '', slug: slug || '' }
  } catch {
    // Last-resort: attempt slug-only via redirect trick
    try {
      const url = `https://polymarket.com/market/${conditionId}`
      const resp = await fetch(url as any, { redirect: 'follow' } as any)
      const final = (resp as any)?.url || ''
      const idx = final.lastIndexOf('/market/')
      const slug = idx >= 0 ? final.substring(idx + '/market/'.length) : ''
      const name = slug ? slug.replace(/-/g, ' ') : ''
      marketMetaCache.set(conditionId, { ts: now(), name, slug })
      return { name, slug }
    } catch {
      return { name: '', slug: '' }
    }
  }
}

async function enrichHoldingsWithMarketNames(holdings: Holding[]): Promise<Holding[]> {
  const ids = Array.from(new Set(holdings.map(h => h.market).filter(Boolean)))
  const metaMap = new Map<string, { name: string; slug: string }>()
  await Promise.all(ids.map(async (id) => { const m = await getMarketMeta(id); metaMap.set(id, m) }))
  return holdings.map(h => {
    const meta = metaMap.get(h.market)
    return { ...h, marketName: meta?.name || h.market, marketSlug: meta?.slug }
  })
}
