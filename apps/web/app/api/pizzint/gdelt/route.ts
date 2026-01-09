import { NextResponse } from 'next/server'
import { PizzintClient } from '@smtm/data/clients/pizzint'

export const runtime = 'edge'

function parsePairs(v?: string | null): string[] | null {
  if (!v) return null
  const arr = v.split(',').map(s => s.trim()).filter(Boolean)
  return arr.length ? arr : null
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const pairs = parsePairs(url.searchParams.get('pairs'))
    const method = url.searchParams.get('method') || undefined
    const dateStart = url.searchParams.get('dateStart') || ''
    const dateEnd = url.searchParams.get('dateEnd') || ''
    if (!pairs || !dateStart || !dateEnd) return NextResponse.json({ error: 'pairs,dateStart,dateEnd required' }, { status: 400 })
    const cli = new PizzintClient()
    const json = await cli.getGdeltBatch({ pairs, method, dateStart, dateEnd })
    return NextResponse.json(json)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({})) as any
    const pairs = (Array.isArray(body?.pairs) ? body.pairs : null) as string[] | null
    const method = (typeof body?.method === 'string' ? body.method : undefined) as string | undefined
    const dateStart = String(body?.dateStart || '')
    const dateEnd = String(body?.dateEnd || '')
    if (!pairs || !dateStart || !dateEnd) return NextResponse.json({ error: 'pairs,dateStart,dateEnd required' }, { status: 400 })
    const cli = new PizzintClient()
    const json = await cli.getGdeltBatch({ pairs, method, dateStart, dateEnd })
    return NextResponse.json(json)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

