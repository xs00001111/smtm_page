import cron from 'node-cron'
import { ensureDailySnapshot, todayUtc } from './gtm-store'
import { logger } from '../utils/logger'

export function startGtmScheduler() {
  const disabled = String(process.env.GTM_SCHEDULER_ENABLED || '').toLowerCase() === 'false'
  if (disabled) {
    logger.info('gtm:scheduler disabled via GTM_SCHEDULER_ENABLED=false')
    return
  }
  // Ensure today exists at startup
  ensureDailySnapshot({ dayUtc: todayUtc() })
    .then(r => logger.info({ day: r?.day_utc, id: r?.id }, 'gtm:scheduler ensured today snapshot'))
    .catch(e => logger.warn({ err: (e as any)?.message || e }, 'gtm:scheduler ensure today failed'))

  // Run at 00:00 UTC daily
  cron.schedule('0 0 * * *', async () => {
    try {
      const row = await ensureDailySnapshot({ dayUtc: todayUtc() })
      logger.info({ day: row?.day_utc, id: row?.id }, 'gtm:scheduler daily snapshot ensured')
    } catch (e: any) {
      logger.error({ err: e?.message || String(e) }, 'gtm:scheduler daily snapshot failed')
    }
  }, { timezone: 'UTC' })
  logger.info('gtm:scheduler started (cron 0 0 * * * UTC)')
}

