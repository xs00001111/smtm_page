import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted containers for mocks used inside mock factories
const scheduled = vi.hoisted(() => [] as any[])
const ensureSpy = vi.hoisted(() => vi.fn(async (_: any) => ({ id: 'id1', day_utc: '2025-01-01', traders: [], created_at: new Date().toISOString(), seed: null, meta: {} })))

vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn((expr: string, fn: Function, opts: any) => { scheduled.push({ expr, fn, opts }); return { stop: () => {} } })
  }
}))

// Mock store functions
vi.mock('../services/gtm-store', () => ({ ensureDailySnapshot: ensureSpy, todayUtc: vi.fn(() => '2025-01-01') }))

import { startGtmScheduler } from '../services/gtm-scheduler'

beforeEach(() => { scheduled.length = 0; ensureSpy.mockClear() })

describe('gtm scheduler', () => {
  it('starts and ensures today on boot, schedules midnight UTC task', async () => {
    startGtmScheduler()
    // startup ensure called once
    expect(ensureSpy).toHaveBeenCalledTimes(1)
    expect(scheduled.length).toBe(1)
    expect(scheduled[0].expr).toBe('0 0 * * *')
    expect(scheduled[0].opts?.timezone).toBe('UTC')
    // simulate midnight tick
    await scheduled[0].fn()
    expect(ensureSpy).toHaveBeenCalledTimes(2)
  })
})
