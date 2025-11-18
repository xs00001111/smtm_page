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

  async function scanResolutions(nearOnly: boolean) {
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
      const soonMs = 24 * 60 * 60 * 1000

      for (const [conditionId, rows] of byCondition) {
        try {
          const m: any = await gammaApi.getMarket(conditionId)
          const endIso = m?.end_date_iso || m?.endDateIso || m?.end_date
          const endTime = endIso ? Date.parse(endIso) : NaN
          if (nearOnly) {
            const isSoon = Number.isFinite(endTime) && endTime - now <= soonMs
            if (!isSoon) continue
          }

          const isResolved = m?.resolved === true || (Array.isArray(m?.tokens) && m.tokens.some((t: any) => t.winner === true))
          if (!isResolved) continue
          const winnerToken = (m?.tokens || []).find((t: any) => t.winner) || null
          const winner = winnerToken?.outcome || 'Unknown'
          const question = m?.question || rows[0]?.market_name || conditionId

          for (const r of rows) {
            try {
              await (ws as any).bot.telegram.sendMessage(
                r.user_id,
                `✅ Market Resolved\n\n${question}\n\nWinning outcome: ${winner}\n\nAlerts for this market are now turned off.`
              )
            } catch (e) {
              logger.warn('Failed to notify resolution', { user: r.user_id, conditionId, err: (e as any)?.message })
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
  }

  // Baseline: every 10 minutes
  cron.schedule('*/10 * * * *', () => scanResolutions(false))
  // High-frequency: every 2 minutes for markets ending within 24h
  cron.schedule('*/2 * * * *', () => scanResolutions(true))

  logger.info('Resolution monitor started (10m baseline, 2m for near-end markets)')
}
