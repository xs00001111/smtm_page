import assert from 'node:assert'

// Import route handlers
import * as Osint from '../app/api/pizzint/osint/route'
import * as OsintMatch from '../app/api/pizzint/osint/match/route'
import * as Dashboard from '../app/api/pizzint/dashboard/route'
import * as Market from '../app/api/pizzint/market-card/route'
import * as Gdelt from '../app/api/pizzint/gdelt/route'
import * as Breaking from '../app/api/pizzint/breaking/route'

function test(name: string, fn: () => Promise<void> | void) {
  Promise.resolve()
    .then(fn)
    .then(() => console.log(`✓ ${name}`))
    .catch((e) => { console.error(`✗ ${name}`); throw e })
}

test('osint feed forwards to PPW with params', async () => {
  const prev = global.fetch
  // @ts-ignore
  global.fetch = async (input: any) => {
    const url = typeof input === 'string' ? input : input.toString()
    assert.ok(url.includes('/api/osint-feed'))
    assert.ok(url.includes('includeTruth=1'))
    return new Response(JSON.stringify({ success: true, tweets: [{ id: '1' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const req = new Request('http://localhost/api/pizzint/osint?includeTruth=1&limit=2')
  const res = await Osint.GET(req)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.success, true)
  // @ts-ignore
  global.fetch = prev
})

test('dashboard fetches dashboard-data', async () => {
  const prev = global.fetch
  // @ts-ignore
  global.fetch = async (input: any) => {
    const url = typeof input === 'string' ? input : input.toString()
    assert.ok(url.includes('/api/dashboard-data'))
    return new Response(JSON.stringify({ success: true, data: [] }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const res = await Dashboard.GET()
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.success, true)
  // @ts-ignore
  global.fetch = prev
})

test('market card maps id and timestamp', async () => {
  const prev = global.fetch
  // @ts-ignore
  global.fetch = async (input: any) => {
    const url = typeof input === 'string' ? input : input.toString()
    assert.ok(url.includes('/api/polymarket/market-card-data'))
    assert.ok(url.includes('id=42'))
    assert.ok(url.includes('timestamp=2026-01-01T00%3A00%3A00Z'))
    return new Response(JSON.stringify({ title: 'T', lastPrice: 0.5 }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const req = new Request('http://localhost/api/pizzint/market-card?id=42&timestamp=2026-01-01T00:00:00Z')
  const res = await Market.GET(req)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.title, 'T')
  // @ts-ignore
  global.fetch = prev
})

test('gdelt GET maps pairs/method/dates', async () => {
  const prev = global.fetch
  // @ts-ignore
  global.fetch = async (input: any) => {
    const url = typeof input === 'string' ? input : input.toString()
    assert.ok(url.includes('/api/gdelt/batch'))
    assert.ok(url.includes('pairs=a%2Cb'))
    assert.ok(url.includes('method=gpr'))
    assert.ok(url.includes('dateStart=20250101'))
    assert.ok(url.includes('dateEnd=20250102'))
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const req = new Request('http://localhost/api/pizzint/gdelt?pairs=a,b&dateStart=20250101&dateEnd=20250102')
  const res = await Gdelt.GET(req)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
  // @ts-ignore
  global.fetch = prev
})

test('gdelt POST maps JSON body', async () => {
  const prev = global.fetch
  // @ts-ignore
  global.fetch = async (input: any) => {
    const url = typeof input === 'string' ? input : input.toString()
    assert.ok(url.includes('pairs=a%2Cb'))
    assert.ok(url.includes('dateStart=20240101'))
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const req = new Request('http://localhost/api/pizzint/gdelt', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pairs: ['a','b'], dateStart: '20240101', dateEnd: '20240102' })
  })
  const res = await Gdelt.POST(req)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
  // @ts-ignore
  global.fetch = prev
})

test('breaking maps window param', async () => {
  const prev = global.fetch
  // @ts-ignore
  global.fetch = async (input: any) => {
    const url = typeof input === 'string' ? input : input.toString()
    assert.ok(url.includes('/api/breaking'))
    assert.ok(url.includes('window=6h'))
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const req = new Request('http://localhost/api/pizzint/breaking?window=6h')
  const res = await Breaking.GET(req)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.ok, true)
  // @ts-ignore
  global.fetch = prev
})

test('osint polymarket match requires tweetId and forwards', async () => {
  const prev = global.fetch
  // @ts-ignore
  global.fetch = async (input: any) => {
    const url = typeof input === 'string' ? input : input.toString()
    assert.ok(url.includes('/api/osint-polymarket-match'))
    assert.ok(url.includes('tweetId=123'))
    return new Response(JSON.stringify({ match: { tokenId: 't1' } }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const req = new Request('http://localhost/api/pizzint/osint/match?tweetId=123')
  const res = await OsintMatch.GET(req)
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.match.tokenId, 't1')
  // @ts-ignore
  global.fetch = prev
})

console.log('All pizzint API route tests passed')
