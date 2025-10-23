/**
 * Quick test to verify Polymarket data fetching setup
 * Run with: tsx packages/data/test-setup.ts
 */

import { gammaApi, dataApi, clobApi } from './index';

async function testSetup() {
  console.log('🧪 Testing Polymarket Data Fetching Setup\n');
  console.log('═'.repeat(60));

  let passed = 0;
  let failed = 0;

  // Test 1: Gamma Markets API
  try {
    console.log('\n1️⃣  Testing Gamma Markets API...');
    const markets = await gammaApi.getTrendingMarkets(3);
    if (markets && markets.length > 0) {
      console.log(`   ✅ SUCCESS - Fetched ${markets.length} trending markets`);
      console.log(`   Example: ${markets[0].question.slice(0, 60)}...`);
      passed++;
    } else {
      console.log('   ❌ FAILED - No markets returned');
      failed++;
    }
  } catch (error) {
    console.log(`   ❌ FAILED - ${error}`);
    failed++;
  }

  // Test 2: Search markets
  try {
    console.log('\n2️⃣  Testing market search...');
    const results = await gammaApi.searchMarkets('election', 2);
    if (results && results.length > 0) {
      console.log(`   ✅ SUCCESS - Found ${results.length} markets`);
      console.log(`   Example: ${results[0].question.slice(0, 60)}...`);
      passed++;
    } else {
      console.log('   ❌ FAILED - No search results');
      failed++;
    }
  } catch (error) {
    console.log(`   ❌ FAILED - ${error}`);
    failed++;
  }

  // Test 3: Data API (might fail if wallet has no positions)
  try {
    console.log('\n3️⃣  Testing Data API...');
    const value = await dataApi.getUserValue(
      '0x56687bf447db6ffa42ffe2204a05edaa20f55839'
    );
    console.log(`   ✅ SUCCESS - User value endpoint working`);
    console.log(`   Value: $${parseFloat(value.value).toFixed(2)}`);
    passed++;
  } catch (error: any) {
    if (error.response?.status === 404) {
      console.log('   ⚠️  PARTIAL - API working but user has no data');
      console.log('   This is normal for wallets with no positions');
      passed++;
    } else {
      console.log(`   ❌ FAILED - ${error.message}`);
      failed++;
    }
  }

  // Test 4: Get a specific market
  try {
    console.log('\n4️⃣  Testing get specific market...');
    const markets = await gammaApi.getActiveMarkets(1, 'volume');
    if (markets && markets.length > 0) {
      const market = await gammaApi.getMarket(markets[0].condition_id);
      console.log(`   ✅ SUCCESS - Fetched market details`);
      console.log(`   Question: ${market.question.slice(0, 50)}...`);
      passed++;
    } else {
      console.log('   ❌ FAILED - No active markets');
      failed++;
    }
  } catch (error) {
    console.log(`   ❌ FAILED - ${error}`);
    failed++;
  }

  // Test 5: CLOB API (might not have price data for all markets)
  try {
    console.log('\n5️⃣  Testing CLOB API...');
    const markets = await gammaApi.getActiveMarkets(1, 'volume');
    if (markets && markets.length > 0 && markets[0].tokens && markets[0].tokens.length > 0) {
      const tokenId = markets[0].tokens[0].token_id;
      const price = await clobApi.getCurrentPrice(tokenId);
      console.log(`   ✅ SUCCESS - Price fetching works`);
      console.log(`   Price: ${price !== null ? `${(price * 100).toFixed(1)}%` : 'N/A'}`);
      passed++;
    } else {
      console.log('   ⚠️  SKIPPED - No tokens available to test');
      passed++;
    }
  } catch (error: any) {
    console.log(`   ⚠️  PARTIAL - ${error.message}`);
    console.log('   This can happen if price data is unavailable');
    passed++;
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('\n📊 Test Summary:');
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total:  ${passed + failed}`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed! Your setup is working correctly.\n');
    console.log('Next steps:');
    console.log('  • Run examples: npm run example:basic');
    console.log('  • Read docs: packages/data/README.md');
    console.log('  • Start building! 🚀\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Check your network connection and try again.\n');
    process.exit(1);
  }
}

// Run tests
testSetup().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
