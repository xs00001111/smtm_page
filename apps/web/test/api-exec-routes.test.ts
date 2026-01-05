import assert from 'node:assert'
import crypto from 'crypto'

// Import route handlers
import * as Status from '../app/api/exec/status/route'
import * as Link from '../app/api/exec/link/route'
import * as Unlink from '../app/api/exec/unlink/route'

type T = { name: string; fn: () => Promise<void> | void }
const tests: T[] = []
function test(name: string, fn: () => Promise<void> | void) { tests.push({ name, fn }) }

function buildInitData(botToken: string, user: { id: number; username?: string }) {
  const params: Record<string, string> = {}
  params.auth_date = String(Math.floor(Date.now() / 1000))
  params.user = JSON.stringify(user)
  const entries = Object.entries(params).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  const hash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')
  const usp = new URLSearchParams({ ...params, hash })
  return usp.toString()
}

function signPortal(secret: string, method: string, path: string, body: any, ts: string, nonce: string) {
  const bodyHash = body == null || (typeof body === 'object' && Object.keys(body).length === 0)
    ? 'UNSIGNED'
    : crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex')
  const canon = [method.toUpperCase(), path, bodyHash, ts, nonce].join('\n')
  return crypto.createHmac('sha256', Buffer.from(secret)).update(canon).digest('base64url')
}

// Set env for routes
process.env.LINK_API_URL = 'https://link.example'
process.env.PORTAL_HMAC_KID = 'portal-v1'
process.env.PORTAL_SHARED_SECRET = 'shhhhh_secret'
process.env.TELEGRAM_BOT_TOKEN = '12345:ABCDEF'

const csrf = 'csrf_' + Math.random().toString(36).slice(2)

test('status route forwards with HMAC and user id', async () => {
  let called = false
  const prevFetch = global.fetch
  // @ts-ignore
  global.fetch = async (input: any, init?: any) => {
    called = true
    assert.equal(typeof input, 'string')
    const url = new URL(input)
    assert.equal(url.origin, 'https://link.example')
    assert.equal(url.pathname, '/status')
    assert.equal(url.searchParams.get('telegram_user_id'), '123')
    const ts = init.headers['x-ts'] || init.headers.get?.('x-ts')
    const nonce = init.headers['x-nonce'] || init.headers.get?.('x-nonce')
    const sig = init.headers['x-sig'] || init.headers.get?.('x-sig')
    const kid = init.headers['x-kid'] || init.headers.get?.('x-kid')
    assert.equal(kid, 'portal-v1')
    const expected = signPortal(process.env.PORTAL_SHARED_SECRET!, 'GET', '/status', undefined, ts, nonce)
    assert.equal(sig, expected)
    return new Response(JSON.stringify({ linked: false }), { status: 200 })
  }
  const initData = buildInitData(process.env.TELEGRAM_BOT_TOKEN!, { id: 123, username: 'alice' })
  const req = new Request(`http://localhost/api/exec/status?initData=${encodeURIComponent(initData)}`, { headers: { 'x-csrf': csrf } })
  const res = await Status.GET(req)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.linked, false)
  assert.ok(called)
  // @ts-ignore
  global.fetch = prevFetch
})

test('link route maps credentials and signs request', async () => {
  let called = false
  const prevFetch = global.fetch
  // @ts-ignore
  global.fetch = async (input: any, init?: any) => {
    called = true
    assert.equal(input, 'https://link.example/link')
    assert.equal(init.method, 'POST')
    const ts = init.headers['x-ts'] || init.headers.get?.('x-ts')
    const nonce = init.headers['x-nonce'] || init.headers.get?.('x-nonce')
    const body = JSON.parse(init.body)
    assert.equal(body.telegram_user_id, '123')
    assert.deepEqual(body.credentials, { apiKey: 'a', apiSecret: 'b', passphrase: 'c' })
    const expected = signPortal(process.env.PORTAL_SHARED_SECRET!, 'POST', '/link', body, ts, nonce)
    const sig = init.headers['x-sig'] || init.headers.get?.('x-sig')
    assert.equal(sig, expected)
    return new Response(JSON.stringify({ linked: true }), { status: 200 })
  }
  const initData = buildInitData(process.env.TELEGRAM_BOT_TOKEN!, { id: 123 })
  const req = new Request('http://localhost/api/exec/link', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf': csrf },
    body: JSON.stringify({ initData, clob: { apiKey: 'a', apiSecret: 'b', passphrase: 'c' } }),
  })
  const res = await Link.POST(req)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.linked, true)
  assert.ok(called)
  // @ts-ignore
  global.fetch = prevFetch
})

test('unlink route signs request', async () => {
  let called = false
  const prevFetch = global.fetch
  // @ts-ignore
  global.fetch = async (input: any, init?: any) => {
    called = true
    assert.equal(input, 'https://link.example/unlink')
    assert.equal(init.method, 'POST')
    const ts = init.headers['x-ts'] || init.headers.get?.('x-ts')
    const nonce = init.headers['x-nonce'] || init.headers.get?.('x-nonce')
    const body = JSON.parse(init.body)
    assert.equal(body.telegram_user_id, '123')
    const expected = signPortal(process.env.PORTAL_SHARED_SECRET!, 'POST', '/unlink', body, ts, nonce)
    const sig = init.headers['x-sig'] || init.headers.get?.('x-sig')
    assert.equal(sig, expected)
    return new Response(JSON.stringify({ linked: false }), { status: 200 })
  }
  const initData = buildInitData(process.env.TELEGRAM_BOT_TOKEN!, { id: 123 })
  const req = new Request('http://localhost/api/exec/unlink', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-csrf': csrf },
    body: JSON.stringify({ initData }),
  })
  const res = await Unlink.POST(req)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.linked, false)
  assert.ok(called)
  // @ts-ignore
  global.fetch = prevFetch
})

;(async () => {
  for (const t of tests) {
    try {
      await t.fn()
      console.log(`✓ ${t.name}`)
    } catch (e) {
      console.error(`✗ ${t.name}`)
      throw e
    }
  }
  console.log('All route tests passed')
})()
