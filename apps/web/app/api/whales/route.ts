import { NextResponse } from 'next/server'
import { gammaApi, dataApi } from '@smtm/data'
import { findMarket as findMarketUtil } from '@smtm/data'

type Holder = { address: string; balance: string }

async function getTopHoldersForMarket(conditionId: string, limit = 40, minBalance = 250) {
  const holdersResp = await dataApi.getTopHolders({ market: conditionId, limit, minBalance })
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
      const market = await findMarketUtil(q)
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
    const trending = await gammaApi.getTrendingMarkets(8)
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

