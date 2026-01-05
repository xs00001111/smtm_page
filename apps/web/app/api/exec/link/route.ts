import { NextResponse } from 'next/server'
import { canonicalize, getEnv, hmacB64url, requireCsrf, verifyTelegramInitData } from '../_utils'

export async function POST(req: Request) {
  if (!requireCsrf(req)) return NextResponse.json({ error: 'missing csrf' }, { status: 400 })
  try {
    const { initData, clob } = await req.json().catch(() => ({ })) as any
    const botToken = getEnv('TELEGRAM_BOT_TOKEN')
    const v = verifyTelegramInitData(String(initData || ''), botToken)
    if (!v.ok || !v.user) return NextResponse.json({ error: v.error || 'unauthorized' }, { status: 401 })

    const creds = clob || {}
    const apiKey = creds.apiKey
    const apiSecret = creds.apiSecret
    const passphrase = creds.passphrase
    if (!apiKey || !apiSecret || !passphrase) {
      return NextResponse.json({ error: 'invalid credentials' }, { status: 400 })
    }

    const base = getEnv('LINK_API_URL')
    if (!base) return NextResponse.json({ error: 'server not configured' }, { status: 500 })

    const path = '/link'
    const ts = String(Date.now())
    const nonce = Math.random().toString(36).slice(2)
    const kid = getEnv('PORTAL_HMAC_KID') || 'portal-v1'
    const secret = getEnv('PORTAL_SHARED_SECRET')
    const body = { telegram_user_id: String(v.user.id), credentials: { apiKey, apiSecret, passphrase } }
    const canon = canonicalize('POST', path, body, ts, nonce)
    const sig = hmacB64url(secret, canon)

    const res = await fetch(base.replace(/\/$/, '') + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-kid': kid,
        'x-ts': ts,
        'x-nonce': nonce,
        'x-sig': sig,
      },
      body: JSON.stringify(body),
    })

    const text = await res.text()
    const json = text ? JSON.parse(text) : {}
    return NextResponse.json(json, { status: res.status })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

