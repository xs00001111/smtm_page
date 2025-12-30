import { describe, it, expect, beforeAll, vi, afterAll } from 'vitest'
import request from 'supertest'

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => {
  const from = vi.fn(() => ({
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })),
    upsert: vi.fn(async () => ({ error: null })),
    update: vi.fn(async () => ({ error: null })),
    insert: vi.fn(async () => ({ error: null })),
  }))
  return {
    createClient: vi.fn(() => ({ from }))
  }
})

// Mock Secret Manager
vi.mock('@google-cloud/secret-manager', () => {
  return {
    SecretManagerServiceClient: vi.fn(() => ({
      getSecret: vi.fn(async () => { throw new Error('NotFound') }),
      createSecret: vi.fn(async () => ([{ name: 'projects/test/secrets/exec-dev-123' }] as any)),
      addSecretVersion: vi.fn(async () => ([{ name: 'projects/test/secrets/exec-dev-123/versions/1' }] as any)),
      accessSecretVersion: vi.fn(async () => ([{ payload: { data: Buffer.from('{"ok":true}') } }] as any)),
    }))
  }
})

// Must set env before importing app
process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'srk'
process.env.GCP_PROJECT_ID = 'test'
process.env.PORTAL_HMAC_KID = 'portal-v1'
process.env.PORTAL_SHARED_SECRET = 'shhhhh_secret'

// Use dynamic import in a beforeAll so env vars and mocks are applied first
// Import app statically; app reads env at request-time so tests can set env first
import app from '../src/index'
import crypto from 'crypto'

function sha256Hex(input: string) { return crypto.createHash('sha256').update(input).digest('hex') }
function sign(method: string, path: string, body: any, ts: string, nonce: string) {
  const bodyHash = body ? sha256Hex(JSON.stringify(body)) : 'UNSIGNED'
  const canon = [method.toUpperCase(), path, bodyHash, ts, nonce].join('\n')
  return crypto.createHmac('sha256', Buffer.from(process.env.PORTAL_SHARED_SECRET!)).update(canon).digest('base64url')
}

describe('link-api', () => {
  it('returns 401 without HMAC headers', async () => {
    const res = await request(app).get('/status')
    expect(res.status).toBe(401)
  })

  it('GET /status returns linked=false for unknown user with valid HMAC', async () => {
    const ts = String(Date.now())
    const nonce = 'abc123'
    const sig = sign('GET', '/status', undefined, ts, nonce)
    const res = await request(app)
      .get('/status')
      .query({ telegram_user_id: '123' })
      .set('x-kid', process.env.PORTAL_HMAC_KID!)
      .set('x-ts', ts)
      .set('x-nonce', nonce)
      .set('x-sig', sig)
    expect(res.status).toBe(200)
    expect(res.body.linked).toBe(false)
  })

  it('POST /link rejects missing fields', async () => {
    const ts = String(Date.now())
    const nonce = 'n1'
    const body = { telegram_user_id: '123' }
    const sig = sign('POST', '/link', body, ts, nonce)
    const res = await request(app)
      .post('/link')
      .send(body)
      .set('x-kid', process.env.PORTAL_HMAC_KID!)
      .set('x-ts', ts)
      .set('x-nonce', nonce)
      .set('x-sig', sig)
    expect(res.status).toBe(400)
  })

  it('POST /link succeeds with credentials', async () => {
    const ts = String(Date.now())
    const nonce = 'n2'
    const body = { telegram_user_id: '123', credentials: { apiKey: 'a', apiSecret: 'b', passphrase: 'c' } }
    const sig = sign('POST', '/link', body, ts, nonce)
    const res = await request(app)
      .post('/link')
      .send(body)
      .set('x-kid', process.env.PORTAL_HMAC_KID!)
      .set('x-ts', ts)
      .set('x-nonce', nonce)
      .set('x-sig', sig)
    expect(res.status).toBe(200)
    expect(res.body.linked).toBe(true)
  })
})
