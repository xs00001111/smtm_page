import { env } from '@smtm/shared/env'
import { logger } from '../utils/logger'

type ActionType = 'follow_market' | 'follow_whale_market' | 'follow_whale_all' | 'follow_whale_all_many'

type ActionRecord = {
  id: string
  type: ActionType
  expires_at: number // epoch ms for quick checks
  data: Record<string, any>
}

// --- Supabase minimal REST helper (same pattern as subscriptions.ts) ---
const SUPABASE_URL = env.SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY

function sbAvailable() { return !!(SUPABASE_URL && SUPABASE_KEY) }

async function sb<T>(path: string, init?: RequestInit): Promise<T> {
  if (!sbAvailable()) throw new Error('Supabase not configured')
  const url = `${SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, {
    ...(init || {}),
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init && init.headers ? (init.headers as Record<string,string>) : {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(()=> '')
    throw new Error(`Supabase ${res.status}: ${text.slice(0,200)}`)
  }
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) return undefined as any
  return (await res.json()) as T
}

// Fallback in-memory cache when Supabase table is not present
const mem = new Map<string, ActionRecord>()

function randToken(len = 10) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let s = ''
  for (let i=0;i<len;i++) s += alphabet[Math.floor(Math.random()*alphabet.length)]
  return s
}

export async function createAction(type: ActionType, data: Record<string, any>, ttlSeconds = 3600): Promise<string> {
  const id = randToken(12)
  const expiresAt = Date.now() + ttlSeconds*1000
  const rec: ActionRecord = { id, type, expires_at: expiresAt, data }

  if (sbAvailable()) {
    try {
      await sb('tg_actions', { method: 'POST', body: JSON.stringify([{ id, type, expires_at: new Date(expiresAt).toISOString(), data }]) })
      return id
    } catch (e) {
      logger.error(e, 'actions: supabase create failed, using memory')
    }
  }
  mem.set(id, rec)
  return id
}

export async function resolveAction(id: string): Promise<ActionRecord | null> {
  const now = Date.now()
  if (sbAvailable()) {
    try {
      const rows = await sb<any[]>(`tg_actions?id=eq.${id}&select=*`)
      const r = rows?.[0]
      if (!r) return null
      const exp = Date.parse(r.expires_at)
      if (Number.isFinite(exp) && exp < now) return null
      // Optionally delete after use
      await sb(`tg_actions?id=eq.${id}`, { method: 'DELETE' })
      return { id: r.id, type: r.type, expires_at: exp, data: r.data || {} }
    } catch (e) {
      logger.error(e, 'actions: supabase resolve failed, fallback to memory')
    }
  }
  const rec = mem.get(id) || null
  if (rec && rec.expires_at >= now) {
    mem.delete(id)
    return rec
  }
  return null
}

// Helpers to create specific follow actions
export async function actionFollowMarket(conditionId: string, marketName: string) {
  return createAction('follow_market', { conditionId, marketName })
}

export async function actionFollowWhaleAll(address: string) {
  return createAction('follow_whale_all', { address })
}

export async function actionFollowWhaleMarket(address: string, conditionId: string, marketName: string) {
  return createAction('follow_whale_market', { address, conditionId, marketName })
}

export async function actionFollowWhaleAllMany(addresses: string[]) {
  return createAction('follow_whale_all_many', { addresses: Array.from(new Set(addresses)) })
}

// Unfollow helpers
export async function actionUnfollowMarket(opts: { tokenId?: string; conditionId?: string; marketName?: string }) {
  return createAction('unfollow_market' as any, opts as any)
}

export async function actionUnfollowWhaleAll(address: string) {
  return createAction('unfollow_whale_all' as any, { address } as any)
}

export async function actionUnfollowWhaleMarket(opts: { address: string; tokenId?: string; conditionId?: string; marketName?: string }) {
  return createAction('unfollow_whale_market' as any, opts as any)
}
