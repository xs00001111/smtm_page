import { NextResponse } from 'next/server'
import { PizzintClient } from '@smtm/data/clients/pizzint'

export const runtime = 'edge'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    const timestamp = url.searchParams.get('timestamp') || undefined
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const cli = new PizzintClient()
    const json = await cli.getMarketCard(id, timestamp)
    return NextResponse.json(json)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

