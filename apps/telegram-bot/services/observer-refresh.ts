import { WebSocketMonitorService } from './websocket-monitor'
import { gammaApi } from '@smtm/data'
import { env } from '@smtm/shared/env'
import { logger } from '../utils/logger'

let timer: any = null
let running = false

export function startObserverRefresh(ws: WebSocketMonitorService) {
  const enabled = env.OBSERVER_REFRESH_ENABLED === 'true'
  const intervalMs = Math.max(120_000, parseInt(env.OBSERVER_REFRESH_INTERVAL_MS || '300000', 10))
  if (!enabled) {
    logger.info('observer.refresh disabled')
    return
  }
  if (timer) return
  logger.info({ intervalMs }, 'observer.refresh starting')
  const tick = async () => {
    if (running) return
    running = true
    try {
      const trending = await gammaApi.getTrendingMarkets(40).catch(()=>[] as any[])
      const active = await gammaApi.getActiveMarkets(200, 'volume').catch(()=>[] as any[])
      const tokenIds: string[] = []
      const seen = new Set<string>()
      const add = (arr:any[]) => { for (const m of arr) for (const t of (m.tokens||[])) if (t?.token_id && !seen.has(t.token_id)) { seen.add(t.token_id); tokenIds.push(t.token_id) } }
      add(trending); add(active)
      logger.info({ count: tokenIds.length }, 'observer.refresh tokens')
      if (tokenIds.length) ws.setObserverAssets(tokenIds)
    } catch (e) {
      logger.warn({ err: (e as any)?.message || e }, 'observer.refresh error')
    } finally {
      running = false
    }
  }
  timer = setInterval(tick, intervalMs)
  setTimeout(tick, 10_000)
}

export function stopObserverRefresh() {
  if (timer) clearInterval(timer)
  timer = null
}

