import { env } from '@smtm/shared/env'
import { logger } from '../utils/logger'
import { WhaleDetector } from '@smtm/data'

function supabaseAvailable() { return !!(env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY)) }
function key() { return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || '' }
async function sb<T>(path: string, init?: RequestInit, schema: string = 'public'): Promise<T> {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, { ...(init||{}), headers: { apikey: key(), Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json', ...(init?.method && init.method.toUpperCase() !== 'GET' ? { 'Content-Profile': schema } : { 'Accept-Profile': schema }), ...(init?.headers as any) } } as any)
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  const ct = res.headers.get('content-type') || ''
  return (ct.includes('application/json') ? await res.json() : (undefined as any))
}

export async function seedWatchlistFromSupabase(limit = 1000): Promise<boolean> {
  if (!supabaseAvailable()) { logger.info('watchlist.seed skipped: no Supabase'); return false }
  try {
    // Get latest day snapshot
    const path = `top_trader_daily?select=wallet,rank,day_utc&order=day_utc.desc,rank.asc&limit=${limit}`
    logger.info('watchlist.seed fetch', { path })
    const rows = await sb<any[]>(path)
    if (!rows || rows.length === 0) { logger.info('watchlist.seed empty'); return false }
    const addrs = rows.map(r => (r.wallet || '').toLowerCase()).filter((a:string)=>a && a.startsWith('0x') && a.length===42)
    logger.info('watchlist.seed applying', { count: addrs.length, sample: addrs.slice(0, 10) })
    WhaleDetector.setWatchlist(addrs)
    return addrs.length > 0
  } catch (e) {
    logger.warn('watchlist.seed error', { err: (e as any)?.message || e })
    return false
  }
}

