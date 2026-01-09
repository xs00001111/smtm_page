import assert from 'node:assert'
import { PizzintClient } from '../clients/pizzint'

function makeFetchSequence(responses: Array<{ urlIncludes: string; body: any; status?: number }>) {
  const calls: string[] = []
  const fn = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : (input as URL).toString()
    calls.push(url)
    // Prefer the longest matching pattern to avoid partial-match collisions
    const match = [...responses]
      .sort((a, b) => (b.urlIncludes.length - a.urlIncludes.length))
      .find(r => url.includes(r.urlIncludes))
    if (!match) return new Response('not found', { status: 404 })
    return new Response(JSON.stringify(match.body), { status: match.status || 200, headers: { 'content-type': 'application/json' } })
  }
  return { fetch: fn as any, calls }
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

async function run() {
  // Dashboard cache + TTL expiry
  {
    const { fetch, calls } = makeFetchSequence([
      { urlIncludes: '/api/dashboard-data', body: { success: true, data: [{ place_id: 'p1' }] } },
    ])
    const cli = new PizzintClient({ fetchFn: fetch, cacheTtlMs: { dashboard: 20 }, minIntervalMs: 0 })
    const a = await cli.getDashboard()
    const b = await cli.getDashboard()
    assert.equal(a.data[0].place_id, 'p1')
    assert.equal(calls.length, 1)
    await sleep(25)
    const c = await cli.getDashboard()
    assert.equal(calls.length, 2, 'after TTL expiry should refetch')
  }

  // Market card param handling + cache key with timestamp
  {
    const { fetch, calls } = makeFetchSequence([
      { urlIncludes: 'id=42', body: { title: 'T', lastPrice: 0.33, clobTokenIds: ['t1'] } },
      { urlIncludes: 'id=42&timestamp=2026-01-01T00%3A00%3A00Z', body: { title: 'T@ts', lastPrice: 0.34, clobTokenIds: ['t1'] } },
    ])
    const cli = new PizzintClient({ fetchFn: fetch, cacheTtlMs: { marketCard: 60_000 }, minIntervalMs: 0 })
    const a = await cli.getMarketCard(42)
    assert.equal(a.lastPrice, 0.33)
    const b = await cli.getMarketCard(42)
    assert.equal(calls.length, 1, 'same params cached')
    const c = await cli.getMarketCard(42, '2026-01-01T00:00:00Z')
    assert.equal(c.lastPrice, 0.34)
    assert.equal(calls.length, 2, 'different timestamp -> new request')
  }

  // GDELT pairs cache key + response shape
  {
    const { fetch, calls } = makeFetchSequence([
      { urlIncludes: '/api/gdelt/batch', body: { russia_ukraine: [{ t: 1, v: 1 }], usa_china: [{ t: 2, v: 2 }] } },
    ])
    const cli = new PizzintClient({ fetchFn: fetch, cacheTtlMs: { gdelt: 60_000 }, minIntervalMs: 0 })
    const g1 = await cli.getGdeltBatch({ pairs: ['russia_ukraine', 'usa_china'], dateStart: '20250101', dateEnd: '20250102' })
    assert.ok(g1.russia_ukraine && g1.usa_china)
    const g2 = await cli.getGdeltBatch({ pairs: ['russia_ukraine', 'usa_china'], dateStart: '20250101', dateEnd: '20250102' })
    assert.equal(calls.length, 1, 'identical params cached')
  }

  // Error handling: non-200 throws
  {
    const badFetch = async (input: RequestInfo | URL): Promise<Response> => new Response('nope', { status: 500 })
    const cli = new PizzintClient({ fetchFn: badFetch as any, minIntervalMs: 0 })
    let threw = false
    try { await cli.getOsintFeed({ includeTruth: 1, limit: 1 }) } catch { threw = true }
    assert.ok(threw, 'should throw on non-200')
  }

  console.log('✓ pizzint more tests passed')
}

run().catch(err => { console.error(err); process.exit(1) })
