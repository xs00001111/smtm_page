import { NextResponse } from 'next/server'
export const runtime = 'edge'
import { dataApi } from '@smtm/data/clients/data-api'
import { findMarket as findMarketUtil } from '@smtm/data/find-market'

function truncate(text: string, len = 60) {
  if (!text) return ''
  return text.length <= len ? text : text.slice(0, len - 3) + '...'
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('market')
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '24', 10), 1), 200)
    const minBalance = parseInt(searchParams.get('minBalance') || '250', 10)

    if (!q) {
      return NextResponse.json({ ok: false, error: 'Query param "market" is required for command generation' }, { status: 400 })
    }

    const market = await findMarketUtil(q)
    if (!market) return NextResponse.json({ ok: false, error: 'Market not found' }, { status: 404 })

    const holdersResp = await dataApi.getTopHolders({ market: market.condition_id, limit: 60, minBalance })
    const uniq = new Map<string, number>()
    holdersResp.forEach((token) => {
      token.holders.forEach((h) => {
        const bal = parseFloat(h.balance || '0')
        if (bal >= minBalance) {
          const prev = uniq.get(h.address) || 0
          if (bal > prev) uniq.set(h.address, bal)
        }
      })
    })

    const whales = Array.from(uniq.entries())
      .map(([address, balance]) => ({ address, balance }))
      .sort((a, b) => b.balance - a.balance)
      .slice(0, limit)

    const title = truncate(market.question)

    const commands = {
      whale: `/whale ${title}`,
      subscribe: `/subscribe ${title}`,
    }

    const whalesWithCommands = whales.map((w) => ({
      address: w.address,
      balance: w.balance,
      follow: `/follow ${w.address} ${title}`,
    }))

    return NextResponse.json({
      ok: true,
      market: {
        conditionId: market.condition_id,
        question: market.question,
        slug: market.market_slug || null,
      },
      commands,
      whales: whalesWithCommands,
    }, { headers: { 'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=60' } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}
