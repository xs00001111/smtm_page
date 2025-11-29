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
  if (!supabaseAvailable()) { logger.info('traders.harvester disabled: no Supabase'); return }
  if (dailyTimer) return
  // Run once a day at ~05:00 UTC equivalent: simple 24h interval from start
  const dayMs = 24 * 60 * 60 * 1000
  const tick = async () => {
    if (isRunning) return
    isRunning = true
    const day = new Date().toISOString().slice(0,10)
    logger.info('traders.harvester begin', { day })
    try {
      // 1) Fetch top 100 traders (Data API / Leaderboard) — no key needed; falls back to HTML scrape internally
      const leaderboard = await dataApi.getLeaderboard({ limit: 100 })
      logger.info('traders.harvester leaderboard', { count: leaderboard.length })
      // Persist snapshot
      const rows = leaderboard.map((e, i) => ({ day_utc: day, rank: i+1, wallet: (e.user_id||'').toLowerCase(), user_name: e.user_name || null, pnl: e.pnl || null, vol: e.vol || null }))
      if (rows.length) await sb('top_trader_daily', { method: 'POST', body: JSON.stringify(rows) })
      // 2) Build scan universe (tokenIds)
      const trending = await gammaApi.getTrendingMarkets(50).catch(()=>[] as any[])
      const active = await gammaApi.getActiveMarkets(200, 'volume').catch(()=>[] as any[])
      const tokenIds: string[] = []
      const seen = new Set<string>()
      const add = (arr:any[]) => { for (const m of arr) for (const t of (m.tokens||[])) if (t?.token_id && !seen.has(t.token_id)) { seen.add(t.token_id); tokenIds.push(t.token_id) } }
      add(trending); add(active)
      logger.info('traders.harvester token universe', { tokenCount: tokenIds.length })
      // 3) For each wallet, find most recent trade across sampled tokens
      for (const e of rows) {
        const wallet = e.wallet
        let best: any = null
        for (let i=0;i<tokenIds.length;i++) {
          const tok = tokenIds[i]
          try {
            const trades = await clobApi.getTrades(tok, 200)
            for (const tr of trades || []) {
              const mk = ((tr as any).maker || (tr as any).maker_address || '').toLowerCase()
              if (mk !== wallet) continue
              const ts = typeof (tr as any).timestamp === 'number' ? (tr as any).timestamp : Date.parse(String((tr as any).timestamp))
              const price = parseFloat(String((tr as any).price || '0'))
              const size = parseFloat(String((tr as any).size || '0'))
              const notional = price * size
              if (!best || ts > best.ts) best = { wallet, token_id: tok, market_id: (tr as any).market, ts: new Date(ts).toISOString(), price, size, notional }
            }
          } catch {}
        }
        if (best) {
          logger.info('traders.harvester recent_trade', { wallet, token: best.token_id, notional: Math.round(best.notional) })
          await sb('trader_recent_trade', { method: 'POST', body: JSON.stringify([{ wallet, token_id: best.token_id, market_id: best.market_id || null, ts: best.ts, price: best.price, size: best.size, notional: best.notional, updated_at: new Date().toISOString() }]) })
        }
      }
    } catch (e) {
      logger.warn('traders.harvester error', { err: (e as any)?.message || e })
    } finally {
      isRunning = false
      logger.info('traders.harvester end')
    }
  }
  dailyTimer = setInterval(tick, dayMs)
  setTimeout(tick, 10_000)
}

