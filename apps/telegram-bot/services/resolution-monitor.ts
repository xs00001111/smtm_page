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
  if (!supabaseAvailable()) {
    logger.info('Resolution monitor disabled: Supabase not configured')
    return
  }

  // Check every 10 minutes; faster near end dates could be added later
  cron.schedule('*/10 * * * *', async () => {
    try {
      // Fetch distinct market condition ids from follows
      const follows = await sb<FollowRow[]>(
        `tg_follows?select=user_id,kind,token_id,market_condition_id,market_name`
      )
      const byCondition = new Map<string, FollowRow[]>()
      for (const r of follows || []) {
        if (r.kind !== 'market') continue
        const cid = r.market_condition_id || null
        if (!cid) continue
        const arr = byCondition.get(cid) || []
        arr.push(r)
        byCondition.set(cid, arr)
      }
      if (byCondition.size === 0) return

      for (const [conditionId, rows] of byCondition) {
        try {
          const m: any = await gammaApi.getMarket(conditionId)
          const isResolved = m?.resolved === true || (Array.isArray(m?.tokens) && m.tokens.some((t: any) => t.winner === true))
          if (!isResolved) continue
          const winnerToken = (m?.tokens || []).find((t: any) => t.winner) || null
          const winner = winnerToken?.outcome || 'Unknown'
          const question = m?.question || rows[0]?.market_name || conditionId

          // Notify all followers and remove the follow
          for (const r of rows) {
            try {
              await ws.bot.telegram.sendMessage(
                r.user_id,
                `✅ Market Resolved\n\n${question}\n\nWinning outcome: ${winner}\n\nAlerts for this market are now turned off.`
              )
            } catch (e) {
              logger.warn('Failed to notify resolution', { user: r.user_id, conditionId, err: (e as any)?.message })
            }
            try {
              const { removeMarketSubscription, removePendingMarketByCondition } = await import('./subscriptions')
              if (r.token_id) await removeMarketSubscription(r.user_id, r.token_id)
              await removePendingMarketByCondition(r.user_id, conditionId)
              if (r.token_id) ws.unsubscribeFromMarket(r.user_id, r.token_id)
            } catch (e) {
              logger.warn('Failed to remove follow after resolution', { user: r.user_id, conditionId, err: (e as any)?.message })
            }
          }
        } catch (e) {
          logger.warn('Resolution check failed for market', { conditionId, err: (e as any)?.message })
        }
      }
    } catch (e) {
      logger.warn('Resolution monitor run failed', { err: (e as any)?.message })
    }
  })

  logger.info('Resolution monitor started (every 10 minutes)')
}

