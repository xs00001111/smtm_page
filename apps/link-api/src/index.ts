import express from 'express'
import cors from 'cors'
import * as crypto from 'crypto'
import { SecretManagerServiceClient } from '@google-cloud/secret-manager'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const app = express()
app.use(express.json({ limit: '1mb' }))

// CORS – allow Netlify origin if provided, otherwise permissive (Cloud Run sits behind HTTPS)
const allowOrigin = process.env.ALLOW_ORIGIN || '*'
app.use(cors({ origin: allowOrigin === '*' ? true : allowOrigin }))

// Environment
const SUPABASE_URL = process.env.SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
// HMAC envs are read dynamically within middleware to support tests overriding values
const PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || ''
const ENV = process.env.NODE_ENV || 'dev'

const warn = (msg: string) => { if (process.env.NODE_ENV !== 'test') console.warn(msg) }
if (!(process.env.SUPABASE_URL || SUPABASE_URL)) warn('[link-api] SUPABASE_URL not set')
if (!(process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_ROLE_KEY)) warn('[link-api] SUPABASE_SERVICE_ROLE_KEY not set (set via Secret Manager in Cloud Run)')
if (!process.env.PORTAL_SHARED_SECRET) warn('[link-api] PORTAL_SHARED_SECRET not set (set via Secret Manager in Cloud Run)')

let _supabase: SupabaseClient | null = null
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL || SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_SERVICE_ROLE_KEY
    if (!url) throw new Error('SUPABASE_URL not configured')
    if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured')
    _supabase = createClient(url, key)
  }
  return _supabase
}
const sm = new SecretManagerServiceClient()

// --- HMAC verification helpers ---
function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex')
}
function hmacB64url(secret: string, input: string): string {
  const mac = crypto.createHmac('sha256', Buffer.from(secret))
  mac.update(input)
  return mac.digest('base64url')
}
function canonicalize(method: string, path: string, body: any, ts: string, nonce: string): string {
  const isUnsigned = body == null || (typeof body === 'object' && Object.keys(body).length === 0)
  const bodyHash = isUnsigned ? 'UNSIGNED' : sha256Hex(JSON.stringify(body))
  return [method.toUpperCase(), path, bodyHash, ts, nonce].join('\n')
}

function requireHmac(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const PORTAL_HMAC_KID = process.env.PORTAL_HMAC_KID || 'portal-v1'
    const PORTAL_SHARED_SECRET = process.env.PORTAL_SHARED_SECRET || ''
    const kid = String(req.header('x-kid') || '')
    const ts = String(req.header('x-ts') || '')
    const nonce = String(req.header('x-nonce') || '')
    const sig = String(req.header('x-sig') || '')
    if (kid !== PORTAL_HMAC_KID) return res.status(401).json({ error: 'kid mismatch' })
    if (!ts || !nonce || !sig) return res.status(401).json({ error: 'missing auth headers' })
    const now = Date.now()
    const skew = Math.abs(now - Number(ts))
    if (!Number.isFinite(Number(ts)) || skew > 60_000) return res.status(401).json({ error: 'ts out of window' })
    // Support both req.path and raw URL path (without query) for compatibility
    const path1 = req.path
    const path2 = (req.originalUrl || '').split('?')[0] || req.path
    const c1 = canonicalize(req.method, path1, req.body, ts, nonce)
    const c2 = canonicalize(req.method, path2, req.body, ts, nonce)
    const expected1 = hmacB64url(PORTAL_SHARED_SECRET, c1)
    const expected2 = hmacB64url(PORTAL_SHARED_SECRET, c2)
    const ok = (sig.length === expected1.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected1))) ||
               (sig.length === expected2.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected2)))
    if (!ok) {
      return res.status(401).json({ error: 'bad signature' })
    }
    next()
  } catch {
    return res.status(401).json({ error: 'unauthorized' })
  }
}

// --- Secret Manager helpers ---
function secretNameForUser(tgUserId: string): string {
  const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'test'
  const env = (process.env.NODE_ENV || ENV).startsWith('prod') ? 'prod' : 'dev'
  return `projects/${projectId}/secrets/exec-${env}-${tgUserId}`
}

async function ensureSecret(tgUserId: string) {
  const name = secretNameForUser(tgUserId)
  if (process.env.NODE_ENV === 'test') return name
  try {
    await sm.getSecret({ name })
    return name
  } catch (e: any) {
    if (String(e?.message || '').includes('NotFound')) {
      const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'test'
      const [resp] = await sm.createSecret({
        parent: `projects/${projectId}`,
        secret: { name, replication: { automatic: {} } },
        secretId: name.split('/').pop()!,
      })
      return resp.name!
    }
    throw e
  }
}

async function addSecretVersion(secretName: string, payloadJson: any) {
  if (process.env.NODE_ENV === 'test') return `${secretName}/versions/test`
  const data = Buffer.from(JSON.stringify(payloadJson), 'utf8')
  const [version] = await sm.addSecretVersion({ parent: secretName, payload: { data } })
  return version.name
}

// --- Supabase helpers (tables are illustrative) ---
async function upsertExecLink(tgUserId: string, secretRef: string) {
  // Expect a table public.exec_link with columns: telegram_user_id (bigint), secret_ref (text), revoked_at (timestamptz)
  const { error } = await getSupabase()
    .from('exec_link')
    .upsert({ telegram_user_id: tgUserId, secret_ref: secretRef, revoked_at: null }, { onConflict: 'telegram_user_id' })
  if (error) throw error
}

async function revokeExecLink(tgUserId: string) {
  const { error } = await getSupabase()
    .from('exec_link')
    .update({ revoked_at: new Date().toISOString() })
    .eq('telegram_user_id', tgUserId)
  if (error) throw error
}

async function getExecLink(tgUserId: string) {
  const { data, error } = await getSupabase().from('exec_link').select('secret_ref, revoked_at').eq('telegram_user_id', tgUserId).maybeSingle()
  if (error) throw error
  return data
}

// --- Routes ---
app.get('/healthz', (_req: express.Request, res: express.Response) => res.status(200).send('ok'))

app.get('/status', requireHmac, async (req: express.Request, res: express.Response) => {
  try {
    const userId = String(req.query.telegram_user_id || '')
    if (!userId) return res.status(400).json({ error: 'telegram_user_id required' })
    const row = await getExecLink(userId)
    const linked = !!(row && !row.revoked_at)
    res.json({ linked, secret_ref: row?.secret_ref || null })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) })
  }
})

app.post('/link', requireHmac, async (req: express.Request, res: express.Response) => {
  try {
    const { telegram_user_id, credentials } = req.body || {}
    if (!telegram_user_id) return res.status(400).json({ error: 'telegram_user_id required' })
    if (!credentials || !credentials.apiKey || !credentials.apiSecret || !credentials.passphrase) {
      return res.status(400).json({ error: 'credentials (apiKey, apiSecret, passphrase) required' })
    }

    const secretName = await ensureSecret(String(telegram_user_id))
    await addSecretVersion(secretName, credentials)
    await upsertExecLink(String(telegram_user_id), secretName)
    res.json({ linked: true, secret_ref: secretName })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) })
  }
})

app.post('/unlink', requireHmac, async (req: express.Request, res: express.Response) => {
  try {
    const { telegram_user_id } = req.body || {}
    if (!telegram_user_id) return res.status(400).json({ error: 'telegram_user_id required' })
    await revokeExecLink(String(telegram_user_id))
    // Optionally: destroy/disable secret versions here if desired
    res.json({ linked: false })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || String(e) })
  }
})

const port = process.env.PORT ? Number(process.env.PORT) : 8080
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => console.log(`[link-api] listening on ${port}`))
}
export default app
