import express from 'express'
import { getGameSet, getTrader } from '../services/gtm-aggregator'

export function createApp() {
  const app = express()
  app.use(express.json({ limit: '1mb' }))

  app.get('/healthz', (_req, res) => res.status(200).send('ok'))

  app.get('/gtm/game', async (req, res) => {
    try {
      const ttl = Number(req.query.ttl || '60')
      const window = String(req.query.window || 'all') // reserved for future
      void window // not used yet
      const traders = await getGameSet(Number.isFinite(ttl) ? ttl : 60)
      res.json({ traders, generatedAt: new Date().toISOString() })
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
