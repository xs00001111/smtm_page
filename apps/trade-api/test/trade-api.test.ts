import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import crypto from 'crypto'

// Mocks
vi.mock('@supabase/supabase-js', () => {
  const from = vi.fn(() => ({
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { secret_ref: 'projects/test/secrets/exec-dev-123', revoked_at: null }, error: null })) })) })),
    upsert: vi.fn(async () => ({ error: null })),
    update: vi.fn(async () => ({ error: null })),
    insert: vi.fn(async () => ({ error: null })),
  }))
  return {
    createClient: vi.fn(() => ({ from }))
  }
})

vi.mock('@google-cloud/secret-manager', () => {
  return {
    SecretManagerServiceClient: vi.fn(() => ({
      accessSecretVersion: vi.fn(async () => ([{ payload: { data: Buffer.from('{"apiKey":"a","apiSecret":"b","passphrase":"c"}') } }] as any)),
    }))
  }
})

process.env.NODE_ENV = 'test'
process.env.SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'srk'
process.env.GCP_PROJECT_ID = 'test'
process.env.BOT_HMAC_KID = 'bot-v1'
process.env.BOT_SHARED_SECRET = 'bot_secret'

import app from '../src/index'

function sha256Hex(input: string) { return crypto.createHash('sha256').update(input).digest('hex') }
function sign(method: string, path: string, body: any, ts: string, nonce: string) {
  const bodyHash = body ? sha256Hex(JSON.stringify(body)) : 'UNSIGNED'
  const canon = [method.toUpperCase(), path, bodyHash, ts, nonce].join('\n')
  return crypto.createHmac('sha256', Buffer.from(process.env.BOT_SHARED_SECRET!)).update(canon).digest('base64url')
}

describe('trade-api', () => {
  it('rejects unauthorized requests', async () => {
    const res = await request(app).post('/trade').send({})
    expect(res.status).toBe(401)
  })

  it('rejects when required fields are missing', async () => {
    const ts = String(Date.now())
    const nonce = 'n-missing'
    const body = { telegram_user_id: '123' } as any
    const sig = sign('POST', '/trade', body, ts, nonce)
    const res = await request(app)
      .post('/trade')
      .send(body)
      .set('x-kid', process.env.BOT_HMAC_KID!)
      .set('x-ts', ts)
      .set('x-nonce', nonce)
      .set('x-sig', sig)
    expect(res.status).toBe(400)
  })

  it('rejects with 401 on bad signature', async () => {
    const ts = String(Date.now())
    const nonce = 'n-badsig'
    const body = { telegram_user_id: '123', condition_id: '0xabc', side: 'BUY', size: 10 }
    const badSig = 'not-a-valid-signature'
    const res = await request(app)
      .post('/trade')
      .send(body)
      .set('x-kid', process.env.BOT_HMAC_KID!)
      .set('x-ts', ts)
      .set('x-nonce', nonce)
      .set('x-sig', badSig)
    expect(res.status).toBe(401)
  })

  it('rejects with 401 when timestamp is outside window', async () => {
    const ts = String(Date.now() - 10 * 60 * 1000) // 10 minutes ago
    const nonce = 'n-old'
    const body = { telegram_user_id: '123', condition_id: '0xabc', side: 'BUY', size: 10 }
    const sig = sign('POST', '/trade', body, ts, nonce)
    const res = await request(app)
      .post('/trade')
      .send(body)
      .set('x-kid', process.env.BOT_HMAC_KID!)
      .set('x-ts', ts)
      .set('x-nonce', nonce)
      .set('x-sig', sig)
    expect(res.status).toBe(401)
  })

  it('accepts a well-formed trade request', async () => {
    const ts = String(Date.now())
    const nonce = 'abc123'
    const body = { telegram_user_id: '123', condition_id: '0xabc', side: 'BUY', size: 10, limit: 0.55 }
    const sig = sign('POST', '/trade', body, ts, nonce)
    const res = await request(app)
      .post('/trade')
      .send(body)
      .set('x-kid', process.env.BOT_HMAC_KID!)
      .set('x-ts', ts)
      .set('x-nonce', nonce)
      .set('x-sig', sig)
    expect(res.status).toBe(200)
    expect(res.body.accepted).toBe(true)
  })
})
