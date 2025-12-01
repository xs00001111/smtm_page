import { dataApi, clobApi, gammaApi } from '@smtm/data'
import { env } from '@smtm/shared/env'
import { logger } from '../utils/logger'

function supabaseAvailable() { return !!(env.SUPABASE_URL && (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY)) }
function key() { return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY || '' }
async function sb<T>(path: string, init?: RequestInit, schema: string = 'public'): Promise<T> {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, { ...(init||{}), headers: { apikey: key(), Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json', ...(init?.method && init.method.toUpperCase() !== 'GET' ? { 'Content-Profile': schema } : { 'Accept-Profile': schema }), ...(init?.headers as any) } } as any)
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  const ct = res.headers.get('content-type') || ''
  return (ct.includes('application/json') ? await res.json() : (undefined as any))
}

let dailyTimer: any = null
let isRunning = false

export function startTradersHarvester() {
  // Disable leaderboard-dependent harvester for now (no official leaderboard API)
  logger.info('traders.harvester disabled: leaderboard API not available')
}
