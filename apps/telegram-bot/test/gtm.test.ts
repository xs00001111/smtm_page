import { describe, it, expect, vi, beforeAll } from 'vitest'
import request from 'supertest'

// Mock data API used by aggregator
const winners = Array.from({ length: 8 }).map((_, i) => ({
  rank: String(i + 1),
  user_id: `0x${String(i + 1).padStart(40, '1')}`.slice(0, 42),
  user_name: `winner_${i + 1}`,
  vol: 0,
  pnl: 10000 - i * 100, // not used directly by aggregator
  profile_image: '',
}))

const loserAddrs = Array.from({ length: 8 }).map((_, i) => `0x${String(100 + i).padStart(40, '2')}`.slice(0, 42))

const positionsByUser: Record<string, any[]> = {}
function makePositions(n = 6) {
  return Array.from({ length: n }).map((_, i) => ({
    id: `p${i}`,
    market: `0xmarket_${i}`,
    asset_id: `0xasset_${i}`,
    user_address: '0xuser',
    outcome: i % 2 ? 'YES' : 'NO',
    size: String((i + 1) * 10),
    value: String((i + 1) * 100),
  }))
}

for (const w of winners) positionsByUser[w.user_id.toLowerCase()] = makePositions()
for (const l of loserAddrs) positionsByUser[l.toLowerCase()] = makePositions()

vi.mock('@smtm/data/clients/data-api', () => {
  return {
    dataApi: {
      getLeaderboard: vi.fn(async () => winners),
      getTrades: vi.fn(async () => loserAddrs.map((a, i) => ({ id: String(i), maker_address: a, price: '0.5', size: '100' }))),
      getUserAccuratePnL: vi.fn(async (user: string) => {
        const addr = (user || '').toLowerCase()
        if (winners.find(w => w.user_id.toLowerCase() === addr)) return { totalPnL: 5000, realizedPnL: 4000, unrealizedPnL: 1000, currentValue: 10000 }
        if (loserAddrs.includes(addr)) return { totalPnL: -3000, realizedPnL: -2500, unrealizedPnL: -500, currentValue: 2000 }
        return { totalPnL: 0, realizedPnL: 0, unrealizedPnL: 0, currentValue: 0 }
      }),
      getUserPositions: vi.fn(async ({ user }: { user: string }) => positionsByUser[(user || '').toLowerCase()] || []),
    }
  }
})

vi.mock('@smtm/data', () => {
  return {
    gammaApi: {
      getMarket: vi.fn(async (cid: string) => ({ condition_id: cid, question: `Market ${cid}`, slug: `slug-${cid.slice(2,8)}`, tokens: [] }))
    }
  }
})

// Import after mocks are declared
import { getGameSet } from '../services/gtm-aggregator'
import { createApp } from '../http/server'

describe('gtm aggregator', () => {
  it('returns 10 traders with 5 good and 5 bad', async () => {
    const traders = await getGameSet(0) // disable cache in test
    expect(Array.isArray(traders)).toBe(true)
    expect(traders.length).toBe(10)
    const good = traders.filter(t => t.label === 'good')
    const bad = traders.filter(t => t.label === 'bad')
    expect(good.length).toBe(5)
    expect(bad.length).toBe(5)
    for (const t of traders) {
      expect(t.topHoldings.length).toBeGreaterThan(0)
      expect(t.topHoldings.length).toBeLessThanOrEqual(5)
    }
  })
})

describe('gtm http endpoints', () => {
  let app: any
  beforeAll(() => { app = createApp() })

  it('GET /gtm/game returns 10 traders with labels', async () => {
    const res = await request(app).get('/gtm/game')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body.traders)).toBe(true)
    expect(res.body.traders.length).toBe(10)
    const labels = res.body.traders.map((t: any) => t.label)
    expect(labels.filter((x: string) => x === 'good').length).toBe(5)
    expect(labels.filter((x: string) => x === 'bad').length).toBe(5)
    const first = res.body.traders[0]
    if (first?.topHoldings?.length) {
      expect(typeof first.topHoldings[0].marketName).toBe('string')
      expect(typeof first.topHoldings[0].marketSlug).toBe('string')
    }
  })
})
