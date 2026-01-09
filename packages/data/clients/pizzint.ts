/**
 * Pizzint (PPW) client – lightweight helper to consume public JSON endpoints.
 *
 * Endpoints implemented:
 *  - GET /api/dashboard-data
 *  - GET /api/osint-feed
 *  - GET /api/polymarket/market-card-data
 *  - GET /api/gdelt/batch
 *
 * No external dependencies; uses global fetch. Includes:
 *  - Per-request in-memory TTL cache
 *  - Simple rate limiter (minimum interval between outbound requests)
 */

export type PPWFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface PizzintClientOptions {
  baseUrl?: string
  minIntervalMs?: number // rate limit: minimum time between requests
  fetchFn?: PPWFetch
  cacheTtlMs?: {
    osintFeed?: number
    dashboard?: number
    marketCard?: number
    gdelt?: number
  }
}

type CacheEntry<T> = { ts: number; data: T }

export class PizzintClient {
  private baseUrl: string
  private minIntervalMs: number
  private fetchFn: PPWFetch
  private lastCallAt = 0
  private cache = new Map<string, CacheEntry<any>>()
  private ttl = {
    osintFeed: 30_000,
    dashboard: 60_000,
    marketCard: 600_000,
    gdelt: 3_600_000,
  }

  constructor(opts?: PizzintClientOptions) {
    this.baseUrl = (opts?.baseUrl || 'https://www.pizzint.watch').replace(/\/$/, '')
    this.minIntervalMs = Math.max(0, opts?.minIntervalMs ?? 300)
    this.fetchFn = opts?.fetchFn || (globalThis.fetch as PPWFetch)
    if (opts?.cacheTtlMs) this.ttl = { ...this.ttl, ...opts.cacheTtlMs }
  }

  // --- Helpers ---
  private async rateLimitWait(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastCallAt
    const wait = this.minIntervalMs - elapsed
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    this.lastCallAt = Date.now()
  }

  private cacheKey(path: string, params?: Record<string, any>): string {
    const usp = new URLSearchParams()
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v === undefined || v === null) return
      usp.set(k, String(v))
    })
    const q = usp.toString()
    return `${path}${q ? '?' + q : ''}`
  }

  private getCached<T>(key: string, ttlMs: number): T | null {
    const ent = this.cache.get(key)
    if (ent && Date.now() - ent.ts < ttlMs) return ent.data as T
    return null
  }

  private setCached<T>(key: string, data: T): void { this.cache.set(key, { ts: Date.now(), data }) }

  private async getJson<T>(path: string, params?: Record<string, any>): Promise<T> {
    const url = new URL(this.baseUrl + path)
    Object.entries(params || {}).forEach(([k, v]) => {
      if (v === undefined || v === null) return
      url.searchParams.set(k, String(v))
    })
    await this.rateLimitWait()
    const res = await this.fetchFn(url.toString(), {
      headers: { 'accept': 'application/json' },
    })
    if (!res.ok) throw new Error(`PPW ${path} ${res.status}`)
    return (await res.json()) as T
  }

  // --- Public API ---
  async getDashboard(): Promise<any> {
    const key = this.cacheKey('/api/dashboard-data')
    const c = this.getCached<any>(key, this.ttl.dashboard)
    if (c) return c
    const json = await this.getJson<any>('/api/dashboard-data')
    this.setCached(key, json)
    return json
  }

  async getOsintFeed(opts?: { includeTruth?: 0 | 1; limit?: number; truthLimit?: number }): Promise<any> {
    const params = {
      includeTruth: opts?.includeTruth ?? 1,
      limit: opts?.limit ?? 80,
      truthLimit: opts?.truthLimit ?? 80,
    }
    const key = this.cacheKey('/api/osint-feed', params)
    const c = this.getCached<any>(key, this.ttl.osintFeed)
    if (c) return c
    const json = await this.getJson<any>('/api/osint-feed', params)
    this.setCached(key, json)
    return json
  }

  async getMarketCard(id: string | number, timestampIso?: string): Promise<any> {
    const params: Record<string, any> = { id }
    if (timestampIso) params.timestamp = timestampIso
    const key = this.cacheKey('/api/polymarket/market-card-data', params)
    const c = this.getCached<any>(key, this.ttl.marketCard)
    if (c) return c
    const json = await this.getJson<any>('/api/polymarket/market-card-data', params)
    this.setCached(key, json)
    return json
  }

  async getGdeltBatch(opts: { pairs: string[]; method?: string; dateStart: string; dateEnd: string }): Promise<any> {
    const params = {
      pairs: opts.pairs.join(','),
      method: opts.method || 'gpr',
      dateStart: opts.dateStart,
      dateEnd: opts.dateEnd,
    }
    const key = this.cacheKey('/api/gdelt/batch', params)
    const c = this.getCached<any>(key, this.ttl.gdelt)
    if (c) return c
    const json = await this.getJson<any>('/api/gdelt/batch', params)
    this.setCached(key, json)
    return json
  }
}

export const pizzint = new PizzintClient()

