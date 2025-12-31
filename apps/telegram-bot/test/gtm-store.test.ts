import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock aggregator to avoid network
vi.mock('../services/gtm-aggregator', () => ({
  getGameSet: vi.fn(async () => Array.from({ length: 10 }).map((_, i) => ({ address: `0x${String(i+1).padStart(40,'a')}`, pnl: { totalPnL: 0, realizedPnL: 0, unrealizedPnL: 0, currentValue: 0 }, topHoldings: [], label: 'good' })))
}))

// In-memory fake Supabase REST
let store: any[] = []
function jsonResponse(body: any, init: any = {}) { return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init }) as any }

beforeEach(() => { store = [] })

import { ensureDailySnapshot, todayUtc } from '../services/gtm-store'

// Patch env and global fetch for gtm-store sb()
beforeEach(() => {
  process.env.SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test'
  global.fetch = (async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : input.url
    const method = (init?.method || 'GET').toUpperCase()
    if (url.includes('/rest/v1/gtm_game_snapshot')) {
      if (method === 'GET') {
        const params = new URL(url).searchParams
        const dayEq = params.get('day_utc') || ''
        if (dayEq.startsWith('eq.')) {
          const day = dayEq.slice(3)
          const rows = store.filter(r => r.day_utc === decodeURIComponent(day))
          return jsonResponse(rows)
        }
        return jsonResponse(store)
      }
      if (method === 'POST') {
        const body = JSON.parse(init?.body || '[]')
        const inserted = body.map((b: any, idx: number) => ({ id: String(store.length + idx + 1), created_at: new Date().toISOString(), ...b }))
        store.push(...inserted)
        return jsonResponse(inserted)
      }
    }
    return new Response('not found', { status: 404 }) as any
  }) as any
})

describe('gtm-store ensureDailySnapshot', () => {
  it('creates snapshot when none exists', async () => {
    const day = todayUtc()
    const row = await ensureDailySnapshot({ dayUtc: day })
    expect(row?.day_utc).toBe(day)
    expect(store.length).toBe(1)
    expect(Array.isArray(row?.traders)).toBe(true)
    expect((row as any).traders.length).toBe(10)
  })

  it('returns existing snapshot if one exists', async () => {
    const day = todayUtc()
    // preinsert
    store.push({ id: '1', day_utc: day, traders: [{ address: '0xabc' }], seed: null, meta: {}, created_at: new Date().toISOString() })
    const row = await ensureDailySnapshot({ dayUtc: day })
    expect(row?.id).toBe('1')
    expect(store.length).toBe(1)
  })

  it('repairs snapshot with fewer than 10 traders', async () => {
    const day = todayUtc()
    // Existing row with only 6 traders
    store.push({ id: '1', day_utc: day, traders: Array.from({ length: 6 }).map((_,i)=>({address:`0x${i}`})), seed: null, meta: {}, created_at: new Date().toISOString() })
    const row = await ensureDailySnapshot({ dayUtc: day })
    expect(row?.day_utc).toBe(day)
    expect(Array.isArray(row?.traders)).toBe(true)
    expect((row as any).traders.length).toBe(10)
  })
})
