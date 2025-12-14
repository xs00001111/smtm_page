import { promises as fs } from 'fs'
import { dirname } from 'path'
import { logger } from '../utils/logger'

type TradeEvent = {
  ts: number
  address: string
  tokenId: string
  value: number
}

const FILE = 'apps/telegram-bot/data/whales_snapshot.json'
const MAX_DAYS = 31
const MAX_EVENTS = 100_000

class WhaleAggregator {
  private events: TradeEvent[] = []
  private lastSave = 0

  async load() {
    try {
      const text = await fs.readFile(FILE, 'utf8')
      const json = JSON.parse(text)
      if (Array.isArray(json?.events)) {
        this.events = json.events.filter((e: any)=> e && typeof e.ts==='number' && typeof e.address==='string' && typeof e.tokenId==='string' && typeof e.value==='number')
        this.prune()
        logger.info({ count: this.events.length }, 'whale-aggregator loaded')
      }
    } catch {}
  }

  private prune() {
    const cutoff = Date.now() - MAX_DAYS*24*60*60*1000
    this.events = this.events.filter(e => e.ts >= cutoff)
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(this.events.length - MAX_EVENTS)
    }
  }

  async saveIfNeeded() {
    const now = Date.now()
    if (now - this.lastSave < 60_000) return
    this.lastSave = now
    try {
      await fs.mkdir(dirname(FILE), { recursive: true })
      const data = JSON.stringify({ events: this.events }, null, 0)
      await fs.writeFile(FILE, data)
    } catch (e) {
      logger.error(e, 'whale-aggregator save failed')
    }
  }

  recordTrade(address: string, tokenId: string, value: number, ts: number) {
    if (!address || !tokenId || !Number.isFinite(value)) return
    this.events.push({ ts, address: address.toLowerCase(), tokenId, value })
    this.prune()
    this.saveIfNeeded()
  }

  getTop(windowMs: number, limit = 10) {
    const cutoff = Date.now() - windowMs
    const score = new Map<string, number>()
    const markets = new Set<string>()
    for (const e of this.events) {
      if (e.ts < cutoff) continue
      score.set(e.address, (score.get(e.address) || 0) + e.value)
      markets.add(e.tokenId)
    }
    const list = Array.from(score.entries()).sort((a,b)=>b[1]-a[1]).slice(0, limit)
    return { list, markets: markets.size, updatedAt: new Date().toISOString() }
  }
}

export const whaleAggregator = new WhaleAggregator()

