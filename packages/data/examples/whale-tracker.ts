/**
 * Whale Tracker Example
 * Track known whale wallets and their activities
 * Run with: tsx packages/data/examples/whale-tracker.ts
 */

import {
  dataApi,
  getUserPortfolio,
  compareUsers,
  formatAddress,
  formatVolume,
  batchProcess,
} from '../index';

// Known whale addresses (examples - replace with real tracked wallets)
const WHALE_ADDRESSES = [
  '0x56687bf447db6ffa42ffe2204a05edaa20f55839',
  '0x2e5f64b0dd04c1e8b8b0fe5b36d66bf9b65d9c7f',
  '0x8d07d225a769b7af3a923481e1fdf49180e6a265',
];

async function trackWhaleLeaderboard() {
  console.log('\n🐋 Whale Leaderboard by Portfolio Value\n');
  console.log('═'.repeat(60));

  const rankings = await compareUsers(WHALE_ADDRESSES);

  rankings.forEach((user, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    console.log(`${medal} ${formatAddress(user.address, 6)}`);
    console.log(`   Value: ${formatVolume(user.value)}\n`);
  });
}

async function trackWhalePositions(address: string) {
  console.log(`\n📊 Positions for ${formatAddress(address, 6)}\n`);

  const portfolio = await getUserPortfolio(address);

  console.log(`Total Value: ${formatVolume(portfolio.totalValue)}`);
  console.log(`Active Positions: ${portfolio.positionsCount}\n`);

  if (portfolio.positions.length === 0) {
    console.log('No active positions.\n');
    return;
  }

  // Show top 5 positions by value
  const topPositions = portfolio.positions
    .sort((a, b) => parseFloat(b.value || '0') - parseFloat(a.value || '0'))
    .slice(0, 5);

  console.log('Top 5 Positions:');
  topPositions.forEach((pos, i) => {
    console.log(`\n${i + 1}. ${pos.outcome}`);
    console.log(`   Market: ${pos.market.slice(0, 10)}...`);
    console.log(`   Size: ${parseFloat(pos.size).toFixed(2)}`);
    console.log(`   Value: ${formatVolume(pos.value)}`);
  });

  console.log();
}

async function batchTrackWhales() {
  console.log('\n🔍 Batch Tracking All Whales\n');
  console.log('═'.repeat(60));

  // Fetch all whale portfolios with rate limiting
  const portfolios = await batchProcess(
    WHALE_ADDRESSES,
    async (address) => {
      try {
        return await getUserPortfolio(address);
      } catch (error) {
        console.error(`Failed to fetch portfolio for ${formatAddress(address)}:`, error);
        return null;
      }
    },
    5, // Process 5 at a time
    500 // 500ms delay between batches
  );

  const validPortfolios = portfolios.filter((p) => p !== null);

  console.log(`\nSuccessfully tracked ${validPortfolios.length}/${WHALE_ADDRESSES.length} wallets\n`);

  validPortfolios.forEach((portfolio) => {
    if (!portfolio) return;
    console.log(`${formatAddress(portfolio.address, 6)}`);
    console.log(`  Value: ${formatVolume(portfolio.totalValue)}`);
    console.log(`  Positions: ${portfolio.positionsCount}\n`);
  });
}

async function findWhalesInMarket(conditionId: string) {
  console.log(`\n🎯 Finding Whales in Market: ${conditionId.slice(0, 10)}...\n`);

  const holders = await dataApi.getTopHolders({
    market: conditionId,
    limit: 20,
    minBalance: 1000,
  });

  if (holders.length === 0) {
    console.log('No significant holders found.\n');
    return;
  }

  holders.forEach((tokenHolders) => {
    console.log(`\nToken: ${tokenHolders.token.slice(0, 10)}...`);
    console.log('Top Holders:');

    tokenHolders.holders.slice(0, 10).forEach((holder, i) => {
      console.log(`  ${i + 1}. ${formatAddress(holder.address, 6)} - Balance: ${parseFloat(holder.balance).toFixed(0)}`);
    });
  });

  console.log();
}

async function main() {
  console.log('🐋 Polymarket Whale Tracker\n');
  console.log('═'.repeat(60));

  try {
    // Track leaderboard
    await trackWhaleLeaderboard();

    // Track individual whale
    if (WHALE_ADDRESSES.length > 0) {
      await trackWhalePositions(WHALE_ADDRESSES[0]);
    }

    // Batch track all whales
    await batchTrackWhales();

    console.log('═'.repeat(60));
    console.log('\n✅ Whale tracking complete!\n');
  } catch (error) {
    console.error('❌ Error tracking whales:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { trackWhaleLeaderboard, trackWhalePositions, batchTrackWhales, findWhalesInMarket };
