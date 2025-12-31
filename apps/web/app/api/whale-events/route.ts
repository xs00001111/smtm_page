import { NextResponse } from 'next/server'
export const runtime = 'edge'

// Disabled on Cloudflare Pages – in-memory detector depends on Node-only modules in this build
export async function GET() {
  return NextResponse.json({ ok: false, error: 'whale-events unavailable on Edge runtime' }, { status: 501 })
}
