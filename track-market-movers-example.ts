/**
 * Example: Track who's moving the UFO declassification market
 * Shows how to find price drivers and track delta
 */

import { dataApi } from '@smtm/data/clients/data-api';
import { clobApi } from '@smtm/data/clients/clob-api';
import { gammaApi } from '@smtm/data/clients/gamma-api';
import { computeWhaleScore, getWalletWhaleStats } from '@smtm/data';

async function trackMarketMovers(conditionId: string) {
  console.log('🔍 Analyzing market movers...\n');

  // 1. Get market info
  const market = await gammaApi.getMarket(conditionId);
  const yesToken = market.tokens?.find((t: any) => t.outcome === 'YES');
  const noToken = market.tokens?.find((t: any) => t.outcome === 'NO');

  if (!yesToken || !noToken) {
    console.log('❌ Market tokens not found');
    return;
  }

  // 2. Get price change (Beta)
  const yesChange = await clobApi.getPriceChange(yesToken.token_id, '24h');
  console.log(`📊 YES Price Change (24h): ${yesChange.changePercent.toFixed(2)}%`);
  console.log(`   Current Price: ${yesToken.price}\n`);

  // 3. Get recent large trades (Delta - who's driving it)
  const recentTrades = await dataApi.getTrades({
    market: conditionId,
    limit: 100,
  });

  // Group by user and calculate impact
  const tradesByUser = new Map<string, { volume: number; side: string; count: number }>();
  for (const trade of recentTrades) {
    const userId = trade.user_id || trade.maker_address;
    if (!userId) continue;

    const existing = tradesByUser.get(userId) || { volume: 0, side: trade.side, count: 0 };
    existing.volume += parseFloat(trade.cash_amount || trade.size || '0');
    existing.count += 1;
    tradesByUser.set(userId, existing);
  }

  // Sort by volume and get top traders
  const topTraders = Array.from(tradesByUser.entries())
    .map(([userId, data]) => ({ userId, ...data }))
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 10);

  console.log('🐋 Top 10 Traders (by volume in last 100 trades):\n');

  for (let i = 0; i < topTraders.length; i++) {
    const trader = topTraders[i];
    const short = `${trader.userId.slice(0, 6)}...${trader.userId.slice(-4)}`;

    // Get whale score for this trader
    let whaleScore = 0;
    try {
      const stats = await getWalletWhaleStats(trader.userId, {
        windowMs: 7 * 24 * 60 * 60 * 1000,  // 7 days
        maxEvents: 500
      });
      whaleScore = computeWhaleScore(stats, {});
    } catch {}

    console.log(
      `${i + 1}. ${short} - $${Math.round(trader.volume).toLocaleString()} ` +
      `(${trader.count} trades, ${trader.side}) - Whale Score: ${Math.round(whaleScore)}`
    );
  }

  // 4. Get current holders to see who has big positions NOW
  console.log('\n💼 Current Top Holders:\n');

  const holders = await dataApi.getTopHolders({
    market: conditionId,
    limit: 20,
    minBalance: 100,
  });

  const yesHolders = holders.find((h: any) => h.token === yesToken.token_id)?.holders || [];
  const topYesHolders = yesHolders.slice(0, 5);

  console.log('YES side top holders:');
  for (let i = 0; i < topYesHolders.length; i++) {
    const holder = topYesHolders[i];
    const short = `${holder.address.slice(0, 6)}...${holder.address.slice(-4)}`;
    const value = holder.value || (holder.balance * parseFloat(yesToken.price));
    console.log(`${i + 1}. ${short} - $${Math.round(value).toLocaleString()}`);
  }

  return {
    priceChange: yesChange,
    topTraders,
    topHolders: topYesHolders,
  };
}

// Example usage for UFO market
const UFO_MARKET_CONDITION_ID = '0x...'; // Replace with actual condition ID

trackMarketMovers(UFO_MARKET_CONDITION_ID).catch(console.error);
