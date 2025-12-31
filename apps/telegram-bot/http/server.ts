import express from 'express'
import { getGameSet, getTrader } from '../services/gtm-aggregator'
import { ensureDailySnapshot, todayUtc } from '../services/gtm-store'

export function createApp() {
  const app = express()
  app.use(express.json({ limit: '1mb' }))

  app.get('/healthz', (_req, res) => res.status(200).send('ok'))

  // Legacy route: serve today's snapshot if Supabase is configured; otherwise fallback to generator
  app.get('/gtm/game', async (req, res) => {
    try {
      const ttl = Number(req.query.ttl || '60')
      const today = todayUtc()
      const row = await ensureDailySnapshot({ dayUtc: today })
      if (row && Array.isArray(row.traders)) {
        res.json({ day: row.day_utc, traders: row.traders, id: row.id, source: 'supabase' })
        return
      }
      // Fallback (dev/local without Supabase)
      const traders = await getGameSet(Number.isFinite(ttl) ? ttl : 60)
      res.json({ day: today, traders, source: 'generator', generatedAt: new Date().toISOString() })
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) })
    }
  })

  // New canonical route
  app.get('/battle', async (_req, res) => {
    try {
      const today = todayUtc()
      const row = await ensureDailySnapshot({ dayUtc: today })
      if (!row || !Array.isArray(row.traders)) return res.status(503).json({ error: 'snapshot unavailable' })
      res.json({ day: row.day_utc, traders: row.traders, id: row.id, source: 'supabase' })
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) })
    }
  })

  app.get('/gtm/trader/:address', async (req, res) => {
    try {
      const { address } = req.params
      if (!address || !address.startsWith('0x') || address.length !== 42) return res.status(400).json({ error: 'invalid address' })
      const trader = await getTrader(address)
      res.json({ trader })
    } catch (e: any) {
      res.status(500).json({ error: e?.message || String(e) })
    }
  })

  return app
}

// Allow running standalone for local tests
if (typeof require !== 'undefined' && (require as any).main === module) {
  const app = createApp()
  const port = Number(process.env.PORT || 4000)
  app.listen(port, () => console.log(`[gtm] listening on ${port}`))
}
