import { NextResponse } from 'next/server'
import { PizzintClient } from '@smtm/data/clients/pizzint'

export const runtime = 'edge'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const tweetId = url.searchParams.get('tweetId')
    if (!tweetId) return NextResponse.json({ error: 'tweetId required' }, { status: 400 })
    const cli = new PizzintClient()
    const json = await cli.getOsintPolymarketMatch(tweetId)
    return NextResponse.json(json)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

