import { NextResponse } from 'next/server'
import { canonicalize, getEnv, hmacB64url, requireCsrf, verifyTelegramInitData } from '../_utils'

export async function GET(req: Request) {
  // CSRF guard (best-effort, same-origin)
  if (!requireCsrf(req)) return NextResponse.json({ error: 'missing csrf' }, { status: 400 })

  try {
    const url = new URL(req.url)
    const initData = url.searchParams.get('initData') || ''
    const botToken = getEnv('TELEGRAM_BOT_TOKEN')
    const v = verifyTelegramInitData(initData, botToken)
    if (!v.ok || !v.user) return NextResponse.json({ error: v.error || 'unauthorized' }, { status: 401 })

    const tgUserId = String(v.user.id)
    const base = getEnv('LINK_API_URL')
    if (!base) return NextResponse.json({ error: 'server not configured' }, { status: 500 })

    const path = '/status'
    const ts = String(Date.now())
    const nonce = Math.random().toString(36).slice(2)
    const kid = getEnv('PORTAL_HMAC_KID') || 'portal-v1'
    const secret = getEnv('PORTAL_SHARED_SECRET')
    const canon = canonicalize('GET', path, undefined, ts, nonce)
    const sig = hmacB64url(secret, canon)

    const apiUrl = new URL(base.replace(/\/$/, '') + path)
    apiUrl.searchParams.set('telegram_user_id', tgUserId)
    const res = await fetch(apiUrl.toString(), {
      method: 'GET',
      headers: {
        'x-kid': kid,
        'x-ts': ts,
        'x-nonce': nonce,
        'x-sig': sig,
      },
    })

    const body = await res.text()
    const json = body ? JSON.parse(body) : {}
    return NextResponse.json(json, { status: res.status })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

