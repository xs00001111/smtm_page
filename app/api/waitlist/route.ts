import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { email } = await req.json()
    // Basic validation (no external calls; replace with real CRM later)
    const valid = typeof email === 'string' && /.+@.+\..+/.test(email)
    if (!valid) return NextResponse.json({ error: 'Invalid email' }, { status: 400 })

    const position = Math.floor(Math.random() * 9000) + 100 // 100–9099
    return NextResponse.json({ ok: true, position })
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 })
  }
}

