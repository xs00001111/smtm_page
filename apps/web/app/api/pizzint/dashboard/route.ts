import { NextResponse } from 'next/server'
import { PizzintClient } from '@smtm/data/clients/pizzint'

export const runtime = 'edge'

export async function GET() {
  try {
    const cli = new PizzintClient()
    const json = await cli.getDashboard()
    return NextResponse.json(json)
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

