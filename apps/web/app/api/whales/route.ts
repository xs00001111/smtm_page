import { NextResponse } from 'next/server'
export const runtime = 'edge'

// Edge-safe helpers using native fetch (avoid Node adapters)
async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Accept': 'application/json', ...(init?.headers || {}) } })
  if (!res.ok) throw new Error(`Request failed ${res.status}`)
  return res.json() as Promise<T>
}

type GammaMarket = { condition_id: string; question: string; market_slug?: string; slug?: string; tokens?: Array<{ token_id: string; outcome: string }> }
type HoldersResponse = { token: string; holders: Array<{ address: string; balance: string }> }

async function searchMarket(q: string): Promise<GammaMarket | null> {
  // Try slug/exact search first
  try {
    const arr = await fetchJson<GammaMarket[]>(`https://gamma-api.polymarket.com/markets?slug=${encodeURIComponent(q)}`)
    if (Array.isArray(arr) && arr.length) return arr[0]
  } catch {}
  // Fallback to generic search among active
  try {
    const arr = await fetchJson<GammaMarket[]>(`https://gamma-api.polymarket.com/markets?search=${encodeURIComponent(q)}&active=true`)
    return Array.isArray(arr) && arr.length ? arr[0] : null
  } catch { return null }
}

async function getTrendingMarkets(limit = 8): Promise<GammaMarket[]> {
  return fetchJson<GammaMarket[]>(`https://gamma-api.polymarket.com/markets?active=true&limit=${limit}&order=volume&ascending=false`)
}

async function getTopHolders(conditionId: string, limit = 40, minBalance = 250): Promise<HoldersResponse[]> {
  return fetchJson<HoldersResponse[]>(`https://data-api.polymarket.com/holders?market=${conditionId}&limit=${limit}&minBalance=${minBalance}`)
}

type Holder = { address: string; balance: string }

async function getTopHoldersForMarket(conditionId: string, limit = 40, minBalance = 250) {
  const holdersResp = await getTopHolders(conditionId, limit, minBalance)
  const holders: Holder[] = []
  holdersResp.forEach((token) => {
    token.holders.forEach((h) => holders.push({ address: h.address, balance: h.balance }))
  })
  // de-dupe by address keeping max balance
  const map = new Map<string, number>()
  for (const h of holders) {
    const bal = parseFloat(h.balance || '0')
    const prev = map.get(h.address) || 0
    if (bal > prev) map.set(h.address, bal)
  }
  return Array.from(map.entries())
    .map(([address, bal]) => ({ address, balance: bal }))
    .sort((a, b) => b.balance - a.balance)
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('market')
    const limit = parseInt(searchParams.get('limit') || '24', 10)
    const minBalance = parseInt(searchParams.get('minBalance') || '250', 10)

    // Per-market whales
    if (q) {
      const market = await searchMarket(q)
      if (!market) return NextResponse.json({ ok: false, error: 'Market not found' }, { status: 404 })

      const whales = await getTopHoldersForMarket(market.condition_id, Math.min(Math.max(limit, 1), 200), minBalance)

      return NextResponse.json({
        ok: true,
        mode: 'market',
        market: {
          conditionId: market.condition_id,
          question: market.question,
          slug: market.market_slug || null,
          tokens: market.tokens?.map((t) => ({ tokenId: t.token_id, outcome: t.outcome })) || [],
        },
        whales,
      }, { headers: { 'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=60' } })
    }

    // Aggregate whales from trending markets (by total volume)
    const trending = await getTrendingMarkets(8)
    const allHolders: Array<{ address: string; balance: number }> = []
    for (const m of trending) {
      const list = await getTopHoldersForMarket(m.condition_id, 30, minBalance)
      list.forEach((h) => allHolders.push({ address: h.address, balance: h.balance }))
    }
    // Aggregate by address
    const agg = new Map<string, number>()
    for (const h of allHolders) {
      agg.set(h.address, (agg.get(h.address) || 0) + (h.balance || 0))
    }
    const whales = Array.from(agg.entries())
      .map(([address, score]) => ({ address, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.min(Math.max(limit, 1), 200))

    return NextResponse.json({
      ok: true,
      mode: 'aggregate',
      whales,
    }, { headers: { 'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=60' } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}
