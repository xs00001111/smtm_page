import crypto from 'crypto'

export type TgUser = { id: number; username?: string; first_name?: string; last_name?: string }

export function verifyTelegramInitData(initData: string, botToken: string): { ok: boolean; user?: TgUser; error?: string } {
  try {
    if (!initData || !botToken) return { ok: false, error: 'missing initData or bot token' }
    const params = new URLSearchParams(initData)
    const hash = params.get('hash') || ''
    if (!hash) return { ok: false, error: 'missing hash' }
    const entries = Array.from(params.entries()).filter(([k]) => k !== 'hash')
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n')
    const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
    const computed = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')
    if (computed !== hash) return { ok: false, error: 'bad initData hash' }
    const userStr = params.get('user') || ''
    let user: TgUser | undefined
    try { user = userStr ? JSON.parse(userStr) : undefined } catch { /* ignore JSON error */ }
    if (!user || !user.id) return { ok: false, error: 'user missing' }
    return { ok: true, user }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}

export function canonicalize(method: string, path: string, body: any, ts: string, nonce: string): string {
  const isUnsigned = body == null || (typeof body === 'object' && Object.keys(body).length === 0)
  const bodyHash = isUnsigned ? 'UNSIGNED' : crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')
  return [method.toUpperCase(), path, bodyHash, ts, nonce].join('\n')
}

export function hmacB64url(secret: string, input: string): string {
  const mac = crypto.createHmac('sha256', Buffer.from(secret))
  mac.update(input)
  return mac.digest('base64url')
}

export function requireCsrf(req: Request): string | null {
  const csrf = req.headers.get('x-csrf') || ''
  if (!csrf || csrf.length < 10) return null
  return csrf
}

export function getEnv(name: string): string {
  return process.env[name] || ''
}

