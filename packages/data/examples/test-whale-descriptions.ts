/**
 * Manual test script for whale descriptions
 * Run with: tsx packages/data/examples/test-whale-descriptions.ts
 */

import {
  generateWhaleDescription,
  generateAlphaWhaleDescription,
  classifyWhaleArchetype,
  buildDescriptionInput,
  getDescriptionCacheStats,
  clearDescriptionCache,
  type WhaleDescriptionInput,
} from '../whale-descriptions'

// Test data for different personality archetypes
const testCases: Array<{ name: string; input: WhaleDescriptionInput }> = [
  {
    name: 'Elite Whale (Politics Specialist)',
    input: buildDescriptionInput({
      whaleScore: 92,
      pnl: 150000,
      winRate: 78,
      avgBetSize: 18000,
      tradesPerHour: 1.2,
      portfolioValue: 250000,
      accountAgeDays: 120,
      totalTrades: 85,
      recentTrades12h: 3,
      tags: ['Politics', 'Elections'],
      isNewWallet: false,
    }),
  },
  {
    name: 'New Hotshot (Aggressive Start)',
    input: buildDescriptionInput({
      whaleScore: 82,
      pnl: 25000,
      winRate: 65,
      avgBetSize: 12000,
      tradesPerHour: 2.5,
      portfolioValue: 45000,
      accountAgeDays: 8,
      totalTrades: 12,
      recentTrades12h: 8,
      tags: ['Crypto'],
      isNewWallet: true,
    }),
  },
  {
    name: 'High Roller (Huge Bets)',
    input: buildDescriptionInput({
      whaleScore: 75,
      pnl: 80000,
      winRate: 58,
      avgBetSize: 35000,
      tradesPerHour: 0.8,
      portfolioValue: 180000,
      accountAgeDays: 90,
      totalTrades: 45,
      tags: ['Politics'],
      isNewWallet: false,
    }),
  },
  {
    name: 'Sharpshooter (Selective, High Win Rate)',
    input: buildDescriptionInput({
      whaleScore: 88,
      pnl: 65000,
      winRate: 82,
      avgBetSize: 8000,
      tradesPerHour: 0.3,
      portfolioValue: 95000,
      accountAgeDays: 200,
      totalTrades: 150,
      tags: ['Sports'],
      isNewWallet: false,
    }),
  },
  {
    name: 'Sports Specialist',
    input: buildDescriptionInput({
      whaleScore: 74,
      pnl: 42000,
      winRate: 68,
      avgBetSize: 6500,
      tradesPerHour: 1.5,
      portfolioValue: 72000,
      accountAgeDays: 150,
      totalTrades: 180,
      tags: ['Sports'],
      isNewWallet: false,
    }),
  },
  {
    name: 'Momentum Trader (High Frequency)',
    input: buildDescriptionInput({
      whaleScore: 68,
      pnl: 28000,
      winRate: 61,
      avgBetSize: 4500,
      tradesPerHour: 4.2,
      portfolioValue: 55000,
      accountAgeDays: 60,
      totalTrades: 320,
      tags: ['Crypto', 'Politics', 'Sports'],
      isNewWallet: false,
    }),
  },
  {
    name: 'Degen (High Volume, Low Win Rate)',
    input: buildDescriptionInput({
      whaleScore: 48,
      pnl: -8000,
      winRate: 48,
      avgBetSize: 3200,
      tradesPerHour: 5.5,
      portfolioValue: 22000,
      accountAgeDays: 45,
      totalTrades: 450,
      tags: ['Crypto', 'Memes'],
      isNewWallet: false,
    }),
  },
  {
    name: 'Cautious Player (Low Frequency)',
    input: buildDescriptionInput({
      whaleScore: 62,
      pnl: 12000,
      winRate: 64,
      avgBetSize: 5500,
      tradesPerHour: 0.2,
      portfolioValue: 38000,
      accountAgeDays: 180,
      totalTrades: 55,
      tags: ['Politics'],
      isNewWallet: false,
    }),
  },
  {
    name: 'Emerging Trader (Positive Trajectory)',
    input: buildDescriptionInput({
      whaleScore: 67,
      pnl: 18000,
      winRate: 59,
      avgBetSize: 7200,
      tradesPerHour: 1.1,
      portfolioValue: 42000,
      accountAgeDays: 75,
      totalTrades: 68,
      tags: ['Politics', 'Crypto'],
      isNewWallet: false,
    }),
  },
  {
    name: 'Struggling Trader (Negative PnL)',
    input: buildDescriptionInput({
      whaleScore: 35,
      pnl: -22000,
      winRate: 42,
      avgBetSize: 4800,
      tradesPerHour: 1.8,
      portfolioValue: 12000,
      accountAgeDays: 90,
      totalTrades: 95,
      tags: ['Sports'],
      isNewWallet: false,
    }),
  },
  {
    name: 'New Hotshot with Current Trade (Alpha Context)',
    input: buildDescriptionInput({
      whaleScore: 78,
      pnl: 32000,
      winRate: 69,
      avgBetSize: 18000,
      tradesPerHour: 3.1,
      portfolioValue: 58000,
      accountAgeDays: 10,
      totalTrades: 15,
      recentTrades12h: 12,
      tags: ['Politics'],
      isNewWallet: true,
      currentTrade: {
        notionalUsd: 25000,
        side: 'BUY',
        marketCategory: 'Politics',
      },
    }),
  },
  {
    name: 'Default Profile (Mixed Stats)',
    input: buildDescriptionInput({
      whaleScore: 55,
      pnl: 5000,
      winRate: 52,
      avgBetSize: 3500,
      tradesPerHour: 0.9,
      portfolioValue: 28000,
      accountAgeDays: 50,
      totalTrades: 42,
      tags: [],
      isNewWallet: false,
    }),
  },
]

console.log('🧪 Testing Whale Description Generator\n')
console.log('='.repeat(80))

testCases.forEach((testCase, index) => {
  console.log(`\n${index + 1}. ${testCase.name}`)
  console.log('-'.repeat(80))

  // Classify archetype
  const classification = classifyWhaleArchetype(testCase.input)
  console.log(`   Archetype: ${classification.archetype} (confidence: ${(classification.confidence * 100).toFixed(0)}%)`)
  console.log(`   Traits: ${classification.traits.join(', ')}`)

  // Generate leaderboard description
  const leaderboardDesc = generateWhaleDescription(testCase.input, {
    context: 'leaderboard',
    maxLength: 120,
  })
  console.log(`\n   📋 Leaderboard: ${leaderboardDesc}`)

  // Generate alpha description if has current trade
  if (testCase.input.currentTrade) {
    const alphaDesc = generateAlphaWhaleDescription(testCase.input, {
      maxLength: 140,
    })
    console.log(`   ✨ Alpha:       ${alphaDesc}`)
  }

  console.log(`   Length: ${leaderboardDesc.length} chars`)
})

console.log('\n' + '='.repeat(80))
console.log('✅ All test cases completed!\n')

// Test edge cases
console.log('🧪 Testing Edge Cases\n')
console.log('='.repeat(80))

const edgeCases = [
  {
    name: 'Minimal Data (New User)',
    input: buildDescriptionInput({
      whaleScore: 0,
      pnl: 0,
      winRate: 0,
      avgBetSize: 0,
      tradesPerHour: 0,
      portfolioValue: 0,
      accountAgeDays: 1,
      totalTrades: 0,
      isNewWallet: true,
    }),
  },
  {
    name: 'Very Long Category Names',
    input: buildDescriptionInput({
      whaleScore: 85,
      pnl: 100000,
      winRate: 72,
      avgBetSize: 15000,
      tradesPerHour: 1.5,
      portfolioValue: 150000,
      totalTrades: 100,
      tags: ['Very Long Category Name That Should Be Truncated', 'Another Long Name'],
      isNewWallet: false,
    }),
  },
  {
    name: 'Extreme Values',
    input: buildDescriptionInput({
      whaleScore: 100,
      pnl: 5000000,
      winRate: 100,
      avgBetSize: 500000,
      tradesPerHour: 50,
      portfolioValue: 10000000,
      totalTrades: 10000,
      isNewWallet: false,
    }),
  },
]

edgeCases.forEach((testCase, index) => {
  console.log(`\n${index + 1}. ${testCase.name}`)
  console.log('-'.repeat(80))
  const desc = generateWhaleDescription(testCase.input)
  console.log(`   ${desc}`)
  console.log(`   Length: ${desc.length} chars`)
})

console.log('\n' + '='.repeat(80))
console.log('✅ Edge cases completed!\n')

// Test caching performance
console.log('🧪 Testing Cache Performance\n')
console.log('='.repeat(80))

clearDescriptionCache()
console.log('\n✓ Cache cleared')

const sampleInput = buildDescriptionInput({
  whaleScore: 85,
  pnl: 100000,
  winRate: 72,
  avgBetSize: 15000,
  tradesPerHour: 1.2,
  portfolioValue: 150000,
  totalTrades: 80,
  tags: ['Politics'],
  isNewWallet: false,
})

// First call (cache miss)
const start1 = Date.now()
const desc1 = generateWhaleDescription(sampleInput)
const time1 = Date.now() - start1

// Second call (cache hit)
const start2 = Date.now()
const desc2 = generateWhaleDescription(sampleInput)
const time2 = Date.now() - start2

console.log(`\n1st call (cache miss): ${time1}ms`)
console.log(`   ${desc1}`)
console.log(`\n2nd call (cache hit):  ${time2}ms`)
console.log(`   ${desc2}`)
console.log(`\n⚡ Speedup: ${(time1 / Math.max(time2, 0.001)).toFixed(1)}x faster`)

const stats = getDescriptionCacheStats()
console.log(`\n📊 Cache Stats: ${stats.size}/${stats.maxSize} entries`)

console.log('\n' + '='.repeat(80))
console.log('✅ Cache performance test completed!\n')
