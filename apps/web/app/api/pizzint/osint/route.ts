import { NextResponse } from 'next/server'
import { PizzintClient } from '@smtm/data/clients/pizzint'

export const runtime = 'edge'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const includeTruth = Number(url.searchParams.get('includeTruth') ?? '1')
    const limit = Number(url.searchParams.get('limit') ?? '80')
    const truthLimit = Number(url.searchParams.get('truthLimit') ?? '80')
    const cli = new PizzintClient()
    const json = await cli.getOsintFeed({ includeTruth: (includeTruth === 0 ? 0 : 1), limit, truthLimit })
    return NextResponse.json(json)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

