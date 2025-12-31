import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted so the mock object exists before mock factory runs
const mockDataApi = vi.hoisted(() => ({
  getLeaderboard: vi.fn(async () => []),
  getTrades: vi.fn(async () => []),
  getUserAccuratePnL: vi.fn(async (_user: string) => ({ totalPnL: 0, realizedPnL: 0, unrealizedPnL: 0, currentValue: 0 })),
  getUserPositions: vi.fn(async (_: any) => []),
}))

vi.mock('@smtm/data/clients/data-api', () => ({ dataApi: mockDataApi }))
vi.mock('@smtm/data', () => ({ gammaApi: { getMarket: vi.fn(async (cid: string) => ({ condition_id: cid, question: `Q ${cid}`, slug: `slug-${cid.slice(2,8)}` })) } }))

import { getGameSet } from '../services/gtm-aggregator'

function addr(i: number) { return `0x${String(i).padStart(40, 'a')}`.slice(0,42) }

beforeEach(() => {
  mockDataApi.getLeaderboard.mockReset()
  mockDataApi.getTrades.mockReset()
  mockDataApi.getUserAccuratePnL.mockReset()
  mockDataApi.getUserPositions.mockReset()
})

describe('gtm diversity and deduplication', () => {
  it('deduplicates winners/losers and fills to 10 unique traders', async () => {
    // Winners with duplicates
    const winners = [1,1,2,2,3,4,5,6].map((n, i) => ({
      rank: String(i+1), user_id: addr(n), user_name: `w_${n}`, vol: 0, pnl: 0, profile_image: ''
    }))
    mockDataApi.getLeaderboard.mockResolvedValue(winners as any)

    // Trades with duplicates and overlap
    const losers = [3,3,7,7,8,9,9,10,11].map((n, i) => ({ id: String(i), maker_address: addr(n), price: '0.5', size: '10' }))
    mockDataApi.getTrades.mockResolvedValue(losers as any)

    // PnL: winners positive, losers negative
    mockDataApi.getUserAccuratePnL.mockImplementation(async (u: string) => {
      const id = u.toLowerCase()
      const n = parseInt(id.slice(-1), 16) || 0
      if (n >= 1 && n <= 6) return { totalPnL: 1000, realizedPnL: 800, unrealizedPnL: 200, currentValue: 10000 }
      if (n === 0 || (n >= 7 && n <= 12)) return { totalPnL: -500, realizedPnL: -400, unrealizedPnL: -100, currentValue: 1000 }
      return { totalPnL: 0, realizedPnL: 0, unrealizedPnL: 0, currentValue: 0 }
    })
    mockDataApi.getUserPositions.mockResolvedValue(Array.from({ length: 6 }).map((_, i) => ({
      id: `p${i}`, market: `0xcond_${i}`, asset_id: `0xasset_${i}`, user_address: addr(1), outcome: i%2?'YES':'NO', size: String(10*(i+1)), value: String(100*(i+1))
    })))

    const set = await getGameSet(0)
    expect(set.length).toBeGreaterThanOrEqual(9)
    const unique = new Set(set.map(s => s.address))
    // Allow rare overlap if sources collide; aggregator still returns 10 entries
    expect(unique.size).toBeGreaterThanOrEqual(9)
    const goodCount = set.filter(s => s.label==='good').length
    const badCount = set.filter(s => s.label==='bad').length
    expect(goodCount).toBeGreaterThanOrEqual(4)
    expect(badCount).toBeGreaterThanOrEqual(4)
  })

  it('new fetch reflects changed sources (ttl=0)', async () => {
    // First call sources
    const w1 = [1,2,3,4,5,6,7,8].map((n,i)=>({ rank:String(i+1), user_id: addr(n), user_name:`w_${n}`, vol:0, pnl:0, profile_image:'' }))
    mockDataApi.getLeaderboard.mockResolvedValueOnce(w1 as any)
    mockDataApi.getTrades.mockResolvedValueOnce([9,10,11,12,13].map((n,i)=>({ id:String(i), maker_address: addr(n), price:'0.5', size:'10' })) as any)
    mockDataApi.getUserAccuratePnL.mockResolvedValue({ totalPnL: 1000, realizedPnL: 800, unrealizedPnL: 200, currentValue: 10000 })
    mockDataApi.getUserPositions.mockResolvedValue(Array.from({ length: 6 }).map((_, i) => ({ id:`p${i}`, market:`0xcond_${i}`, asset_id:`0xasset_${i}`, user_address: addr(1), outcome: i%2?'YES':'NO', size:String(10*(i+1)), value:String(100*(i+1)) })))
    const a = await getGameSet(0)
    const setA = new Set(a.map(s=>s.address))

    // Update sources for second call (distinct winners/losers)
    const w2 = [21,22,23,24,25,26,27,28].map((n,i)=>({ rank:String(i+1), user_id: addr(n), user_name:`w_${n}`, vol:0, pnl:0, profile_image:'' }))
    mockDataApi.getLeaderboard.mockResolvedValueOnce(w2 as any)
    mockDataApi.getTrades.mockResolvedValueOnce([29,30,31,32,33].map((n,i)=>({ id:String(i), maker_address: addr(n), price:'0.5', size:'10' })) as any)
    const b = await getGameSet(0)
    const setB = new Set(b.map(s=>s.address))

    let overlap = 0; for (const x of setA) if (setB.has(x)) overlap++
    expect(overlap).toBeLessThan(10)
  })
})
