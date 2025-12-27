/*
 Minimal test harness for skew-store read/write without external deps.
 Uses fetch mocking to simulate Supabase REST responses.
 Run with: npm run test:skew
*/

import { __clearSkewCache, fetchLatestSkew, persistSkewSnapshot } from '../apps/telegram-bot/services/skew-store'

function assert(cond: any, msg: string) {
  if (!cond) throw new Error('Assertion failed: ' + msg)
}

// Mock env
process.env.SUPABASE_URL = 'https://example.supabase.co'
process.env.SUPABASE_ANON_KEY = 'anon'

function makeJsonResponse(body: any, status = 200, headers?: Record<string,string>) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...(headers||{}) } })
}

function installMockFetch(mapper: (url: string, init?: any) => any) {
  // @ts-ignore
  global.fetch = (async (url: string, init?: any) => {
    const v = await mapper(url, init)
    if (v instanceof Response) return v
    if (v && typeof v === 'object' && 'status' in v) return v as any
    return makeJsonResponse(v)
  }) as any
}

async function test_fetch_empty() {
  __clearSkewCache()
  installMockFetch((url) => {
    if (String(url).includes('/rest/v1/skew_latest')) return []
    return makeJsonResponse({}, 404)
  })
  const res = await fetchLatestSkew({ conditionId: 'cond1', source: 'holders', maxAgeSec: 3600 })
  assert(res === null, 'fetchLatestSkew should return null on empty')
}

async function test_persist_and_fetch() {
  __clearSkewCache()
  // Capture posted body
  let posted: any = null
  const nowIso = new Date().toISOString()
  installMockFetch((url, init) => {
    const u = String(url)
    if (u.includes('/rest/v1/skew_snapshot') && (init?.method || 'GET').toUpperCase() === 'POST') {
      posted = JSON.parse(init?.body || '[]')
      return makeJsonResponse([{ id: '101' }])
    }
    if (u.includes('/rest/v1/skew_latest')) {
      return [{
        id: '101',
        created_at: nowIso,
        condition_id: 'cond2',
        yes_token_id: 'Y',
        no_token_id: 'N',
        source: 'holders',
        skew_yes: 0.8,
        skew: 0.8,
        direction: 'YES',
        smart_pool_usd: 5000,
        wallets_evaluated: 10,
        whale_threshold: 45,
        params_hash: null,
        computed_at: nowIso,
        expires_at: null,
        meta: { note: 'ok' },
      }]
    }
    return makeJsonResponse({}, 404)
  })

  const id = await persistSkewSnapshot({
    conditionId: 'cond2', source: 'holders', skewYes: 0.8, skew: 0.8,
    direction: 'YES', smartPoolUsd: 5000, walletsEvaluated: 10, whaleThreshold: 45,
    yesTokenId: 'Y', noTokenId: 'N', meta: { note: 'ok' }, computedAt: nowIso,
  })
  assert(id === '101', 'persist should return id from response')
  assert(Array.isArray(posted) && posted.length === 1, 'persist should POST one row')
  assert(posted[0].condition_id === 'cond2', 'persist maps condition_id')

  const row = await fetchLatestSkew({ conditionId: 'cond2', source: 'holders', maxAgeSec: 7200, useCacheMs: 1 })
  assert(row !== null, 'fetchLatestSkew should return a row')
  assert(row!.skew === 0.8, 'returned skew should match')
}

async function test_cache_hit() {
  __clearSkewCache()
  let calls = 0
  installMockFetch((url) => {
    if (String(url).includes('/rest/v1/skew_latest')) {
      calls++
      return []
    }
    return makeJsonResponse({}, 404)
  })
  // First call misses (null), cached
  const r1 = await fetchLatestSkew({ conditionId: 'cond3', source: 'holders', maxAgeSec: 3600, useCacheMs: 60000 })
  assert(r1 === null, 'first should be null')
  // Second call should hit cache without another HTTP
  const r2 = await fetchLatestSkew({ conditionId: 'cond3', source: 'holders', maxAgeSec: 3600, useCacheMs: 60000 })
  assert(r2 === null, 'second should return cached null')
  assert(calls === 1, 'HTTP should be called once')
}

;(async () => {
  const tests = [
    ['fetch empty', test_fetch_empty],
    ['persist and fetch', test_persist_and_fetch],
    ['cache hit', test_cache_hit],
  ] as const
  let passed = 0
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`✔ ${name}`); passed++ } catch (e:any) { console.error(`✘ ${name}:`, e.message); process.exitCode = 1 }
  }
  if (passed === tests.length) console.log('All tests passed')
})()

