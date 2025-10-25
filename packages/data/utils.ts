import { gammaApi } from './clients/gamma-api';
import { dataApi } from './clients/data-api';
import { clobApi } from './clients/clob-api';
import type { GammaMarket, Position } from './types';
import Fuse from 'fuse.js';

/**
 * Utility functions for common Polymarket data operations
 */

/**
 * Get complete market data with current prices
 * Combines Gamma API market metadata with CLOB price data
 */
export async function getMarketWithPrices(conditionId: string) {
  const market = await gammaApi.getMarket(conditionId);

  if (!market.tokens?.length) {
    return market;
  }

  // Fetch current prices for all tokens
  const pricesMap = await clobApi.batchGetCurrentPrices(
    market.tokens.map((t) => t.token_id)
  );

  // Enhance tokens with current prices
  market.tokens = market.tokens.map((token) => ({
    ...token,
    price: pricesMap.get(token.token_id)?.toString() || token.price,
  }));

  return market;
}

/**
 * Get whale activity for a market
 * Returns top holders and their positions
 */
export async function getWhaleActivity(conditionId: string, minBalance = 1000) {
  const [market, holders] = await Promise.all([
    gammaApi.getMarket(conditionId),
    dataApi.getTopHolders({ market: conditionId, limit: 50, minBalance }),
  ]);

  return {
    market: {
      conditionId: market.condition_id,
      question: market.question,
      volume: market.volume,
    },
    holders,
  };
}

/**
 * Track a user's portfolio
 * Get all positions with current values
 */
export async function getUserPortfolio(address: string) {
  const [positions, value] = await Promise.all([
    dataApi.getUserPositions({ user: address }),
    dataApi.getUserValue(address),
  ]);

  return {
    address,
    totalValue: value.value,
    positionsCount: positions.length,
    positions,
  };
}

/**
 * Get trending markets with price changes
 * Shows markets with significant recent activity
 */
export async function getTrendingWithPriceChanges(limit = 10) {
  const markets = await gammaApi.getTrendingMarkets(limit);

  const marketsWithChanges = await Promise.all(
    markets.map(async (market) => {
      if (!market.tokens?.length) return market;

      const tokenId = market.tokens[0].token_id;
      const priceChange = await clobApi.getPriceChange(tokenId, '1d');

      return {
        ...market,
        priceChange: priceChange.changePercent,
      };
    })
  );

  return marketsWithChanges;
}

/**
 * Search markets using fuzzy matching on active markets
 * More accurate than Polymarket's built-in search API
 */
export async function findMarketFuzzy(query: string, limit = 5): Promise<GammaMarket[]> {
  try {
    // Fetch active markets by volume (top 100)
    const markets = await gammaApi.getActiveMarkets(100, 'volume');

    if (markets.length === 0) {
      return [];
    }

    // Configure fuzzy search
    const fuse = new Fuse(markets, {
      keys: [
        { name: 'question', weight: 0.7 },
        { name: 'slug', weight: 0.2 },
        { name: 'description', weight: 0.1 }
      ],
      threshold: 0.4, // 0 = exact match, 1 = match anything
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2
    });

    // Search
    const results = fuse.search(query, { limit });

    return results.map(r => r.item);
  } catch (error) {
    console.error('Fuzzy search failed:', error);
    return [];
  }
}

/**
 * Search for a market and get its full details
 * Helper that handles slug, condition ID, or fuzzy search
 */
export async function findMarket(query: string): Promise<GammaMarket | null> {
  try {
    // Try as condition ID
    if (query.startsWith('0x') && query.length === 66) {
      return await gammaApi.getMarket(query);
    }

    // Try as slug (exact match)
    try {
      return await gammaApi.getMarketBySlug(query.toLowerCase());
    } catch {
      // Fall through to fuzzy search
    }

    // Try fuzzy search on active markets
    const fuzzyResults = await findMarketFuzzy(query, 1);
    if (fuzzyResults.length > 0) {
      return fuzzyResults[0];
    }

    return null;
  } catch (error) {
    console.error('Failed to find market:', error);
    return null;
  }
}

/**
 * Get market snapshot with all relevant data
 * Useful for dashboard/overview displays
 */
export async function getMarketSnapshot(conditionId: string) {
  const market = await getMarketWithPrices(conditionId);

  if (!market.tokens?.length) {
    return { market, prices: [], holders: [], volume: null };
  }

  const tokenId = market.tokens[0].token_id;

  const [holders, priceChange, spread] = await Promise.all([
    dataApi.getTopHolders({ market: conditionId, limit: 10, minBalance: 100 }),
    clobApi.getPriceChange(tokenId, '1d'),
    clobApi.getSpread(tokenId),
  ]);

  return {
    market,
    priceChange,
    spread,
    holders,
    stats: {
      volume: market.volume,
      volume24hr: market.volume_24hr,
      liquidity: market.liquidity,
      active: market.active,
    },
  };
}

/**
 * Compare multiple users' portfolios
 * Useful for leaderboards
 */
export async function compareUsers(addresses: string[]) {
  const values = await dataApi.batchGetUserValues(addresses);

  const users = Array.from(values.entries())
    .map(([address, value]) => ({
      address,
      value: parseFloat(value.value),
    }))
    .sort((a, b) => b.value - a.value);

  return users;
}

/**
 * Get active positions summary for a user
 * Groups by market and calculates totals
 */
export async function getUserPositionsSummary(address: string) {
  const positions = await dataApi.getUserPositions({ user: address });

  const byMarket = positions.reduce((acc, pos) => {
    if (!acc[pos.market]) {
      acc[pos.market] = {
        market: pos.market,
        positions: [],
        totalValue: 0,
      };
    }
    acc[pos.market].positions.push(pos);
    acc[pos.market].totalValue += parseFloat(pos.value || '0');
    return acc;
  }, {} as Record<string, { market: string; positions: Position[]; totalValue: number }>);

  return Object.values(byMarket);
}

/**
 * Rate limiter helper
 * Simple delay function to avoid hitting API rate limits
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Batch process with rate limiting
 * Processes items in chunks with delays between chunks
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  chunkSize = 10,
  delayMs = 1000
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(chunk.map(processor));
    results.push(...chunkResults);

    if (i + chunkSize < items.length) {
      await delay(delayMs);
    }
  }

  return results;
}

/**
 * Format Ethereum address for display
 */
export function formatAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Parse numeric string safely
 */
export function parseNumeric(value?: string | number): number {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Format price as percentage
 */
export function formatPrice(price?: string | number): string {
  const num = parseNumeric(price);
  return `${(num * 100).toFixed(1)}%`;
}

/**
 * Format large numbers with suffix (K, M, B)
 */
export function formatVolume(value?: string | number): string {
  const num = parseNumeric(value);

  if (num >= 1_000_000_000) {
    return `$${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `$${(num / 1_000).toFixed(1)}K`;
  }
  return `$${num.toFixed(0)}`;
}

/**
 * Search for whales (top traders) using fuzzy matching
 */
export async function findWhaleFuzzy(query: string, limit = 5): Promise<any[]> {
  try {
    // Fetch leaderboard
    const leaderboard = await dataApi.getLeaderboard({ limit: 100 });

    if (leaderboard.length === 0) {
      return [];
    }

    // Configure fuzzy search
    const fuse = new Fuse(leaderboard, {
      keys: [
        { name: 'user_name', weight: 0.8 },
        { name: 'user_id', weight: 0.2 }
      ],
      threshold: 0.3,
      includeScore: true,
      ignoreLocation: true,
      minMatchCharLength: 2
    });

    // Search
    const results = fuse.search(query, { limit });

    return results.map(r => r.item);
  } catch (error) {
    console.error('Whale fuzzy search failed:', error);
    return [];
  }
}
