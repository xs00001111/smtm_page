import { env } from '@smtm/shared/env'
import { logger } from '../utils/logger'

export type SkewSource = 'holders' | 'trades'

export interface SkewSnapshotInput {
  conditionId: string
  yesTokenId?: string | null
  noTokenId?: string | null
  source: SkewSource
  skewYes: number
  skew: number
  direction: 'YES' | 'NO'
  smartPoolUsd: number
  walletsEvaluated?: number | null
  whaleThreshold?: number | null
  paramsHash?: string | null
  computedAt?: string | Date | null
  expiresAt?: string | Date | null
  meta?: any
}

export interface SkewSnapshotRow {
  id: string
  created_at: string
  condition_id: string
  yes_token_id: string | null
  no_token_id: string | null
  source: SkewSource
  skew_yes: number | null
  skew: number | null
  direction: 'YES' | 'NO' | null
  smart_pool_usd: number | null
  wallets_evaluated: number | null
  whale_threshold: number | null
  params_hash: string | null
  computed_at: string
  expires_at: string | null
  meta: any
}

function supabaseAvailable(): { ok: boolean; url?: string; keyKind?: 'service'|'anon'; reason?: string } {
  const url = process.env.SUPABASE_URL || env.SUPABASE_URL
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  const anon = process.env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
  if (!url && !service && !anon) return { ok: false, reason: 'missing SUPABASE_URL and key' }
  if (!url) return { ok: false, reason: 'missing SUPABASE_URL' }
  if (!service && !anon) return { ok: false, reason: 'missing SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY' }
  return { ok: true, url, keyKind: service ? 'service' : 'anon' }
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

// L1 in-memory cache (optional, not yet wired outside of this module)
type CacheEntry = { ts: number; ttlMs: number; value: SkewSnapshotRow | null }
const L1: Map<string, CacheEntry> = new Map()

function cacheKey(conditionId: string, source: SkewSource) { return `${conditionId}|${source}` }

export async function persistSkewSnapshot(input: SkewSnapshotInput): Promise<string | null> {
  const avail = supabaseAvailable()
  if (!avail.ok) {
    logger.info(`skew:store persist skipped; Supabase not configured${avail.reason?': '+avail.reason:''}`)
    return null
  }
  if (typeof fetch !== 'function') {
    logger.info('skew:store persist skipped; fetch API not available in runtime')
    return null
  }
  const row = {
    condition_id: input.conditionId,
    yes_token_id: input.yesTokenId ?? null,
    no_token_id: input.noTokenId ?? null,
    source: input.source,
    skew_yes: Number.isFinite(input.skewYes as any) ? input.skewYes : null,
    skew: Number.isFinite(input.skew as any) ? input.skew : null,
    direction: input.direction,
    smart_pool_usd: Number.isFinite(input.smartPoolUsd as any) ? input.smartPoolUsd : null,
    wallets_evaluated: input.walletsEvaluated ?? null,
    whale_threshold: input.whaleThreshold ?? null,
    params_hash: input.paramsHash ?? null,
    computed_at: input.computedAt ? new Date(input.computedAt as any).toISOString() : new Date().toISOString(),
    expires_at: input.expiresAt ? new Date(input.expiresAt as any).toISOString() : null,
    meta: input.meta ?? {},
  }
  const res: any[] = await sb('skew_snapshot', { method: 'POST', body: JSON.stringify([row]) })
  const id = res && res[0] && res[0].id ? String(res[0].id) : null
  // update L1 cache optimistically for a short time
  try {
    if (id) {
      const key = cacheKey(input.conditionId, input.source)
      const now = Date.now()
      L1.set(key, { ts: now, ttlMs: 10 * 60 * 1000, value: {
        id,
        created_at: new Date().toISOString(),
        condition_id: row.condition_id,
        yes_token_id: row.yes_token_id,
        no_token_id: row.no_token_id,
        source: row.source,
        skew_yes: row.skew_yes,
        skew: row.skew,
        direction: row.direction,
        smart_pool_usd: row.smart_pool_usd,
        wallets_evaluated: row.wallets_evaluated,
        whale_threshold: row.whale_threshold,
        params_hash: row.params_hash,
        computed_at: row.computed_at,
        expires_at: row.expires_at,
        meta: row.meta,
      } })
    }
  } catch {}
  return id
}

export async function fetchLatestSkew(params: { conditionId: string; source?: SkewSource; maxAgeSec?: number; useCacheMs?: number }): Promise<SkewSnapshotRow | null> {
  const source: SkewSource = params.source || 'holders'
  const maxAgeSec = Math.max(60, params.maxAgeSec || 4 * 60 * 60) // default 4h
  const useCacheMs = Math.max(0, params.useCacheMs || 10 * 60 * 1000)
  const key = cacheKey(params.conditionId, source)
  const now = Date.now()
  const cached = L1.get(key)
  if (cached && (now - cached.ts) < Math.min(useCacheMs, cached.ttlMs)) return cached.value
  const avail = supabaseAvailable()
  if (!avail.ok) {
    logger.info(`skew:store fetch skipped; Supabase not configured${avail.reason?': '+avail.reason:''}`)
    return null
  }
  if (typeof fetch !== 'function') {
    logger.info('skew:store fetch skipped; fetch API not available in runtime')
    return null
  }
  const sinceIso = new Date(Date.now() - maxAgeSec * 1000).toISOString()
  // Prefer the view for a single latest per (condition,source)
  const qp = [
    `condition_id=eq.${encodeURIComponent(params.conditionId)}`,
    `source=eq.${encodeURIComponent(source)}`,
    `computed_at=gt.${encodeURIComponent(sinceIso)}`,
    'order=computed_at.desc',
    'limit=1',
    'select=*',
  ].join('&')
  const rows: SkewSnapshotRow[] = await sb(`skew_latest?${qp}`)
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null
  L1.set(key, { ts: now, ttlMs: useCacheMs, value: row })
  return row
}

// Test-only helpers
export function __clearSkewCache() { L1.clear() }
