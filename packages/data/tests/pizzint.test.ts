import assert from 'node:assert'
import { PizzintClient } from '../clients/pizzint'

// Minimal fixtures
const feedFixture = { success: true, tweets: [{ id: '1', text: 'hello', url: 'https://x.com/t/1', timestamp: '2026-01-01T00:00:00Z', handle: 'a', isAlert: false }] }
const dashboardFixture = { success: true, data: [{ place_id: 'p1', current_popularity: 7, recorded_at: '2026-01-01T00:00:00Z' }] }
const marketFixture = { title: 'MKT', image: '', endDate: '2026-12-31T00:00:00Z', volume24h: 1, lastPrice: 0.5, slug: 'm', clobTokenIds: ['t1','t2'] }
const gdeltFixture = { russia_ukraine: [{ t: 1700000000000, v: 1.0, sentiment: -4.2, conflictCount: 10, totalArticles: 100, interpolated: false }] }

function makeFetchMock() {
  const calls: string[] = []
  const fn = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : (input as URL).toString()
    calls.push(url)
    if (url.includes('/api/osint-feed')) return new Response(JSON.stringify(feedFixture), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.includes('/api/dashboard-data')) return new Response(JSON.stringify(dashboardFixture), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.includes('/api/polymarket/market-card-data')) return new Response(JSON.stringify(marketFixture), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.includes('/api/gdelt/batch')) return new Response(JSON.stringify(gdeltFixture), { status: 200, headers: { 'content-type': 'application/json' } })
    return new Response('not found', { status: 404 })
  }
  return { fetch: fn as any, calls }
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function run() {
  // Test cache behavior for osint-feed
  {
    const { fetch, calls } = makeFetchMock()
    const cli = new PizzintClient({ fetchFn: fetch, cacheTtlMs: { osintFeed: 10_000 }, minIntervalMs: 0 })
    const a = await cli.getOsintFeed({ includeTruth: 1, limit: 10 })
    const b = await cli.getOsintFeed({ includeTruth: 1, limit: 10 })
    assert.equal(a.tweets[0].id, '1')
    assert.equal(b.tweets.length, 1)
    assert.equal(calls.length, 1, 'should use cache for identical params')
  }

  // Test different params produce different cache keys
  {
    const { fetch, calls } = makeFetchMock()
    const cli = new PizzintClient({ fetchFn: fetch, cacheTtlMs: { osintFeed: 10_000 }, minIntervalMs: 0 })
    await cli.getOsintFeed({ includeTruth: 1, limit: 10 })
    await cli.getOsintFeed({ includeTruth: 0, limit: 10 })
    assert.equal(calls.length, 2, 'different query should bypass cache')
  }

  // Test rate limiting gap
  {
    const { fetch } = makeFetchMock()
    const cli = new PizzintClient({ fetchFn: fetch, minIntervalMs: 30, cacheTtlMs: { osintFeed: 0 } })
    const t0 = Date.now()
    await cli.getOsintFeed({ includeTruth: 1, limit: 10 })
    await cli.getOsintFeed({ includeTruth: 0, limit: 10 })
    const dt = Date.now() - t0
    assert.ok(dt >= 30, `expected dt>=30ms, got ${dt}`)
  }

  // Test other endpoints basic shape
  {
    const { fetch } = makeFetchMock()
    const cli = new PizzintClient({ fetchFn: fetch, minIntervalMs: 0 })
    const dash = await cli.getDashboard()
    assert.equal(dash.success, true)
    const m = await cli.getMarketCard(123)
    assert.equal(typeof m.lastPrice, 'number')
    const g = await cli.getGdeltBatch({ pairs: ['russia_ukraine'], dateStart: '20250101', dateEnd: '20250102' })
    assert.ok(g.russia_ukraine && Array.isArray(g.russia_ukraine))
  }

  console.log('✓ pizzint client tests passed')
}

run().catch(err => { console.error(err); process.exit(1) })

