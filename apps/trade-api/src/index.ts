import express from 'express'
import cors from 'cors'
import * as crypto from 'crypto'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const app = express()
app.use(express.json({ limit: '1mb' }))
app.use(cors({ origin: process.env.ALLOW_ORIGIN || '*' }))

const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
// Read HMAC secrets dynamically inside middleware to support test overrides
// Project/env are also read at call-time to avoid stale values in tests

let _supabase: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL || SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_ROLE_KEY
    _supabase = createClient(url, key)
  }
  return _supabase
}
const sm = new SecretManagerServiceClient()

function sha256Hex(input: string): string { return crypto.createHash('sha256').update(input).digest('hex') }
function hmacB64url(secret: string, input: string): string { return crypto.createHmac('sha256', Buffer.from(secret)).update(input).digest('base64url') }
function canonicalize(method: string, path: string, body: any, ts: string, nonce: string): string {
  const isUnsigned = body == null || (typeof body === 'object' && Object.keys(body).length === 0)
  const bodyHash = isUnsigned ? 'UNSIGNED' : sha256Hex(JSON.stringify(body))
  return [method.toUpperCase(), path, bodyHash, ts, nonce].join('\n')
}
function requireHmac(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const BOT_HMAC_KID = process.env.BOT_HMAC_KID || 'bot-v1'
    const BOT_SHARED_SECRET = process.env.BOT_SHARED_SECRET || ''
    const kid = String(req.header('x-kid') || '')
    const ts = String(req.header('x-ts') || '')
    const nonce = String(req.header('x-nonce') || '')
    const sig = String(req.header('x-sig') || '')
    if (kid !== BOT_HMAC_KID) return res.status(401).json({ error: 'kid mismatch' })
    if (!ts || !nonce || !sig) return res.status(401).json({ error: 'missing auth headers' })
    const skew = Math.abs(Date.now() - Number(ts))
    if (!Number.isFinite(Number(ts)) || skew > 60_000) return res.status(401).json({ error: 'ts out of window' })
    const canon = canonicalize(req.method, req.path, req.body, ts, nonce)
    const expected = hmacB64url(BOT_SHARED_SECRET, canon)
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return res.status(401).json({ error: 'bad signature' })
    next()
  } catch { return res.status(401).json({ error: 'unauthorized' }) }
}

function secretNameForUser(tgUserId: string): string {
  const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || ''
  const envIn = process.env.NODE_ENV || 'dev'
  const env = envIn.startsWith('prod') ? 'prod' : 'dev'
  return `projects/${projectId}/secrets/exec-${env}-${tgUserId}`
}

async function getLatestSecretPayload(secretName: string): Promise<any | null> {
  try {
    // Access latest version shorthand
    const name = `${secretName}/versions/latest`
    const [ver] = await sm.accessSecretVersion({ name })
    const data = ver.payload?.data?.toString('utf8') || ''
    if (!data) return null
    return JSON.parse(data)
  } catch (e: any) {
    if (String(e?.message || '').includes('NotFound')) return null
    throw e
  }
}

app.get('/healthz', (_req: express.Request, res: express.Response) => res.status(200).send('ok'))

app.post('/trade', requireHmac, async (req: express.Request, res: express.Response) => {
  try {
    const { telegram_user_id, condition_id, side, size, limit, slippage } = req.body || {}
    if (!telegram_user_id || !condition_id || !side || !size) return res.status(400).json({ error: 'missing fields' })

    // Lookup exec_link
    const { data, error } = await getSupabase()
      .from('exec_link')
      .select('secret_ref, revoked_at')
      .eq('telegram_user_id', String(telegram_user_id))
      .maybeSingle()
    if (error) throw error
    if (!data || data.revoked_at) return res.status(403).json({ error: 'execution link missing or revoked' })

    const creds = await getLatestSecretPayload(data.secret_ref)
    if (!creds) return res.status(403).json({ error: 'secret missing' })

    // TODO: place order via CLOB client using creds.apiKey/apiSecret/passphrase
    // For now, just acknowledge receipt
    // Log audit record
    await getSupabase().from('exec_order_log').insert({
      telegram_user_id: String(telegram_user_id),
      condition_id: String(condition_id),
      side: String(side),
      size: Number(size),
      price: limit != null ? Number(limit) : null,
      status: 'accepted',
      meta: { slippage }
    } as any)

    res.json({ accepted: true })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) })
  }
})

const port = process.env.PORT ? Number(process.env.PORT) : 8080
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => console.log(`[trade-api] listening on ${port}`))
}
export default app
