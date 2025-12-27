/*
 Minimal test harness for skew-store read/write without external deps.
 Uses fetch mocking to simulate Supabase REST responses.
 Run with: npm run test:skew
*/

// Set env before importing modules that read them
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co'
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'anon'

let api: any | null = null
async function load() {
  if (!api) api = await import('../apps/telegram-bot/services/skew-store')
  return api
}

function assert(cond: any, msg: string) {
  if (!cond) throw new Error('Assertion failed: ' + msg)
}

// Note: env already set above

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
  const { __clearSkewCache, fetchLatestSkew } = await load(); __clearSkewCache()
  installMockFetch((url) => {
    if (String(url).includes('/rest/v1/skew_latest')) return []
    return makeJsonResponse({}, 404)
  })
  const res = await fetchLatestSkew({ conditionId: 'cond1', source: 'holders', maxAgeSec: 3600 })
  assert(res === null, 'fetchLatestSkew should return null on empty')
}

async function test_persist_and_fetch() {
  const { __clearSkewCache, fetchLatestSkew, persistSkewSnapshot } = await load(); __clearSkewCache()
  // Capture posted body
  let posted: any = null
  const nowIso = new Date().toISOString()
  let lastHeaders: any = null
  installMockFetch((url, init) => {
    const u = String(url)
    if (u.includes('/rest/v1/skew_snapshot') && (init?.method || 'GET').toUpperCase() === 'POST') {
      posted = JSON.parse(init?.body || '[]')
      lastHeaders = init?.headers || {}
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
  // Header expectations: Accept-Profile always, Content-Profile on write
  assert(String(lastHeaders['Accept-Profile']).toLowerCase() === 'public', 'Accept-Profile should be public')
  assert(String(lastHeaders['Content-Profile']).toLowerCase() === 'public', 'Content-Profile should be public on POST')

  const row = await fetchLatestSkew({ conditionId: 'cond2', source: 'holders', maxAgeSec: 7200, useCacheMs: 1 })
  assert(row !== null, 'fetchLatestSkew should return a row')
  assert(row!.skew === 0.8, 'returned skew should match')
}

async function test_cache_hit() {
  const { __clearSkewCache, fetchLatestSkew } = await load(); __clearSkewCache()
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

async function test_persist_sets_cache_for_read() {
  const { __clearSkewCache, fetchLatestSkew, persistSkewSnapshot } = await load(); __clearSkewCache()
  const nowIso = new Date().toISOString()
  // First, allow persist
  installMockFetch((url, init) => {
    const u = String(url)
    if (u.includes('/rest/v1/skew_snapshot') && (init?.method || 'GET').toUpperCase() === 'POST') {
      return makeJsonResponse([{ id: '202' }])
    }
    if (u.includes('/rest/v1/skew_latest')) {
      // Simulate network outage on read; cache should satisfy
      return makeJsonResponse({}, 404)
    }
    return makeJsonResponse({}, 404)
  })
  await persistSkewSnapshot({
    conditionId: 'cond-cache', source: 'holders', skewYes: 0.7, skew: 0.7,
    direction: 'YES', smartPoolUsd: 3000, yesTokenId: 'Y', noTokenId: 'N', computedAt: nowIso,
  })
  const row = await fetchLatestSkew({ conditionId: 'cond-cache', source: 'holders', maxAgeSec: 7200, useCacheMs: 60000 })
  if (!row) throw new Error('cache read should return row after persist')
  if (row.skew !== 0.7) throw new Error('cache row skew should match persisted value')
}

async function test_supabase_unavailable() {
  const { __clearSkewCache, fetchLatestSkew, persistSkewSnapshot } = await load(); __clearSkewCache()
  const oldUrl = process.env.SUPABASE_URL
  delete process.env.SUPABASE_URL
  // @ts-ignore
  global.fetch = undefined
  const id = await persistSkewSnapshot({
    conditionId: 'cond-unavail', source: 'holders', skewYes: 0.6, skew: 0.6, direction: 'YES', smartPoolUsd: 1000,
  })
  if (id !== null) throw new Error('persist should return null when Supabase unavailable')
  const row = await fetchLatestSkew({ conditionId: 'cond-unavail', source: 'holders' })
  if (row !== null) throw new Error('fetch should return null when Supabase unavailable')
  if (oldUrl) process.env.SUPABASE_URL = oldUrl
}

;(async () => {
  const tests = [
    ['fetch empty', test_fetch_empty],
    ['persist and fetch', test_persist_and_fetch],
    ['cache hit', test_cache_hit],
    ['persist sets cache for read', test_persist_sets_cache_for_read],
    ['supabase unavailable', test_supabase_unavailable],
  ] as const
  let passed = 0
  for (const [name, fn] of tests) {
    try { await fn(); console.log(`✔ ${name}`); passed++ } catch (e:any) { console.error(`✘ ${name}:`, e.message); process.exitCode = 1 }
  }
  if (passed === tests.length) console.log('All tests passed')
})()
