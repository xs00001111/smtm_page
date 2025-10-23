/**
 * Basic usage examples for Polymarket data fetching
 * Run with: tsx packages/data/examples/basic-usage.ts
 */

import {
  dataApi,
  gammaApi,
  clobApi,
  getMarketWithPrices,
  getWhaleActivity,
  getUserPortfolio,
  getTrendingWithPriceChanges,
  findMarket,
  getMarketSnapshot,
  formatAddress,
  formatPrice,
  formatVolume,
} from '../index';

// Example wallet addresses (known Polymarket whales)
const EXAMPLE_WALLET = '0x56687bf447db6ffa42ffe2204a05edaa20f55839';

async function exampleGetTrendingMarkets() {
  console.log('\n📊 Fetching Trending Markets...\n');

  const markets = await gammaApi.getTrendingMarkets(5);

  markets.forEach((market, i) => {
    console.log(`${i + 1}. ${market.question}`);
    console.log(`   Volume: ${formatVolume(market.volume)}`);
    console.log(`   24h Volume: ${formatVolume(market.volume_24hr)}`);
    console.log(`   Slug: ${market.market_slug}`);
    console.log(`   Condition ID: ${market.condition_id}\n`);
  });
}

async function exampleSearchMarket() {
  console.log('\n🔍 Searching for Market: "trump"...\n');

  const markets = await gammaApi.searchMarkets('trump', 3);

  markets.forEach((market, i) => {
    console.log(`${i + 1}. ${market.question}`);
    console.log(`   Volume: ${formatVolume(market.volume)}`);
    if (market.tokens && market.tokens.length > 0) {
      console.log(`   Outcomes:`);
      market.tokens.forEach((token) => {
        console.log(`     - ${token.outcome}: ${formatPrice(token.price)}`);
      });
    }
    console.log();
  });
}

async function exampleGetUserPositions() {
  console.log(`\n👤 Fetching Positions for ${formatAddress(EXAMPLE_WALLET)}...\n`);

  try {
    const positions = await dataApi.getUserPositions({ user: EXAMPLE_WALLET, limit: 5 });

    if (positions.length === 0) {
      console.log('No positions found for this wallet.\n');
      return;
    }

    positions.forEach((position, i) => {
      console.log(`${i + 1}. Market: ${position.market}`);
      console.log(`   Outcome: ${position.outcome}`);
      console.log(`   Size: ${position.size}`);
      console.log(`   Value: $${parseFloat(position.value || '0').toFixed(2)}`);
      console.log();
    });
  } catch (error) {
    console.log('Failed to fetch positions. This wallet may have no active positions.\n');
  }
}

async function exampleGetUserValue() {
  console.log(`\n💰 Fetching Total Value for ${formatAddress(EXAMPLE_WALLET)}...\n`);

  try {
    const value = await dataApi.getUserValue(EXAMPLE_WALLET);
    console.log(`Total Portfolio Value: $${parseFloat(value.value).toFixed(2)}\n`);
  } catch (error) {
    console.log('Failed to fetch user value.\n');
  }
}

async function exampleGetMarketDetails() {
  console.log('\n📈 Fetching Market Details...\n');

  // Find a market by search
  const market = await findMarket('presidential election');

  if (!market) {
    console.log('Market not found.\n');
    return;
  }

  console.log(`Question: ${market.question}`);
  console.log(`Condition ID: ${market.condition_id}`);
  console.log(`Volume: ${formatVolume(market.volume)}`);
  console.log(`Liquidity: ${formatVolume(market.liquidity)}`);
  console.log(`Active: ${market.active}`);
  console.log(`End Date: ${market.end_date_iso}`);

  if (market.tokens && market.tokens.length > 0) {
    console.log('\nOutcomes:');
    market.tokens.forEach((token) => {
      console.log(`  ${token.outcome}: ${formatPrice(token.price)} (ID: ${token.token_id})`);
    });
  }
  console.log();
}

async function exampleGetTopHolders() {
  console.log('\n🐋 Fetching Top Holders (Whales)...\n');

  // First find a market
  const market = await findMarket('presidential');

  if (!market) {
    console.log('Market not found.\n');
    return;
  }

  console.log(`Market: ${market.question}\n`);

  try {
    const holders = await dataApi.getTopHolders({
      market: market.condition_id,
      limit: 10,
      minBalance: 100,
    });

    if (holders.length === 0) {
      console.log('No holders found.\n');
      return;
    }

    holders.forEach((tokenHolders) => {
      console.log(`Token: ${tokenHolders.token}`);
      tokenHolders.holders.slice(0, 5).forEach((holder, i) => {
        console.log(`  ${i + 1}. ${formatAddress(holder.address, 6)}`);
        console.log(`     Balance: ${parseFloat(holder.balance).toFixed(2)}`);
      });
      console.log();
    });
  } catch (error) {
    console.log('Failed to fetch holders.\n');
  }
}

async function exampleGetPriceHistory() {
  console.log('\n📉 Fetching Price History...\n');

  const market = await findMarket('presidential');

  if (!market || !market.tokens || market.tokens.length === 0) {
    console.log('Market or tokens not found.\n');
    return;
  }

  const tokenId = market.tokens[0].token_id;

  try {
    const priceChange = await clobApi.getPriceChange(tokenId, '1d');

    console.log(`Outcome: ${market.tokens[0].outcome}`);
    console.log(`Current Price: ${formatPrice(priceChange.current)}`);
    console.log(`Previous Price (24h ago): ${formatPrice(priceChange.previous)}`);
    console.log(`Change: ${priceChange.changePercent?.toFixed(2)}%\n`);
  } catch (error) {
    console.log('Failed to fetch price history.\n');
  }
}

async function exampleGetMarketSnapshot() {
  console.log('\n📸 Fetching Complete Market Snapshot...\n');

  const market = await findMarket('presidential');

  if (!market) {
    console.log('Market not found.\n');
    return;
  }

  try {
    const snapshot = await getMarketSnapshot(market.condition_id);

    console.log(`Question: ${snapshot.market.question}`);
    console.log(`Volume: ${formatVolume(snapshot.stats.volume)}`);
    console.log(`24h Volume: ${formatVolume(snapshot.stats.volume24hr)}`);
    console.log(`Liquidity: ${formatVolume(snapshot.stats.liquidity)}`);

    if (snapshot.priceChange.changePercent !== null) {
      console.log(`\nPrice Change (24h): ${snapshot.priceChange.changePercent.toFixed(2)}%`);
    }

    if (snapshot.spread.bid && snapshot.spread.ask) {
      console.log(`\nSpread:`);
      console.log(`  Bid: ${formatPrice(snapshot.spread.bid)}`);
      console.log(`  Ask: ${formatPrice(snapshot.spread.ask)}`);
      console.log(`  Spread: ${(snapshot.spread.spread! * 100).toFixed(2)}%`);
    }

    console.log();
  } catch (error) {
    console.log('Failed to fetch market snapshot.\n');
  }
}

async function exampleGetTrendingWithChanges() {
  console.log('\n🔥 Trending Markets with Price Changes...\n');

  const trending = await getTrendingWithPriceChanges(3);

  trending.forEach((market, i) => {
    console.log(`${i + 1}. ${market.question}`);
    console.log(`   Volume: ${formatVolume(market.volume_24hr)}`);
    if ((market as any).priceChange !== undefined) {
      const change = (market as any).priceChange;
      const arrow = change > 0 ? '📈' : change < 0 ? '📉' : '➡️';
      console.log(`   24h Change: ${arrow} ${change?.toFixed(2)}%`);
    }
    console.log();
  });
}

// Main execution
async function main() {
  console.log('🚀 Polymarket Data Fetching Examples\n');
  console.log('═'.repeat(50));

  try {
    await exampleGetTrendingMarkets();
    await exampleSearchMarket();
    await exampleGetMarketDetails();
    await exampleGetPriceHistory();
    await exampleGetUserPositions();
    await exampleGetUserValue();
    await exampleGetTopHolders();
    await exampleGetMarketSnapshot();
    await exampleGetTrendingWithChanges();

    console.log('═'.repeat(50));
    console.log('\n✅ All examples completed!\n');
  } catch (error) {
    console.error('❌ Error running examples:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
