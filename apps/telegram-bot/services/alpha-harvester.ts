import { progressiveLiveScan } from '@smtm/data'
import { persistAlphaEvent } from './alpha-store'
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
  logger.info('alpha.harvester starting', { intervalMs })
  const tick = async () => {
    if (running) return
    running = true
    const t0 = Date.now()
    try {
      logger.info('alpha.harvester run.begin')
      const best = await progressiveLiveScan({
        minNotionalUsd: 0,
        withinMs: 24*60*60*1000,
        perTokenLimit: 200,
        maxMarkets: 200,
        delayMs: 250,
        maxDurationMs: 4*60*1000,
        onLog: (m, ctx) => logger.info(`alpha:harvest ${m}`, ctx || {})
      })
      if (best) {
        logger.info('alpha.harvester run.result', { tokenId: best.tokenId, notional: Math.round(best.notional) })
        // Persist approximate whale alpha
        const alphaScore = best.notional >= 10000 ? (best.notional >= 50000 ? 90 : best.notional >= 20000 ? 80 : 70) : 55
        await persistAlphaEvent({
          id: `${Date.now()}-${best.tokenId}-${Math.round(best.notional)}`,
          ts: Date.now(),
          kind: 'whale',
          tokenId: best.tokenId,
          conditionId: best.marketId || undefined,
          alpha: alphaScore,
          title: alphaScore === 55 ? 'Harvester: Small Trade' : 'Harvester: Big Trade',
          summary: `${best.side || 'TRADE'} $${Math.round(best.notional).toLocaleString()} @ ${(best.price*100).toFixed(1)}¢`,
          data: { weightedNotionalUsd: best.notional, whaleScore: null, recommendation: null },
        } as any)
      } else {
        logger.info('alpha.harvester run.empty')
      }
    } catch (e) {
      logger.warn('alpha.harvester run.error', { err: (e as any)?.message || e })
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
