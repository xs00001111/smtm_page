// NOTE: alpha utilities are not exported from the @smtm/data barrel.
// Import from the module path directly to avoid undefined at runtime.
import { scanAlphaFromTrades } from '@smtm/data/alpha'
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
  logger.info({
    intervalMs,
    alphaEnabled: enabled,
    supabaseAlphaEnabled: env.SUPABASE_ALPHA_ENABLED === 'true',
    wsEnabled: (process.env.WEBSOCKET_ENABLED || 'true') === 'true',
  }, 'alpha.harvester starting')
  const tick = async () => {
    if (running) return
    running = true
    const t0 = Date.now()
    try {
      logger.info('alpha.harvester run.begin')
      const scanCfg = {
        windowMs: 12 * 60 * 60 * 1000,
        minNotionalUsd: 1000,
        limit: 1000,
        maxBatches: 3,
      }
      logger.info(scanCfg, 'alpha.harvester scan.config')
      const best = await scanAlphaFromTrades({
        ...scanCfg,
        onLog: (m, ctx) => logger.info({ ...(ctx || {}) }, `alpha:harvest ${m}`)
      })
      if (best) {
        logger.info({ tokenId: best.tokenId, notional: Math.round(best.notional) }, 'alpha.harvester run.result')

        // Fetch market details to get the question
        let marketQuestion = 'Market'
        let marketUrl: string | undefined
        try {
          const { gammaApi } = await import('@smtm/data')
          const market = await gammaApi.getMarketByCondition(best.marketId!)
          if (market) {
            marketQuestion = market.question || market.title || 'Market'
            marketUrl = market.id ? `https://polymarket.com/event/${market.slug || market.id}` : undefined
          }
        } catch (e) {
          logger.warn({ err: (e as any)?.message }, 'alpha.harvester failed to fetch market details')
        }

        // Get whale description if available
        let whaleDesc = best.wallet ? `${best.wallet.slice(0, 6)}...${best.wallet.slice(-4)}` : 'Unknown'
        try {
          const { getWhaleDescription } = await import('@smtm/data/whale-descriptions')
          if (best.wallet) {
            const desc = getWhaleDescription(best.wallet)
            if (desc) whaleDesc = desc
          }
        } catch (e) {
          logger.warn({ err: (e as any)?.message }, 'alpha.harvester failed to get whale description')
        }

        // Persist approximate whale alpha
        const alphaScore = best.notional >= 10000 ? (best.notional >= 50000 ? 90 : best.notional >= 20000 ? 80 : 70) : 55

        // Format alert title and summary similar to /alpha command
        const side = best.side === 'BUY' ? 'bought YES' : best.side === 'SELL' ? 'sold YES' : 'traded'
        const amount = `$${Math.round(best.notional).toLocaleString()}`
        const price = `${(best.price * 100).toFixed(1)}¢`

        // Title: "Whale bought YES at 99.8¢"
        const title = `${whaleDesc} ${side} at ${price}`
        // Reason: Market question + amount
        const reason = `${marketQuestion}\n${amount}${best.whaleScore ? ` · Rank ${best.whaleScore}` : ''}`

        const ev: any = {
          id: `${Date.now()}-${best.tokenId}-${Math.round(best.notional)}`,
          ts: best.ts,
          kind: 'whale',
          tokenId: best.tokenId,
          conditionId: best.marketId || undefined,
          wallet: best.wallet || undefined,
          alpha: alphaScore,
          title: title,
          summary: reason,
          data: {
            weightedNotionalUsd: best.notional,
            whaleScore: best.whaleScore || null,
            recommendation: null,
            side: best.side,
            price: best.price,
            notional_usd: best.notional,
          },
        }
        await persistAlphaEvent(ev as any)
        // Also notify opted-in users (confidence scaled from alpha)
        try {
          const alertPayload = {
            id: String(ev.id),
            title: ev.title,
            marketUrl,
            confidence: Math.max(0, Math.min(1, ev.alpha / 100)),
            reason: ev.summary,
            ts: ev.ts,
          }
          logger.info({ alertId: alertPayload.id, confidence: alertPayload.confidence }, 'alpha.harvester sending alert')
          await alphaAlerts().sendAlphaAlert(alertPayload)
          logger.info({ alertId: alertPayload.id }, 'alpha.harvester alert sent')
        } catch (e) {
          logger.error({ err: (e as any)?.message || e, stack: (e as any)?.stack }, 'alpha.harvester alert send failed')
        }
      } else {
        logger.info('alpha.harvester run.empty')
      }
    } catch (e) {
      const errAny: any = e
      logger.warn({
        name: errAny?.name,
        message: errAny?.message || String(e),
        stack: errAny?.stack,
      }, 'alpha.harvester run.error')
    } finally {
      running = false
      logger.info({ elapsedMs: Date.now() - t0 }, 'alpha.harvester run.end')
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
