/**
 * Market Move Tracking & Mover Analysis
 * Tracks big price movements and identifies who's driving them
 */

import { dataApi } from './clients/data-api';
import { clobApi } from './clients/clob-api';
import { gammaApi } from './clients/gamma-api';
import { getWalletWhaleStats, computeWhaleScore } from './alpha';

export interface MarketMoveAnalysis {
  market: {
    conditionId: string;
    question: string;
    yesTokenId: string;
    noTokenId: string;
  };
  priceMove: {
    currentPrice: number;
    change1h: { percent: number; absolute: number } | null;
    change24h: { percent: number; absolute: number } | null;
    direction: 'UP' | 'DOWN' | 'FLAT';
  };
  volume: {
    recent2h: number;
    recent24h: number;
    avgDaily: number;
    spike: boolean; // true if recent volume >> average
  };
  topMovers: Array<{
    userId: string;
    displayName?: string;
    volume: number;
    side: 'BUY' | 'SELL';
    tradeCount: number;
    whaleScore: number;
    winRate: number;
    pnl: number;
    isNew: boolean;
  }>;
  smartMoney: {
    whaleVolumePercent: number; // % of volume from whale score >= 65
    direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    buyToSellRatio: number;
    topWhales: number; // count of high-score traders
  };
  signals: Array<{
    type: 'INSIDER' | 'WHALE_CONSENSUS' | 'VOLUME_SPIKE' | 'NEW_WHALE';
    message: string;
  }>;
}

/**
 * Analyze who's driving a market move
 */
export async function analyzeMarketMove(
  conditionId: string,
  options?: {
    lookbackHours?: number; // How far back to analyze trades (default: 2)
    minTradeVolume?: number; // Minimum volume to include trader (default: 1000)
    whaleThreshold?: number; // Whale score threshold (default: 65)
  }
): Promise<MarketMoveAnalysis> {
  const lookbackHours = options?.lookbackHours ?? 2;
  const minTradeVolume = options?.minTradeVolume ?? 1000;
  const whaleThreshold = options?.whaleThreshold ?? 65;

  // 1. Get market info
  const market = await gammaApi.getMarket(conditionId);
  const yesToken = market.tokens?.find((t: any) => t.outcome?.toLowerCase() === 'yes');
  const noToken = market.tokens?.find((t: any) => t.outcome?.toLowerCase() === 'no');

  if (!yesToken || !noToken) {
    throw new Error('Market tokens not found');
  }

  // 2. Get price changes
  let change1h = null;
  let change24h = null;
  let currentPrice = parseFloat(yesToken.price || '0');

  try {
    const pc1d = await clobApi.getPriceChange(yesToken.token_id, '1d');
    change1h = {
      percent: pc1d.changePercent,
      absolute: pc1d.changeAbsolute,
    };
  } catch {}

  try {
    const pc24h = await clobApi.getPriceChange(yesToken.token_id, '1d');
    change24h = {
      percent: pc24h.changePercent,
      absolute: pc24h.changeAbsolute,
    };
  } catch {}

  // Determine direction based on biggest change
  const biggestChange = change1h?.percent ?? change24h?.percent ?? 0;
  const direction = Math.abs(biggestChange) < 5 ? 'FLAT' : (biggestChange > 0 ? 'UP' : 'DOWN');

  // 3. Get recent trades
  const recentTrades = await dataApi.getTrades({
    market: conditionId,
    limit: 200, // Get more trades to ensure we capture the movers
  });

  // Filter by time window
  const cutoffTime = Date.now() - lookbackHours * 60 * 60 * 1000;
  const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;

  const tradesInWindow = recentTrades.filter((t: any) => {
    const ts = t.timestamp || t.match_time || Date.parse(t.created_at);
    return ts >= cutoffTime;
  });

  const trades24h = recentTrades.filter((t: any) => {
    const ts = t.timestamp || t.match_time || Date.parse(t.created_at);
    return ts >= cutoff24h;
  });

  // 4. Calculate volume
  const volume2h = tradesInWindow.reduce(
    (sum: number, t: any) => sum + parseFloat(t.cash_amount || t.size || '0'),
    0
  );
  const volume24h = trades24h.reduce(
    (sum: number, t: any) => sum + parseFloat(t.cash_amount || t.size || '0'),
    0
  );
  const avgDaily = volume24h; // Simple approximation
  const volumeSpike = volume2h > avgDaily * 0.5; // 2h volume > 50% of daily avg

  // 5. Group trades by user
  const tradesByUser = new Map<
    string,
    { volume: number; side: string; count: number; trades: any[] }
  >();

  for (const trade of tradesInWindow) {
    const userId = (trade.user_id || trade.maker_address || '').toLowerCase();
    if (!userId) continue;

    const existing = tradesByUser.get(userId) || {
      volume: 0,
      side: trade.side || 'BUY',
      count: 0,
      trades: [],
    };
    existing.volume += parseFloat(trade.cash_amount || trade.size || '0');
    existing.count += 1;
    existing.trades.push(trade);
    tradesByUser.set(userId, existing);
  }

  // 6. Analyze top movers with whale scores
  const moversArray = Array.from(tradesByUser.entries())
    .map(([userId, data]) => ({ userId, ...data }))
    .filter((m) => m.volume >= minTradeVolume)
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10); // Top 10 movers

  const topMovers = await Promise.all(
    moversArray.map(async (mover) => {
      let whaleScore = 0;
      let winRate = 0;
      let pnl = 0;
      let displayName = '';
      let isNew = false;

      try {
        // Get whale score
        const stats = await getWalletWhaleStats(mover.userId, {
          windowMs: 7 * 24 * 60 * 60 * 1000, // 7 days
          maxEvents: 500,
        });
        whaleScore = computeWhaleScore(stats, {});

        // Get win rate and PnL
        const [winData, pnlData, profile] = await Promise.all([
          dataApi.getUserWinRate(mover.userId).catch(() => ({ winRate: 0 })),
          dataApi.getUserAccuratePnL(mover.userId).catch(() => ({ totalPnL: 0 })),
          dataApi.getUserProfileMetrics(mover.userId).catch(() => ({})),
        ]);

        winRate = winData.winRate || 0;
        pnl = pnlData.totalPnL || 0;
        displayName = (profile as any)?.display_name || '';

        // Check if new wallet (low score + recent activity)
        isNew = whaleScore < 40 && stats.sampleCount <= 10;
      } catch {}

      return {
        userId: mover.userId,
        displayName,
        volume: mover.volume,
        side: mover.side as 'BUY' | 'SELL',
        tradeCount: mover.count,
        whaleScore: Math.round(whaleScore),
        winRate: Math.round(winRate),
        pnl: Math.round(pnl),
        isNew,
      };
    })
  );

  // 7. Calculate smart money metrics
  const totalVolume = topMovers.reduce((sum, m) => sum + m.volume, 0);
  const whaleVolume = topMovers
    .filter((m) => m.whaleScore >= whaleThreshold)
    .reduce((sum, m) => sum + m.volume, 0);
  const whaleVolumePercent = totalVolume > 0 ? (whaleVolume / totalVolume) * 100 : 0;

  const buyVolume = topMovers.filter((m) => m.side === 'BUY').reduce((sum, m) => sum + m.volume, 0);
  const sellVolume = topMovers
    .filter((m) => m.side === 'SELL')
    .reduce((sum, m) => sum + m.volume, 0);
  const buyToSellRatio = sellVolume > 0 ? buyVolume / sellVolume : buyVolume > 0 ? 999 : 1;

  const whaleBuys = topMovers
    .filter((m) => m.whaleScore >= whaleThreshold && m.side === 'BUY')
    .reduce((sum, m) => sum + m.volume, 0);
  const whaleSells = topMovers
    .filter((m) => m.whaleScore >= whaleThreshold && m.side === 'SELL')
    .reduce((sum, m) => sum + m.volume, 0);

  let smartDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (whaleBuys > whaleSells * 2) smartDirection = 'BULLISH';
  else if (whaleSells > whaleBuys * 2) smartDirection = 'BEARISH';

  const topWhales = topMovers.filter((m) => m.whaleScore >= whaleThreshold).length;

  // 8. Generate signals
  const signals: Array<{ type: any; message: string }> = [];

  // Insider signal: new wallet with large trade
  const newWhaleTrades = topMovers.filter((m) => m.isNew && m.volume > 20000);
  if (newWhaleTrades.length > 0) {
    signals.push({
      type: 'INSIDER',
      message: `⚠️ ${newWhaleTrades.length} new wallet(s) with $${Math.round(newWhaleTrades[0].volume / 1000)}k+ entry - potential insider?`,
    });
  }

  // Whale consensus
  if (whaleVolumePercent > 60 && topWhales >= 3) {
    signals.push({
      type: 'WHALE_CONSENSUS',
      message: `🐋 Strong whale consensus: ${Math.round(whaleVolumePercent)}% of volume from ${topWhales} whales - ${smartDirection}`,
    });
  }

  // Volume spike
  if (volumeSpike) {
    signals.push({
      type: 'VOLUME_SPIKE',
      message: `💰 Volume spike detected: $${Math.round(volume2h / 1000)}k in ${lookbackHours}h`,
    });
  }

  // New whale entry
  const newWhales = topMovers.filter((m) => m.isNew && m.volume > 10000);
  if (newWhales.length > 0 && !newWhaleTrades.length) {
    signals.push({
      type: 'NEW_WHALE',
      message: `🆕 ${newWhales.length} new trader(s) with significant volume`,
    });
  }

  return {
    market: {
      conditionId,
      question: market.question || 'Unknown Market',
      yesTokenId: yesToken.token_id,
      noTokenId: noToken.token_id,
    },
    priceMove: {
      currentPrice,
      change1h,
      change24h,
      direction,
    },
    volume: {
      recent2h: volume2h,
      recent24h: volume24h,
      avgDaily,
      spike: volumeSpike,
    },
    topMovers,
    smartMoney: {
      whaleVolumePercent: Math.round(whaleVolumePercent),
      direction: smartDirection,
      buyToSellRatio: Math.round(buyToSellRatio * 10) / 10,
      topWhales,
    },
    signals,
  };
}
