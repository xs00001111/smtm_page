import { NextResponse } from 'next/server'
export const runtime = 'edge'

export async function GET(req: Request) {
  // File system access is not available on Cloudflare Pages (Edge Runtime)
  // Return 501 on Pages; keep Netlify/Node support by using this endpoint only there.
  return NextResponse.json({ error: 'Backtest endpoint unavailable on Edge runtime' }, { status: 501 })
}
