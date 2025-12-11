import { gammaApi } from './clients/gamma-api'
import type { GammaMarket } from './types'
import Fuse from 'fuse.js'

export async function findMarketFuzzy(query: string, limit = 5): Promise<GammaMarket[]> {
  try {
    const markets = await gammaApi.searchMarkets(query, limit)
    return markets
  } catch {
    const activeMarkets = await gammaApi.getActiveMarkets(500, 'volume')
    if (activeMarkets.length === 0) return []
    const fuse = new Fuse(activeMarkets, {
      keys: [
        { name: 'question', weight: 0.7 },
        { name: 'slug', weight: 0.2 },
        { name: 'description', weight: 0.1 },
      ],
      threshold: 0.4,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2,
    })
    const results = fuse.search(query, { limit })
    return results.map((r) => r.item as GammaMarket)
  }
}

export async function findMarket(query: string): Promise<GammaMarket | null> {
  try {
    if (query.startsWith('0x') && query.length === 66) {
      return await gammaApi.getMarket(query)
    }
    try {
      return await gammaApi.getMarketBySlug(query.toLowerCase())
    } catch {}
    const fuzzy = await findMarketFuzzy(query, 1)
    return fuzzy[0] || null
  } catch (e) {
    console.error('findMarket failed', (e as any)?.message || e)
    return null
  }
}

