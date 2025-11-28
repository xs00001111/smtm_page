import { NextResponse } from 'next/server'
import { WhaleDetector } from '@smtm/data'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const limit = Math.max(1, Math.min(200, parseInt(searchParams.get('limit') || '50', 10)))
    const tokenId = searchParams.get('tokenId') || undefined
    const wallet = (searchParams.get('wallet') || '').toLowerCase() || undefined
    const events = WhaleDetector.getEvents(limit, tokenId, wallet)
    return NextResponse.json({ ok: true, events }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'Unexpected error' }, { status: 500 })
  }
}

