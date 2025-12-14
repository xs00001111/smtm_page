import { Telegraf, Markup } from 'telegraf'
import * as cron from 'node-cron'
import { logger } from '../utils/logger'
import { promises as fs } from 'fs'
import path from 'path'

export type AlertPayload = {
  id: string
  title: string
  marketUrl?: string
  confidence: number // 0..1
  reason?: string
  ts: number // epoch ms
}

export type AlphaTier = 'high' | 'high_confidence' | 'daily_digest'
export type QuietHours = { startHour: number; endHour: number } | null

export type UserAlphaPrefs = {
  userId: number
  alpha_enabled: boolean
  alpha_tier: AlphaTier
  quiet_hours: QuietHours
  created_at: number
  updated_at: number
}

// File-based store (JSON). Abstracted for easy replacement later.
class JsonAlphaPrefsStore {
  private prefsFile: string
  private digestFile: string
  private cache: Map<number, UserAlphaPrefs> = new Map()
  private digestCache: Map<number, AlertPayload[]> = new Map()

  constructor(baseDir: string) {
    this.prefsFile = path.join(baseDir, 'alpha_prefs.json')
    this.digestFile = path.join(baseDir, 'alpha_digest.json')
  }

  async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.prefsFile), { recursive: true }).catch(() => {})
    await this.load()
    await this.loadDigest()
  }

  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.prefsFile, 'utf8')
      const obj = JSON.parse(raw) as Record<string, UserAlphaPrefs>
      this.cache.clear()
      for (const k of Object.keys(obj)) {
        const u = Number(k)
        const v = obj[k]
        if (Number.isFinite(u) && v) this.cache.set(u, v)
      }
    } catch {
      this.cache.clear()
    }
  }

  private async save(): Promise<void> {
    const obj: Record<string, UserAlphaPrefs> = {}
    for (const [k, v] of this.cache.entries()) obj[String(k)] = v
    await fs.writeFile(this.prefsFile, JSON.stringify(obj, null, 2), 'utf8')
  }

  private async loadDigest(): Promise<void> {
    try {
      const raw = await fs.readFile(this.digestFile, 'utf8')
      const obj = JSON.parse(raw) as Record<string, AlertPayload[]>
      this.digestCache.clear()
      for (const k of Object.keys(obj)) {
        const u = Number(k)
        const v = obj[k] || []
        if (Number.isFinite(u)) this.digestCache.set(u, v)
      }
    } catch {
      this.digestCache.clear()
    }
  }

  private async saveDigest(): Promise<void> {
    const obj: Record<string, AlertPayload[]> = {}
    for (const [k, v] of this.digestCache.entries()) obj[String(k)] = v
    await fs.writeFile(this.digestFile, JSON.stringify(obj, null, 2), 'utf8')
  }

  async get(userId: number): Promise<UserAlphaPrefs> {
    const now = Date.now()
    const cur = this.cache.get(userId)
    if (cur) return cur
    const def: UserAlphaPrefs = {
      userId,
      alpha_enabled: false,
      alpha_tier: 'high_confidence',
      quiet_hours: null,
      created_at: now,
      updated_at: now,
    }
    this.cache.set(userId, def)
    await this.save()
    return def
  }

  async set(userId: number, patch: Partial<UserAlphaPrefs>): Promise<UserAlphaPrefs> {
    const cur = await this.get(userId)
    const updated: UserAlphaPrefs = { ...cur, ...patch, userId, updated_at: Date.now() }
    // Enforce defaults/valids
    if (!updated.alpha_tier) updated.alpha_tier = 'high_confidence'
    this.cache.set(userId, updated)
    await this.save()
    return updated
  }

  async allEnabled(): Promise<UserAlphaPrefs[]> {
    return Array.from(this.cache.values()).filter((u) => u.alpha_enabled)
  }

  async queueDigest(userId: number, alert: AlertPayload): Promise<void> {
    const cur = this.digestCache.get(userId) || []
    // de-duplicate by alert id
    if (!cur.some((a) => a.id === alert.id)) cur.push(alert)
    this.digestCache.set(userId, cur)
    await this.saveDigest()
  }

  async takeDigest(userId: number): Promise<AlertPayload[]> {
    const cur = this.digestCache.get(userId) || []
    this.digestCache.set(userId, [])
    await this.saveDigest()
    return cur
  }
}

function inQuietHours(quiet: QuietHours, now: Date): boolean {
  if (!quiet) return false
  const h = now.getHours()
  const s = quiet.startHour
  const e = quiet.endHour
  if (s === e) return true // degenerate – treat as always quiet
  if (s < e) return h >= s && h < e
  // wrap past midnight
  return h >= s || h < e
}

// Rate limiter (memory). Max one alert per user per WINDOW_MS.
const RATE_WINDOW_MS = 10_000
const lastSend: Map<number, number> = new Map()

export class AlphaAlertsService {
  private bot: Telegraf
  private store: JsonAlphaPrefsStore
  private digestTask: cron.ScheduledTask | null = null

  constructor(bot: Telegraf, dataDir = path.join(__dirname, '..', 'data')) {
    this.bot = bot
    this.store = new JsonAlphaPrefsStore(dataDir)
  }

  async init(): Promise<void> {
    await this.store.init()
    // Schedule daily digest at 09:00 server time
    try {
      if (this.digestTask) this.digestTask.stop()
      this.digestTask = cron.schedule('0 9 * * *', () => {
        void this.sendDailyDigests()
      })
      logger.info('alpha_alerts.scheduler started for 09:00 daily digests')
    } catch (e) {
      logger.warn('alpha_alerts.scheduler failed to start', (e as any)?.message || e)
    }
  }

  async getPrefs(userId: number): Promise<UserAlphaPrefs> { return this.store.get(userId) }
  async updatePrefs(userId: number, patch: Partial<UserAlphaPrefs>): Promise<UserAlphaPrefs> { return this.store.set(userId, patch) }

  buildSettingsKeyboard(prefs: UserAlphaPrefs) {
    const enabled = prefs.alpha_enabled
    const tier = prefs.alpha_tier
    const qh = prefs.quiet_hours
    const rows: any[] = []
    if (!enabled) {
      rows.push([
        Markup.button.callback('Enable ⚡', 'alrt:t:high'),
        Markup.button.callback('Enable 🎯', 'alrt:t:high_confidence'),
      ])
      rows.push([Markup.button.callback('Enable 🧠 Daily', 'alrt:t:daily_digest')])
    } else {
      rows.push([
        Markup.button.callback('🔕 Mute', 'alrt:disable'),
        Markup.button.callback('⚙️ Settings', 'alrt:settings'),
      ])
      rows.push([
        Markup.button.callback(`⚡ High${tier==='high'?' ✓':''}`, 'alrt:t:high'),
        Markup.button.callback(`🎯 High conf${tier==='high_confidence'?' ✓':''}`, 'alrt:t:high_confidence'),
        Markup.button.callback(`🧠 Daily${tier==='daily_digest'?' ✓':''}`, 'alrt:t:daily_digest'),
      ])
    }
    const qLabel = qh ? `Quiet: ${qh.startHour}-${qh.endHour}` : 'Quiet: Off'
    rows.push([
      Markup.button.callback(`${qLabel}`, 'alrt:qh:menu'),
    ])
    return Markup.inlineKeyboard(rows)
  }

  buildQuietHoursKeyboard(current: QuietHours) {
    const rows: any[] = []
    const presets: Array<{ label: string; key: string }> = [
      { label: 'Off', key: 'off' },
      { label: '22–7', key: '22-7' },
      { label: '23–8', key: '23-8' },
      { label: '0–8', key: '0-8' },
    ]
    rows.push(
      presets.map((p) => Markup.button.callback(
        `${p.label}${this.qhEqualsKey(current, p.key) ? ' ✓' : ''}`,
        `alrt:qh:set:${p.key}`,
      ))
    )
    rows.push([Markup.button.callback('⬅️ Back', 'alrt:settings')])
    return Markup.inlineKeyboard(rows)
  }

  private qhEqualsKey(q: QuietHours, key: string): boolean {
    if (!q && key === 'off') return true
    if (!q) return false
    const [s, e] = key.split('-').map((x) => parseInt(x, 10))
    if (!Number.isFinite(s) || !Number.isFinite(e)) return false
    return q.startHour === s && q.endHour === e
  }

  async sendAlphaAlert(alert: AlertPayload): Promise<void> {
    const users = await this.store.allEnabled()
    const now = new Date()
    const tasks: Promise<any>[] = []

    for (const u of users) {
      // Tier-based routing
      if (u.alpha_tier === 'high_confidence' && !(alert.confidence >= 0.75)) {
        continue
      }
      if (u.alpha_tier === 'daily_digest') {
        tasks.push(this.store.queueDigest(u.userId, alert))
        continue
      }
      // Quiet hours
      if (inQuietHours(u.quiet_hours, now)) {
        await this.store.queueDigest(u.userId, alert)
        continue
      }
      // Rate limit per user
      const last = lastSend.get(u.userId) || 0
      if (Date.now() - last < RATE_WINDOW_MS) {
        logger.info({ userId: u.userId }, 'alpha_alerts.rate_limited')
        continue
      }
      lastSend.set(u.userId, Date.now())

      tasks.push(this.safeSendAlertMessage(u.userId, alert))
    }

    await Promise.allSettled(tasks)
  }

  private async safeSendAlertMessage(userId: number, alert: AlertPayload): Promise<void> {
    const text = this.renderAlert(alert)
    try {
      await this.bot.telegram.sendMessage(userId, text, {
        parse_mode: 'HTML',
        reply_markup: this.alertButtons().reply_markup,
        disable_web_page_preview: true,
      } as any)
      logger.info({ userId, alertId: alert.id }, 'alpha_alerts.sent')
    } catch (e) {
      logger.warn({ userId, err: (e as any)?.message || e }, 'alpha_alerts.send_failed')
    }
  }

  private renderAlert(a: AlertPayload): string {
    const parts: string[] = []
    parts.push(`🚨 <b>Alpha Alert</b>`) // concise header
    parts.push(`\n${a.title}`)
    if (a.reason) parts.push(`\n${a.reason}`)
    if (a.marketUrl) parts.push(`\n\n<a href="${a.marketUrl}">Open market</a>`)
    return parts.join('')
  }

  private alertButtons() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🔕 Mute', 'alrt:disable'), Markup.button.callback('⚙️ Settings', 'alrt:settings')],
    ])
  }

  async sendDailyDigests(): Promise<void> {
    const enabled = await this.store.allEnabled()
    for (const u of enabled) {
      if (u.alpha_tier !== 'daily_digest') continue
      const items = await this.store.takeDigest(u.userId)
      if (!items.length) continue
      const msg = this.renderDigest(items)
      try {
        await this.bot.telegram.sendMessage(u.userId, msg, {
          parse_mode: 'HTML',
          reply_markup: this.alertButtons().reply_markup,
          disable_web_page_preview: true,
        } as any)
        logger.info({ userId: u.userId, count: items.length }, 'alpha_alerts.digest_sent')
      } catch (e) {
        logger.warn({ userId: u.userId, err: (e as any)?.message || e }, 'alpha_alerts.digest_failed')
      }
    }
  }

  private renderDigest(items: AlertPayload[]): string {
    const lines = items
      .slice(0, 20)
      .map((a, i) => `${i + 1}. ${a.title}${a.marketUrl ? ` — <a href="${a.marketUrl}">link</a>` : ''}`)
    const more = items.length > 20 ? `\n…and ${items.length - 20} more` : ''
    return `🧠 <b>Daily Alpha Digest</b>\n\n${lines.join('\n')}${more}`
  }
}

// Singleton wiring for easy use across modules
let _alphaSvc: AlphaAlertsService | null = null
export function initAlphaAlerts(bot: Telegraf, dataDir?: string): AlphaAlertsService {
  if (!_alphaSvc) {
    _alphaSvc = new AlphaAlertsService(bot, dataDir)
  }
  return _alphaSvc
}
export function alphaAlerts(): AlphaAlertsService {
  if (!_alphaSvc) throw new Error('AlphaAlertsService not initialized')
  return _alphaSvc
}

