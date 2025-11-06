import axios, { AxiosInstance } from 'axios';
import type {
  Position,
  PositionsParams,
  HoldersResponse,
  HoldersParams,
  UserValue,
  ClosedPosition,
  LeaderboardEntry,
  LeaderboardParams,
} from '../types';

/**
 * Polymarket Data API Client
 * Public read-only API for on-chain holdings and activities
 * Docs: https://docs.polymarket.com/#data-api
 */
export class DataApiClient {
  private client: AxiosInstance;
  private baseURL = 'https://data-api.polymarket.com';

  constructor(timeout = 10000) {
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        // Some Polymarket endpoints may return 403 without a UA in Node
        'User-Agent': 'Mozilla/5.0 (compatible; smtm-bot/1.0; +https://smtm.ai)',
        'Accept': 'application/json',
        // Hint origin to pass basic bot protections
        'Origin': 'https://polymarket.com',
        'Referer': 'https://polymarket.com/',
      },
    });
  }

  /**
   * Get open positions for a user
   * @param params - User address and optional pagination
   * @returns Array of positions
   */
  async getUserPositions(params: PositionsParams): Promise<Position[]> {
    const { data } = await this.client.get<Position[]>('/positions', {
      params: {
        user: params.user,
        limit: params.limit,
        offset: params.offset,
      },
    });
    return data;
  }

  /**
   * Get closed positions for a user
   * @param user - User's Ethereum address (0x...)
   * @param limit - Max number of positions to return
   * @param offset - Pagination offset
   * @returns Array of closed positions
   */
  async getClosedPositions(
    user: string,
    limit?: number,
    offset?: number
  ): Promise<ClosedPosition[]> {
    const { data } = await this.client.get<ClosedPosition[]>('/closed-positions', {
      params: { user, limit, offset },
    });
    return data;
  }

  /**
   * Get top holders (whales) for a specific market
   * @param params - Market condition ID and filters
   * @returns Array of holder data per token
   */
  async getTopHolders(params: HoldersParams): Promise<HoldersResponse[]> {
    const { data } = await this.client.get<HoldersResponse[]>('/holders', {
      params: {
        market: params.market,
        limit: params.limit || 50,
        minBalance: params.minBalance || 100,
      },
    });
    return data;
  }

  /**
   * Get total portfolio value for a user
   * @param user - User's Ethereum address (0x...)
   * @returns User value data
   */
  async getUserValue(user: string): Promise<UserValue> {
    const { data } = await this.client.get<any>('/value', {
      params: { user },
    });
    const item = Array.isArray(data) ? data[0] : data;
    if (!item) {
      return { user, value: '0' };
    }
    const vRaw = item.value;
    const valueNum = typeof vRaw === 'number' ? vRaw : parseFloat(String(vRaw ?? '0'));
    return {
      user: item.user || user,
      value: Number.isFinite(valueNum) ? String(valueNum) : '0',
      positions_count: item.positions_count,
    };
  }

  /**
   * Get top traders from the Polymarket leaderboard
   * @param params - Limit and offset for pagination
   * @returns Array of leaderboard entries sorted by PnL
   */
  async getLeaderboard(params?: LeaderboardParams): Promise<LeaderboardEntry[]> {
    const limit = params?.limit || 50;
    const offset = params?.offset || 0;
    // Attempt 1: axios
    try {
      const { data } = await this.client.get<LeaderboardEntry[]>('/leaderboard', { params: { limit, offset } });
      return data;
    } catch (err1: any) {
      // Attempt 2: fetch with explicit headers
      try {
        const url = `${this.baseURL}/leaderboard?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; smtm-bot/1.0; +https://smtm.ai)',
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Origin': 'https://polymarket.com',
            'Referer': 'https://polymarket.com/',
          },
        } as any);
        if (res.ok) {
          const text = await res.text();
          try {
            const json = JSON.parse(text);
            return Array.isArray(json) ? (json as LeaderboardEntry[]) : [];
          } catch (e) {
            console.error('getLeaderboard: JSON parse failed', { snippet: text.slice(0, 200) });
            return [];
          }
        }
        console.error('getLeaderboard: fetch failed', { status: res.status, statusText: res.statusText });
      } catch (err2) {
        console.error('getLeaderboard fallback fetch error:', (err2 as any)?.message || err2);
      }
      // If all attempts fail, return empty to let callers degrade gracefully
      console.error('getLeaderboard: axios failed', (err1 as any)?.message || err1);
      return [];
    }
  }

  /**
   * Batch fetch positions for multiple users
   * Useful for tracking known wallets
   * @param addresses - Array of Ethereum addresses
   * @returns Map of address to positions
   */
  async batchGetUserPositions(
    addresses: string[]
  ): Promise<Map<string, Position[]>> {
    const results = new Map<string, Position[]>();

    // Fetch in parallel with rate limiting consideration
    const promises = addresses.map(async (address) => {
      try {
        const positions = await this.getUserPositions({ user: address });
        results.set(address, positions);
      } catch (error) {
        console.error(`Failed to fetch positions for ${address}:`, error);
        results.set(address, []);
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Batch fetch user values for multiple addresses
   * Useful for leaderboards/rankings
   * @param addresses - Array of Ethereum addresses
   * @returns Map of address to value data
   */
  async batchGetUserValues(
    addresses: string[]
  ): Promise<Map<string, UserValue>> {
    const results = new Map<string, UserValue>();

    const promises = addresses.map(async (address) => {
      try {
        const value = await this.getUserValue(address);
        results.set(address, value);
      } catch (error) {
        console.error(`Failed to fetch value for ${address}:`, error);
        results.set(address, { user: address, value: '0' });
      }
    });

    await Promise.all(promises);
    return results;
  }
}

// Export singleton instance
export const dataApi = new DataApiClient();

// Export factory function for custom configurations
export function createDataApiClient(timeout?: number): DataApiClient {
  return new DataApiClient(timeout);
}
