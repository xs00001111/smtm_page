import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id') || 'alphanate'
  const period = (searchParams.get('period') || '30d') as '7d'|'30d'|'90d'
  try {
    const file = path.join(process.cwd(), 'data', 'backtests', `${id}.json`)
    const raw = await fs.readFile(file, 'utf-8')
    const json = JSON.parse(raw)
    const p = json.periods?.[period]
    if (!p) return NextResponse.json({ error: 'Period not found' }, { status: 404 })
    return NextResponse.json({ id, name: json.name, period, equityCurve: p.equityCurve, holdings: p.holdings })
  } catch (e) {
    return NextResponse.json({ error: 'Backtest not found' }, { status: 404 })
  }
}

