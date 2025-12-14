// NOTE: alpha utilities are not exported from the @smtm/data barrel.
// Import from the module path directly to avoid undefined at runtime.
import { progressiveLiveScan } from '@smtm/data/alpha'
import { persistAlphaEvent } from './alpha-store'
import { alphaAlerts } from './alpha-alerts'
import { logger } from '../utils/logger'
import { env } from '@smtm/shared/env'

let running = false
let timer: any = null

export function startAlphaHarvester() {
  const enabled = env.ALPHA_HARVEST_ENABLED === 'true'
  const intervalMs = Math.max(60_000, parseInt(env.ALPHA_HARVEST_INTERVAL_MS || '180000', 10))
  if (!enabled) {
    logger.info('alpha.harvester disabled')
    return
  }
  if (timer) return
  logger.info('alpha.harvester starting', {
    intervalMs,
    alphaEnabled: enabled,
    supabaseAlphaEnabled: env.SUPABASE_ALPHA_ENABLED === 'true',
    wsEnabled: (process.env.WEBSOCKET_ENABLED || 'true') === 'true',
  })
  const tick = async () => {
    if (running) return
    running = true
    const t0 = Date.now()
    try {
      logger.info('alpha.harvester run.begin')
      const scanCfg = {
        minNotionalUsd: 0,
        withinMs: 24*60*60*1000,
        perTokenLimit: 200,
        maxMarkets: 200,
        delayMs: 250,
        maxDurationMs: 4*60*1000,
      }
      logger.info('alpha.harvester scan.config', scanCfg)
      const best = await progressiveLiveScan({
        ...scanCfg,
        onLog: (m, ctx) => logger.info({ ...(ctx || {}) }, `alpha:harvest ${m}`)
      })
      if (best) {
        logger.info('alpha.harvester run.result', { tokenId: best.tokenId, notional: Math.round(best.notional) })
        // Persist approximate whale alpha
        const alphaScore = best.notional >= 10000 ? (best.notional >= 50000 ? 90 : best.notional >= 20000 ? 80 : 70) : 55
        const ev: any = {
          id: `${Date.now()}-${best.tokenId}-${Math.round(best.notional)}`,
          ts: Date.now(),
          kind: 'whale',
          tokenId: best.tokenId,
          conditionId: best.marketId || undefined,
          alpha: alphaScore,
          title: alphaScore === 55 ? 'Harvester: Small Trade' : 'Harvester: Big Trade',
          summary: `${best.side || 'TRADE'} $${Math.round(best.notional).toLocaleString()} @ ${(best.price*100).toFixed(1)}¢`,
          data: { weightedNotionalUsd: best.notional, whaleScore: null, recommendation: null },
        }
        await persistAlphaEvent(ev as any)
        // Also notify opted-in users (confidence scaled from alpha)
        try {
          await alphaAlerts().sendAlphaAlert({
            id: String(ev.id),
            title: ev.title,
            confidence: Math.max(0, Math.min(1, ev.alpha / 100)),
            reason: ev.summary,
            ts: ev.ts,
          })
        } catch {}
      } else {
        logger.info('alpha.harvester run.empty')
      }
    } catch (e) {
      const errAny: any = e
      logger.warn('alpha.harvester run.error', {
        name: errAny?.name,
        message: errAny?.message || String(e),
        stack: errAny?.stack,
      })
    } finally {
      running = false
      logger.info('alpha.harvester run.end', { elapsedMs: Date.now() - t0 })
    }
  }
  timer = setInterval(tick, intervalMs)
  // Kick off first run shortly after startup
  setTimeout(tick, 5_000)
}

export function stopAlphaHarvester() {
  if (timer) clearInterval(timer)
  timer = null
}
