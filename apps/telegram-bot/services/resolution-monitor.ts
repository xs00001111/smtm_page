import * as cron from 'node-cron'
import { logger } from '../utils/logger'
import { gammaApi } from '@smtm/data'
import { env } from '@smtm/shared/env'
import { WebSocketMonitorService } from './websocket-monitor'

// Minimal Supabase REST helper (service or anon key)
const SUPABASE_URL = env.SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY

function supabaseAvailable() {
  return !!(SUPABASE_URL && SUPABASE_KEY)
}

async function sb<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${SUPABASE_URL}/rest/v1/${path}`
  const res = await fetch(url, {
    ...(init || {}),
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init && init.headers ? (init.headers as Record<string, string>) : {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`)
  }
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) return undefined as any
  return (await res.json()) as T
}

type FollowRow = {
  user_id: number
  kind: 'market' | 'whale' | 'whale_all'
  token_id: string | null
  market_condition_id: string | null
  market_name: string | null
}

export function startResolutionMonitor(ws: WebSocketMonitorService) {
  if (env.RESOLUTION_MONITOR_ENABLED !== 'true') {
    logger.info('Resolution monitor disabled by env flag')
    return
  }
  if (!supabaseAvailable()) {
    logger.info('Resolution monitor disabled: Supabase not configured')
    return
  }

  const baseEveryMin = Math.max(1, parseInt(env.RESOLUTION_SCAN_BASE_MINUTES || '10', 10))
  const nearEveryMin = Math.max(1, parseInt(env.RESOLUTION_SCAN_NEAR_MINUTES || '2', 10))
  const nearWindowMs = Math.max(1, parseInt(env.RESOLUTION_NEAR_WINDOW_HOURS || '24', 10)) * 60 * 60 * 1000
  const finalEverySec = Math.max(5, parseInt(env.RESOLUTION_SCAN_FINAL_SECONDS || '30', 10))
  const finalWindowMs = Math.max(1, parseInt(env.RESOLUTION_FINAL_WINDOW_MINUTES || '60', 10)) * 60 * 1000

  async function scanResolutions(mode: 'all' | 'near' | 'final') {
    try {
      // Fetch follows once
      const follows = await sb<FollowRow[]>(
        `tg_follows?select=user_id,kind,token_id,market_condition_id,market_name`
      )
      const byCondition = new Map<string, FollowRow[]>()
      for (const r of follows || []) {
        const cid = r.market_condition_id || null
        if (!cid) continue
        const arr = byCondition.get(cid) || []
        arr.push(r)
        byCondition.set(cid, arr)
      }
      if (byCondition.size === 0) return

      const now = Date.now()

      for (const [conditionId, rows] of byCondition) {
        try {
          const m: any = await gammaApi.getMarket(conditionId)
          const endIso = m?.end_date_iso || m?.endDateIso || m?.end_date
          const endTime = endIso ? Date.parse(endIso) : NaN
          if (mode === 'near') {
            const isSoon = Number.isFinite(endTime) && endTime - now <= nearWindowMs
            if (!isSoon) continue
          } else if (mode === 'final') {
            const isFinal = Number.isFinite(endTime) && endTime - now <= finalWindowMs
            if (!isFinal) continue
          }

          const isResolved = m?.resolved === true || (Array.isArray(m?.tokens) && m.tokens.some((t: any) => t.winner === true))
          if (!isResolved) continue
          const winnerToken = (m?.tokens || []).find((t: any) => t.winner) || null
          const winner = winnerToken?.outcome || 'Unknown'
          const question = m?.question || rows[0]?.market_name || conditionId

          for (const r of rows) {
            try {
              const useEmojis = (process.env.TELEGRAM_USE_EMOJIS || 'false') === 'true'
              const header = useEmojis ? '✅ Market Resolved' : 'MARKET RESOLVED'
              await (ws as any).bot.telegram.sendMessage(
                r.user_id,
                `${header}\n\n${question}\n\nWinning outcome: ${winner}\n\nAlerts for this market are now turned off.`
              )
            } catch (e) {
              logger.warn({ user: r.user_id, conditionId, err: (e as any)?.message }, 'Failed to notify resolution')
            }
            try {
              const { removeMarketSubscription, removePendingMarketByCondition, removeWhaleSubscription, removePendingWhaleByCondition } = await import('./subscriptions')
              if (r.kind === 'market') {
                if (r.token_id) await removeMarketSubscription(r.user_id, r.token_id)
                await removePendingMarketByCondition(r.user_id, conditionId)
                if (r.token_id) (ws as any).unsubscribeFromMarket(r.user_id, r.token_id)
              } else if (r.kind === 'whale') {
                if (r.token_id) await removeWhaleSubscription(r.user_id, r.token_id)
                await removePendingWhaleByCondition(r.user_id, conditionId, null as any)
                if (r.token_id) (ws as any).unsubscribeFromWhaleTrades(r.user_id, r.token_id)
              }
            } catch (e) {
              logger.warn({ user: r.user_id, conditionId, err: (e as any)?.message }, 'Failed to remove follow after resolution')
            }
          }
        } catch (e) {
          logger.warn({ conditionId, err: (e as any)?.message }, 'Resolution check failed for market')
        }
      }
    } catch (e) {
      logger.warn({ err: (e as any)?.message }, 'Resolution monitor run failed')
    }
  }

  // Baseline scan (all markets): every N minutes
  cron.schedule(`*/${baseEveryMin} * * * *`, () => scanResolutions('all'))
  // Near-end scan (within configurable hours): every M minutes
  cron.schedule(`*/${nearEveryMin} * * * *`, () => scanResolutions('near'))
  // Final scan (within last window): every S seconds (6-field cron)
  cron.schedule(`*/${finalEverySec} * * * * *`, () => scanResolutions('final'))

  logger.info({
    baseEveryMin,
    nearEveryMin,
    nearWindowHours: Math.round(nearWindowMs / 3600000),
    finalEverySec,
    finalWindowMin: Math.round(finalWindowMs / 60000),
  }, 'Resolution monitor started')
}
