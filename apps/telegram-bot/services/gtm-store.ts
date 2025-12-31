import { env } from '@smtm/shared/env'
import { logger } from '../utils/logger'
import type { TraderSnapshot } from './gtm-aggregator'
import { getGameSet } from './gtm-aggregator'

export interface GameSnapshotRow {
  id: string
  created_at: string
  day_utc: string
  traders: TraderSnapshot[]
  seed: string | null
  meta: any
}

export interface GameSnapshotInput {
  dayUtc?: string
  traders: TraderSnapshot[]
  seed?: string | null
  meta?: any
}

function supabaseAvailable(): { ok: boolean; url?: string; reason?: string } {
  const url = process.env.SUPABASE_URL || env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
  if (!url && !key) return { ok: false, reason: 'missing SUPABASE_URL and key' }
  if (!url) return { ok: false, reason: 'missing SUPABASE_URL' }
  if (!key) return { ok: false, reason: 'missing SUPABASE_SERVICE_ROLE_KEY/ANON_KEY' }
  return { ok: true, url }
}

function key() { return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || '' }

async function sb<T>(path: string, init?: RequestInit): Promise<T> {
  const base = process.env.SUPABASE_URL || env.SUPABASE_URL
  if (!base) throw new Error('Missing SUPABASE_URL')
  const url = `${base}/rest/v1/${path}`
  const res = await fetch(url, {
    ...(init || {}),
    headers: {
      apikey: key(),
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      'Accept-Profile': 'public',
      ...(init?.method && init.method.toUpperCase() !== 'GET' ? { 'Content-Profile': 'public' } : {}),
      ...(init?.headers as any),
    },
  } as any)
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  const ct = res.headers.get('content-type') || ''
  return (ct.includes('application/json') ? await res.json() : (undefined as any))
}

export function todayUtc(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function fetchGameSnapshotByDay(dayUtc: string): Promise<GameSnapshotRow | null> {
  const avail = supabaseAvailable()
  if (!avail.ok) { logger.info(`gtm:store fetch skipped; ${avail.reason}`); return null }
  const qp = [
    `day_utc=eq.${encodeURIComponent(dayUtc)}`,
    'select=*',
    'limit=1'
  ].join('&')
  const rows: GameSnapshotRow[] = await sb(`gtm_game_snapshot?${qp}`)
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null
}

export async function persistGameSnapshot(input: GameSnapshotInput): Promise<string | null> {
  const avail = supabaseAvailable()
  if (!avail.ok) { logger.info(`gtm:store persist skipped; ${avail.reason}`); return null }
  const dayUtc = input.dayUtc || todayUtc()
  const body = [{ day_utc: dayUtc, traders: input.traders, seed: input.seed ?? null, meta: input.meta ?? {} }]
  const res: any[] = await sb('gtm_game_snapshot', { method: 'POST', body: JSON.stringify(body) })
  return res && res[0] && res[0].id ? String(res[0].id) : null
}

// Ensures we have a snapshot for the given UTC day. If absent, generates via aggregator and persists.
export async function ensureDailySnapshot(params?: { ttlSec?: number; seed?: string | null; dayUtc?: string }): Promise<GameSnapshotRow | null> {
  const day = params?.dayUtc || todayUtc()
  const existing = await fetchGameSnapshotByDay(day)
  if (existing && Array.isArray(existing.traders) && existing.traders.length >= 10) return existing
  // Generate a fresh set; disable cache for correctness and enforce 10 via aggregator backfill
  const traders = await getGameSet(0)
  if (existing) {
    // Repair today if less than 10
    try {
      const updated: any[] = await sb(`gtm_game_snapshot?day_utc=eq.${encodeURIComponent(day)}`, { method: 'PATCH', body: JSON.stringify({ traders }) })
      if (updated && updated[0]) return updated[0] as GameSnapshotRow
    } catch (e) {
      logger.warn({ err: (e as any)?.message || e }, 'gtm:store repair update failed, attempting insert fallback')
    }
  }
  const id = await persistGameSnapshot({ dayUtc: day, traders, seed: params?.seed || null })
  if (!id) return await fetchGameSnapshotByDay(day)
  return await fetchGameSnapshotByDay(day)
}
