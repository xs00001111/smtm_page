import axios, { AxiosInstance } from 'axios';
import type { GammaMarket, MarketsQueryParams } from '../types';
import { clobApi } from './clob-api';

/**
 * Polymarket Gamma Markets API Client
 * Public API for market discovery and metadata
 * Docs: https://docs.polymarket.com/#gamma-markets-api
 */
export class GammaApiClient {
  private client: AxiosInstance;
  private baseURL = 'https://gamma-api.polymarket.com';

  constructor(timeout = 10000) {
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Fetch markets with filters and pagination
   * @param params - Query parameters for filtering markets
   * @returns Array of markets
   */
  async getMarkets(params?: MarketsQueryParams): Promise<GammaMarket[]> {
    const { data } = await this.client.get<GammaMarket[]>('/markets', {
      params: {
        limit: params?.limit || 100,
        offset: params?.offset || 0,
        active: params?.active,
        closed: params?.closed,
        archived: params?.archived,
        // Allowed fields typically include 'volume', 'liquidity', 'end_date'
        order: params?.order || 'volume',
        ascending: params?.ascending || false,
        tag: params?.tag,
      },
    });
    return data;
  }

  /**
   * Get a single market by condition ID
   * @param conditionId - The market's condition ID (0x...)
   * @returns Market data
   */
  async getMarket(conditionId: string): Promise<GammaMarket> {
    try {
      const { data } = await this.client.get<GammaMarket>(`/markets/${conditionId}`);
      return data;
    } catch (err: any) {
      // Gamma API path param lookup fails, use CLOB API instead
      // CLOB API /markets/${conditionId} works correctly
      try {
        const market = await clobApi.getMarket(conditionId);
        return market as GammaMarket;
      } catch (clobErr) {
        // If CLOB also fails, throw original error
        throw err;
      }
    }
  }

  /**
   * Get a market by slug
   * @param slug - Market slug (e.g., "trump-2024")
   * @returns Market data
   */
  async getMarketBySlug(slug: string): Promise<GammaMarket> {
    const { data } = await this.client.get<GammaMarket>(`/markets`, {
      params: { slug },
    });
    // API returns array, take first match
    return Array.isArray(data) ? data[0] : data;
  }

  /**
   * Search markets by query string
   * @param query - Search query
   * @param limit - Max results to return
   * @returns Array of matching markets
   */
  async searchMarkets(query: string, limit = 20): Promise<GammaMarket[]> {
    const { data } = await this.client.get<GammaMarket[]>('/markets', {
      params: {
        search: query,
        limit,
      },
    });
    return data;
  }

  /**
   * Get active markets only
   * @param limit - Max results
   * @param order - Sort order
   * @returns Array of active markets
   */
  async getActiveMarkets(
    limit = 50,
    order: 'liquidity' | 'volume' = 'volume'
  ): Promise<GammaMarket[]> {
    return this.getMarkets({
      active: true,
      closed: false,
      archived: false,
      limit,
      order,
    });
  }

  /**
   * Get trending markets (by 24hr volume)
   * @param limit - Max results
   * @returns Array of trending markets
   */
  async getTrendingMarkets(limit = 20): Promise<GammaMarket[]> {
    // Use total volume as a robust proxy for trending when 24h ordering isn't supported
    return this.getMarkets({
      active: true,
      limit,
      order: 'volume',
      ascending: false,
    });
  }

  /**
   * Get featured markets
   * @param limit - Max results
   * @returns Array of featured markets
   */
  async getFeaturedMarkets(limit = 10): Promise<GammaMarket[]> {
    const markets = await this.getActiveMarkets(100, 'volume');
    // Filter for featured (if API supports it) or return top by volume
    return markets.filter((m) => m.featured).slice(0, limit);
  }

  /**
   * Get markets by tag
   * @param tag - Tag to filter by (e.g., "politics", "sports")
   * @param limit - Max results
   * @returns Array of markets with the tag
   */
  async getMarketsByTag(tag: string, limit = 50): Promise<GammaMarket[]> {
    return this.getMarkets({
      tag,
      limit,
      active: true,
    });
  }

  /**
   * Get markets ending soon
   * @param limit - Max results
   * @returns Array of markets ending soonest
   */
  async getMarketsEndingSoon(limit = 20): Promise<GammaMarket[]> {
    return this.getMarkets({
      active: true,
      closed: false,
      limit,
      order: 'end_date_min',
      ascending: true,
    });
  }

  /**
   * Extract condition ID from various market identifiers
   * Useful helper when you have slug or other identifier
   * @param identifier - Slug, condition ID, or question
   * @returns Condition ID if found
   */
  async findConditionId(identifier: string): Promise<string | null> {
    // If it looks like a condition ID already, return it
    if (identifier.startsWith('0x') && identifier.length === 66) {
      return identifier;
    }

    // Try as slug first
    try {
      const market = await this.getMarketBySlug(identifier);
      return market.condition_id;
    } catch {
      // If slug fails, try search
      try {
        const markets = await this.searchMarkets(identifier, 1);
        return markets.length > 0 ? markets[0].condition_id : null;
      } catch {
        return null;
      }
    }
  }

  /**
   * Get market statistics summary
   * @param conditionId - Market condition ID
   * @returns Market stats
   */
  async getMarketStats(conditionId: string) {
    const market = await this.getMarket(conditionId);
    return {
      conditionId: market.condition_id,
      question: market.question,
      volume: market.volume,
      volume24hr: market.volume_24hr,
      liquidity: market.liquidity,
      active: market.active,
      closed: market.closed,
      endDate: market.end_date_iso,
      tokens: market.tokens?.map((t) => ({
        outcome: t.outcome,
        price: t.price,
        winner: t.winner,
      })),
    };
  }
}

// Export singleton instance
export const gammaApi = new GammaApiClient();

// Export factory function for custom configurations
export function createGammaApiClient(timeout?: number): GammaApiClient {
  return new GammaApiClient(timeout);
}
