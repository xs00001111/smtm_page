import axios, { AxiosInstance } from 'axios';
// Hardcoded debug: enable verbose Data API logging during investigation
const DATA_DEBUG = true;
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
   * Get trades (public, no auth) from Data API
   * Mirrors https://data-api.polymarket.com/trades
   * Common filters: limit, offset, takerOnly, market, eventId, user, side
   */
  async getTrades(params?: {
    limit?: number;
    offset?: number;
    takerOnly?: boolean;
    filterType?: 'CASH' | 'TOKENS';
    filterAmount?: number;
    market?: string[];       // condition IDs
    eventId?: number[];      // event IDs
    user?: string;           // 0x address
    side?: 'BUY' | 'SELL';
  }): Promise<any[]> {
    const q: Record<string, any> = {};
    if (params) {
      if (params.limit != null) q.limit = params.limit;
      if (params.offset != null) q.offset = params.offset;
      if (params.takerOnly != null) q.takerOnly = params.takerOnly;
      if (params.filterType) q.filterType = params.filterType;
      if (params.filterAmount != null) q.filterAmount = params.filterAmount;
      if (params.market?.length) q.market = params.market.join(',');
      if (params.eventId?.length) q.eventId = params.eventId.join(',');
      if (params.user) q.user = params.user;
      if (params.side) q.side = params.side;
    }
    try {
      const { data } = await this.client.get<any>('/trades', { params: q });
      // Normalize common response shapes: [], { trades: [] }, { data: [] }, { results: [] }
      const list = Array.isArray(data)
        ? data
        : (data?.trades || data?.data || data?.results || data?.items || []);
      const count = Array.isArray(list) ? list.length : 0;
      const reqMarket = typeof q.market === 'string' ? q.market : undefined;
      const firstCond = (Array.isArray(list) && list[0]) ? (list[0].conditionId || list[0].market) : undefined;
      const marketUrl = reqMarket ? `https://polymarket.com/market/${reqMarket.split(',')[0]}` : undefined;
      const clobMarketApiUrl = reqMarket ? `https://clob.polymarket.com/markets/${reqMarket.split(',')[0]}` : undefined;
      this.dbg('trades.api', { count, params: q, requestedMarket: reqMarket, marketUrl, clobMarketApiUrl, firstCond });
      if (count > 0) {
        const t = list[0] || {};
        this.dbg('trades.sample', {
          asset: t.asset || t.asset_id,
          conditionId: t.conditionId || t.market,
          price: t.price,
          size: t.size,
          timestamp: t.timestamp || t.match_time || t.last_update,
        });
      }
      return Array.isArray(list) ? list : [];
    } catch (e: any) {
      const status = e?.response?.status;
      const text = e?.response?.data ? JSON.stringify(e.response.data).slice(0, 200) : String(e?.message || e);
      this.dbg('trades.error', { status, text, params: q });
      return [];
    }
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

      // Group positions by market/condition id and calculate net PnL per market
      const marketPnL = new Map<string, number>();

      for (let i=0; i<closedPositions.length; i++) {
        const position: any = closedPositions[i] as any;
        const key = String(
          position.market ||
          position.condition_id ||
          position.conditionId ||
          position.market_id ||
          position.marketId ||
          ''
        ).trim();
        const marketKey = key || String(position.id || i);
        const pnl = parseFloat(String((position.pnl ?? position.realizedPnl ?? position.cashPnl ?? '0')));
        const prev = marketPnL.get(marketKey) || 0;
        marketPnL.set(marketKey, prev + (Number.isFinite(pnl) ? pnl : 0));
      }

      // Optionally incorporate open positions that are effectively worthless due to resolved outcomes not yet reflected (Polymarket bug)
      try {
        const openPositions = await this.getUserPositions({ user, limit: Math.min(1000, Math.max(500, limit)) });
        // Aggregate current value per market for open positions not already in marketPnL
        const openByMarket = new Map<string, number>();
        for (let i=0; i<openPositions.length; i++) {
          const p: any = openPositions[i] as any;
          const keyRaw = String(p.market || p.condition_id || p.conditionId || p.market_id || p.marketId || '').trim();
          const marketKey = keyRaw || String(p.id || `open_${i}`);
          if (marketPnL.has(marketKey)) continue; // skip markets that are already closed and accounted for
          const v = parseFloat(String(p.value ?? '0'));
          const prev = openByMarket.get(marketKey) || 0;
          openByMarket.set(marketKey, prev + (Number.isFinite(v) ? v : 0));
        }
        // Heuristic: if total current value across open positions in a market < $5, treat as provisional loss for win rate
        // This prevents 100% win rate when many now-worthless positions remain "open" due to API bugs
        for (const [mkt, cur] of openByMarket.entries()) {
          if (!marketPnL.has(mkt)) {
            if (Number.isFinite(cur) && cur < 5) {
              marketPnL.set(mkt, -1); // mark as a small negative to count as a loss
            }
          }
        }
        this.dbg('winrate.open_heuristic', { user, addedLosses: Array.from(openByMarket.entries()).filter(([,v])=>v<5).length })
      } catch (e) {
        this.dbg('winrate.open_heuristic.error', { user, err: (e as any)?.message })
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
          // Skip redeemable/settled positions that often show currentValue=0 while realized is handled in closed-positions
          const redeemable = (position as any).redeemable === true
          const endDate = (position as any).endDate || (position as any).end_date
          if (redeemable) {
            continue
          }
          if (endDate) {
            const endTs = Date.parse(String(endDate))
            if (Number.isFinite(endTs) && Date.now() - endTs > 12 * 60 * 60 * 1000) {
              // Older than 12h after end; treat as settled to avoid double counting negative open PnL
              continue
            }
          }
          // Prefer (currentValue - initialValue) when available; fallback to snake_case; then provided pnl
          const v = parseFloat(String((position as any).currentValue ?? (position as any).value ?? '0'));
          const iv = parseFloat(String((position as any).initialValue ?? (position as any).initial_value ?? '0'));
          const computed = (Number.isFinite(v) && Number.isFinite(iv)) ? (v - iv) : NaN;
          const fromField = parseFloat(String((position as any).pnl ?? (position as any).cashPnl ?? 'NaN'));
          const delta = Number.isFinite(computed)
            ? computed
            : (Number.isFinite(fromField) ? fromField : 0);
          unrealizedPnL += delta;
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

  /**
   * Best-effort: scrape Polymarket profile to extract hero PnL (ALL) for parity with UI.
   * This helps when open-position PnL isn't exposed via Data API fields.
   */
  async getUserPnLFromProfile(userOrHandle: string): Promise<number | null> {
    try {
      const isAddr = /^0x[a-fA-F0-9]{40}$/.test(userOrHandle);
      const url = isAddr
        ? `https://polymarket.com/profile/${userOrHandle}`
        : `https://polymarket.com/profile/%40${encodeURIComponent(userOrHandle)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; smtm-bot/1.0; +https://smtm.ai)',
          'Accept': 'text/html,application/xhtml+xml',
          'Referer': 'https://polymarket.com/',
        } as any,
      } as any);
      if (!res.ok) return null;
      const html = await res.text();
      const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
      if (!match || !match[1]) return null;
      const data = JSON.parse(match[1]);
      // Try common locations for PnL metrics inside dehydrated queries
      const queries = data?.props?.pageProps?.dehydratedState?.queries || [];
      let pnl: number | null = null;
      for (const q of queries) {
        const st = q?.state?.data;
        if (!st) continue;
        // Heuristics: look for keys that look like pnl totals
        if (typeof st === 'object') {
          if (typeof st.pnlAll === 'number') pnl = st.pnlAll;
          if (typeof st.totalPnL === 'number') pnl = st.totalPnL;
          if (typeof st.pnl === 'number' && !Array.isArray(st)) pnl = st.pnl;
          if (pnl != null) break;
        }
      }
      return (pnl != null && Number.isFinite(pnl)) ? pnl : null;
    } catch {
      return null;
    }
  }

  /**
   * Best-effort: scrape profile metrics like predictions count and positions value.
   */
  async getUserProfileMetrics(userOrHandle: string): Promise<{
    predictions?: number;
    positionsValueUsd?: number;
    biggestWinUsd?: number;
  }> {
    const out: any = {};
    try {
      const isAddr = /^0x[a-fA-F0-9]{40}$/.test(userOrHandle);
      const url = isAddr
        ? `https://polymarket.com/profile/${userOrHandle}`
        : `https://polymarket.com/profile/%40${encodeURIComponent(userOrHandle)}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; smtm-bot/1.0; +https://smtm.ai)',
          'Accept': 'text/html,application/xhtml+xml',
          'Referer': 'https://polymarket.com/',
        } as any,
      } as any);
      if (!res.ok) return out;
      const html = await res.text();
      const match = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
      if (!match || !match[1]) return out;
      const data = JSON.parse(match[1]);
      const queries = data?.props?.pageProps?.dehydratedState?.queries || [];
      for (const q of queries) {
        const st = q?.state?.data;
        if (!st || typeof st !== 'object') continue;
        // Heuristics: look for metrics on common keys
        if (st.predictions != null && out.predictions == null) {
          const v = Number(st.predictions);
          if (Number.isFinite(v)) out.predictions = v;
        }
        if (st.positionsValueUsd != null && out.positionsValueUsd == null) {
          const v = Number(st.positionsValueUsd);
          if (Number.isFinite(v)) out.positionsValueUsd = v;
        }
        if (st.positions_value != null && out.positionsValueUsd == null) {
          const v = Number(st.positions_value);
          if (Number.isFinite(v)) out.positionsValueUsd = v;
        }
        if (st.biggestWinUsd != null && out.biggestWinUsd == null) {
          const v = Number(st.biggestWinUsd);
          if (Number.isFinite(v)) out.biggestWinUsd = v;
        }
      }
    } catch {}
    return out;
  }
}

// Export singleton instance
export const dataApi = new DataApiClient();

// Export factory function for custom configurations
export function createDataApiClient(timeout?: number): DataApiClient {
  return new DataApiClient(timeout);
}
