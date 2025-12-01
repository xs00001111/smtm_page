import axios, { AxiosInstance } from 'axios';
const DATA_DEBUG = process.env.DATA_DEBUG === 'true';
function dataDbg(msg: string, ctx?: any) {
  if (DATA_DEBUG) {
    try {
      // Avoid JSON errors if ctx has cycles
      console.log('[DATA][debug]', msg, ctx ? JSON.stringify(ctx) : '');
    } catch {
      console.log('[DATA][debug]', msg);
    }
  }
}
const DATA_DEBUG = process.env.DATA_DEBUG === 'true';
function dataDbg(msg: string, ctx?: any) {
  if (DATA_DEBUG) {
    try { console.log('[DATA][debug]', msg, ctx ? JSON.stringify(ctx) : ''); } catch { console.log('[DATA][debug]', msg); }
  }
}
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
  private dbg(msg: string, ctx?: any) { dataDbg(msg, ctx) }

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
    this.dbg('client.init', { baseURL: this.baseURL });
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
      dataDbg('leaderboard.api.axios', { limit, offset });
      const { data } = await this.client.get<LeaderboardEntry[]>('/leaderboard', { params: { limit, offset } });
      dataDbg('leaderboard.api.axios.ok', { count: Array.isArray(data) ? data.length : 0 });
      return data;
    } catch (err1: any) {
      // Attempt 2: fetch with explicit headers
      try {
        const url = `${this.baseURL}/leaderboard?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`;
        dataDbg('leaderboard.api.fetch', { url });
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
            dataDbg('leaderboard.api.fetch.ok', { count: Array.isArray(json) ? json.length : 0 });
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
      // Attempt 3: scrape public leaderboard HTML and parse __NEXT_DATA__ as last resort
      try {
        const url2 = 'https://polymarket.com/leaderboard';
        dataDbg('leaderboard.html.fetch', { url: url2 });
        const res2 = await fetch(url2, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; smtm-bot/1.0; +https://smtm.ai)',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Referer': 'https://polymarket.com/',
          },
        } as any);
        if (res2.ok) {
          const html = await res2.text();
          // Try to parse __NEXT_DATA__ JSON which contains full leaderboard data
          const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
          if (match && match[1]) {
            try {
              const nextData = JSON.parse(match[1]);
              const queries = nextData?.props?.pageProps?.dehydratedState?.queries || [];
              for (const query of queries) {
                const data = query?.state?.data;
                if (Array.isArray(data) && data.length > 0 && (data[0]?.proxyWallet || data[0]?.proxy_wallet)) {
                  // Found leaderboard data in __NEXT_DATA__
                  const items: LeaderboardEntry[] = data.slice(0, limit).map((entry: any) => ({
                    rank: String(entry.rank || 0),
                    user_id: (entry.proxyWallet || entry.proxy_wallet || '').toLowerCase(),
                    user_name: entry.name || entry.pseudonym || '',
                    vol: entry.volume || entry.amount || 0,
                    pnl: entry.pnl || entry.pnlUsd || 0,
                    profile_image: entry.profileImage || entry.profile_image || '',
                  }));
                  dataDbg('leaderboard.html.ok', { count: items.length });
                  if (items.length) return items;
                }
              }
            } catch (parseErr) {
              console.error('getLeaderboard: __NEXT_DATA__ parse failed', (parseErr as any)?.message || parseErr);
            }
          }
          // Fallback: extract addresses only if __NEXT_DATA__ parsing failed
          const addrs = Array.from(new Set((html.match(/0x[a-fA-F0-9]{40}/g) || [])));
          const items: LeaderboardEntry[] = addrs.slice(0, 10).map((a, i) => ({
            rank: String(i + 1),
            user_id: a,
            user_name: '',
            vol: 0,
            pnl: 0,
            profile_image: '',
          } as any));
          if (items.length) { dataDbg('leaderboard.html.addrs', { count: items.length }); return items; }
        } else {
          dataDbg('leaderboard.html.status', { status: res2.status, statusText: res2.statusText });
        }
      } catch (e3) {
        console.error('getLeaderboard scrape fallback failed', (e3 as any)?.message || e3);
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

  /**
   * Calculate win rate for a user
   * Win rate = (Number of Markets with Net Profit) / (Total Number of Markets Traded)
   * @param user - User's Ethereum address (0x...)
   * @param limit - Max number of closed positions to fetch (default 500)
   * @returns Object with wins, total markets, and win rate percentage
   */
  async getUserWinRate(
    user: string,
    limit = 500
  ): Promise<{ wins: number; total: number; winRate: number }> {
    try {
      const closedPositions = await this.getClosedPositions(user, limit);

      if (!closedPositions || closedPositions.length === 0) {
        return { wins: 0, total: 0, winRate: 0 };
      }

      // Group positions by market and calculate net PnL per market
      const marketPnL = new Map<string, number>();

      for (const position of closedPositions) {
        const market = position.market;
        const pnl = parseFloat(position.pnl || '0');

        if (!marketPnL.has(market)) {
          marketPnL.set(market, 0);
        }
        marketPnL.set(market, (marketPnL.get(market) || 0) + pnl);
      }

      // Count markets with positive net PnL
      let wins = 0;
      for (const netPnL of marketPnL.values()) {
        if (netPnL > 0) {
          wins++;
        }
      }

      const total = marketPnL.size;
      const winRate = total > 0 ? (wins / total) * 100 : 0;

      return { wins, total, winRate };
    } catch (error) {
      console.error(`Failed to calculate win rate for ${user}:`, error);
      return { wins: 0, total: 0, winRate: 0 };
    }
  }

  /**
   * Calculate more accurate all-time PnL for a user
   * PnL = Sum of all closed position PnL + Sum of open position PnL
   * Note: The leaderboard API often shows different (lower) values than actual all-time PnL
   * @param user - User's Ethereum address (0x...)
   * @returns Object with calculated PnL, realized PnL, unrealized PnL
   */
  async getUserAccuratePnL(
    user: string
  ): Promise<{ totalPnL: number; realizedPnL: number; unrealizedPnL: number; currentValue: number }> {
    try {
      // Fetch all closed positions (realized PnL)
      const closedPositions = await this.getClosedPositions(user, 1000);

      // Calculate realized PnL from closed positions
      let realizedPnL = 0;
      if (closedPositions && closedPositions.length > 0) {
        for (const position of closedPositions) {
          realizedPnL += parseFloat(position.pnl || '0');
        }
      }

      // Fetch current portfolio value
      const userValue = await this.getUserValue(user);
      const currentValue = parseFloat(userValue.value || '0');

      // Fetch open positions to calculate unrealized PnL
      const openPositions = await this.getUserPositions({ user, limit: 500 });
      let unrealizedPnL = 0;
      if (openPositions && openPositions.length > 0) {
        for (const position of openPositions) {
          unrealizedPnL += parseFloat(position.pnl || '0');
        }
      }

      const totalPnL = realizedPnL + unrealizedPnL;

      return {
        totalPnL,
        realizedPnL,
        unrealizedPnL,
        currentValue
      };
    } catch (error) {
      console.error(`Failed to calculate accurate PnL for ${user}:`, error);
      return {
        totalPnL: 0,
        realizedPnL: 0,
        unrealizedPnL: 0,
        currentValue: 0
      };
    }
  }
}

// Export singleton instance
export const dataApi = new DataApiClient();

// Export factory function for custom configurations
export function createDataApiClient(timeout?: number): DataApiClient {
  return new DataApiClient(timeout);
}
