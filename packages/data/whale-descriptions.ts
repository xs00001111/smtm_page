/**
 * Template-based whale description generator
 * Provides personality-driven summaries of traders for /whale and /alpha commands
 */

export interface WhaleDescriptionInput {
  // Core metrics
  whaleScore: number // 0-100
  pnl: number // Total PnL in USD
  winRate: number // 0-100
  avgBetSize: number // Average bet size in USD
  tradesPerHour: number // Trading frequency
  portfolioValue: number // Current portfolio value in USD

  // Account info
  accountAgeDays: number | null // Age in days, null if unknown
  totalTrades: number // Total number of trades
  recentTrades12h?: number // Trades in last 12 hours

  // Market context
  tags?: string[] // Market categories (e.g., ['Politics', 'Crypto'])
  isNewWallet: boolean // New wallet badge (≤14 days, ≤5 positions)

  // Trade context (for /alpha command)
  currentTrade?: {
    notionalUsd: number
    side: 'BUY' | 'SELL'
    marketCategory?: string
  }
}

export interface WhaleDescriptionOptions {
  maxLength?: number // Max chars, default 120
  includeEmoji?: boolean // Include emoji accents, default true
  context?: 'leaderboard' | 'alpha' // Display context
}

export type PersonalityArchetype =
  | 'elite-whale'
  | 'new-hotshot'
  | 'high-roller'
  | 'sharpshooter'
  | 'specialist'
  | 'momentum-trader'
  | 'degen'
  | 'cautious-player'
  | 'emerging-trader'
  | 'struggling-trader'
  | 'insider-pattern'
  | 'default'

export interface ArchetypeClassification {
  archetype: PersonalityArchetype
  confidence: number // 0-1, how well they fit this archetype
  traits: string[] // Key traits that led to classification
}

/**
 * Classify a whale into a personality archetype based on their stats
 */
export function classifyWhaleArchetype(input: WhaleDescriptionInput): ArchetypeClassification {
  const { whaleScore, winRate, avgBetSize, tradesPerHour, isNewWallet, pnl, totalTrades, tags } = input

  // Elite Whale: High score + high win rate + proven track record
  if (whaleScore >= 85 && winRate >= 70 && totalTrades >= 50) {
    return {
      archetype: 'elite-whale',
      confidence: 0.95,
      traits: ['high-score', 'high-winrate', 'experienced']
    }
  }

  // New Hotshot: New wallet but strong early performance
  if (isNewWallet && whaleScore >= 75 && totalTrades >= 5) {
    return {
      archetype: 'new-hotshot',
      confidence: 0.9,
      traits: ['new-wallet', 'high-score', 'aggressive-start']
    }
  }

  // High Roller: Makes very large bets regardless of win rate
  if (avgBetSize >= 25000) {
    return {
      archetype: 'high-roller',
      confidence: 0.9,
      traits: ['huge-bets', 'high-stakes']
    }
  }

  // Sharpshooter: High win rate but selective (low frequency)
  if (winRate >= 75 && tradesPerHour < 1 && totalTrades >= 20) {
    return {
      archetype: 'sharpshooter',
      confidence: 0.85,
      traits: ['high-winrate', 'selective', 'patient']
    }
  }

  // Specialist: Concentrated in 1-2 categories with good performance
  if (tags && tags.length > 0 && tags.length <= 2 && whaleScore >= 70) {
    return {
      archetype: 'specialist',
      confidence: 0.8,
      traits: ['focused', 'category-expert']
    }
  }

  // Momentum Trader: High frequency with decent performance
  if (tradesPerHour >= 3 && whaleScore >= 60) {
    return {
      archetype: 'momentum-trader',
      confidence: 0.85,
      traits: ['high-frequency', 'momentum-following']
    }
  }

  // Degen: High volume but poor performance
  if (tradesPerHour >= 2 && winRate < 55 && totalTrades >= 30) {
    return {
      archetype: 'degen',
      confidence: 0.8,
      traits: ['high-volume', 'low-winrate', 'aggressive']
    }
  }

  // Cautious Player: Low frequency, moderate bets, decent performance
  if (tradesPerHour < 0.5 && avgBetSize < 10000 && winRate >= 55 && whaleScore >= 50) {
    return {
      archetype: 'cautious-player',
      confidence: 0.75,
      traits: ['low-frequency', 'moderate-size', 'careful']
    }
  }

  // Emerging Trader: Moderate score with positive trajectory
  if (whaleScore >= 60 && whaleScore < 75 && pnl > 0 && totalTrades >= 20) {
    return {
      archetype: 'emerging-trader',
      confidence: 0.7,
      traits: ['moderate-score', 'positive-pnl', 'developing']
    }
  }

  // Struggling Trader: Negative PnL or very low score
  if (pnl < -5000 || whaleScore < 40) {
    return {
      archetype: 'struggling-trader',
      confidence: 0.8,
      traits: ['negative-pnl', 'low-score']
    }
  }

  // Default: Doesn't fit clear archetype
  return {
    archetype: 'default',
    confidence: 0.5,
    traits: ['mixed-profile']
  }
}

/**
 * Generate a human-readable description based on archetype and stats
 */
export function generateWhaleDescription(
  input: WhaleDescriptionInput,
  options: WhaleDescriptionOptions = {}
): string {
  const { maxLength = 120, includeEmoji = true, context = 'leaderboard' } = options
  const classification = classifyWhaleArchetype(input)
  const { archetype } = classification

  // Build description based on archetype
  let description = ''
  const emoji = includeEmoji ? '🤖 ' : ''

  switch (archetype) {
    case 'elite-whale': {
      const specialty = input.tags && input.tags.length > 0 ? `${input.tags[0]} specialist` : 'Elite trader'
      const avgBetStr = input.avgBetSize >= 10000 ? ` $${Math.round(input.avgBetSize / 1000)}k avg bets.` : '.'
      description = `${emoji}${specialty} with proven track record. ${Math.round(input.winRate)}% win rate${avgBetStr}`
      break
    }

    case 'new-hotshot': {
      const intensity = input.recentTrades12h && input.recentTrades12h >= 8 ? 'Very active' : 'Aggressive'
      const betSize = input.avgBetSize >= 15000 ? 'huge' : 'large'
      const fire = includeEmoji ? ' 🔥' : ''
      if (context === 'alpha' && input.currentTrade) {
        description = `${emoji}NEW ${intensity.toLowerCase()} trader making ${betSize} bets. Early mover pattern.${fire}`
      } else {
        description = `${emoji}NEW ${intensity.toLowerCase()} trader. ${Math.round(input.whaleScore)} whale score, strong start.${fire}`
      }
      break
    }

    case 'high-roller': {
      const avgK = Math.round(input.avgBetSize / 1000)
      const wrStr = input.winRate >= 60 ? `solid ${Math.round(input.winRate)}%` : `${Math.round(input.winRate)}%`
      description = `${emoji}High-stakes whale. $${avgK}k avg bets with ${wrStr} success rate.`
      break
    }

    case 'sharpshooter': {
      const trades = input.totalTrades >= 100 ? '100+' : input.totalTrades
      description = `${emoji}Selective trader, rarely misses. ${Math.round(input.winRate)}% win rate over ${trades} positions.`
      break
    }

    case 'specialist': {
      const category = input.tags && input.tags[0] ? input.tags[0] : 'niche'
      const edge = input.winRate >= 65 ? 'strong edge' : 'focused approach'
      description = `${emoji}${category} specialist with ${edge}. Score: ${Math.round(input.whaleScore)}.`
      break
    }

    case 'momentum-trader': {
      const tph = Math.round(input.tradesPerHour * 10) / 10
      const style = input.whaleScore >= 70 ? 'Active momentum trader' : 'High-frequency trader'
      description = `${emoji}${style}. ${tph} trades/hour, ${Math.round(input.winRate)}% win rate.`
      break
    }

    case 'degen': {
      const vol = input.tradesPerHour >= 5 ? 'Very high' : 'High'
      description = `${emoji}${vol}-volume trader with mixed results. ${Math.round(input.winRate)}% win rate, aggressive style.`
      break
    }

    case 'cautious-player': {
      const approach = input.winRate >= 60 ? 'patient approach' : 'careful strategy'
      description = `${emoji}Cautious trader with ${approach}. ${Math.round(input.winRate)}% success rate.`
      break
    }

    case 'emerging-trader': {
      const pnlK = Math.round(input.pnl / 1000)
      const sign = input.pnl >= 0 ? '+' : ''
      description = `${emoji}Emerging trader on positive trajectory. ${sign}$${pnlK}k PnL, score: ${Math.round(input.whaleScore)}.`
      break
    }

    case 'struggling-trader': {
      const issue = input.pnl < -10000 ? 'significant losses' : 'mixed performance'
      description = `${emoji}Trader with ${issue}. ${Math.round(input.winRate)}% win rate, rebuilding.`
      break
    }

    default: {
      // Default template
      const scoreDesc = input.whaleScore >= 65 ? 'solid' : 'moderate'
      description = `${emoji}Active trader with ${scoreDesc} ${Math.round(input.whaleScore)} whale score. ${Math.round(input.winRate)}% win rate.`
      break
    }
  }

  // Truncate if exceeds max length
  if (description.length > maxLength) {
    description = description.substring(0, maxLength - 3) + '...'
  }

  return description
}

/**
 * Generate description with context awareness for /alpha command
 * Includes current trade details when available
 */
export function generateAlphaWhaleDescription(
  input: WhaleDescriptionInput,
  options: WhaleDescriptionOptions = {}
): string {
  return generateWhaleDescription(input, { ...options, context: 'alpha' })
}

/**
 * Helper to build WhaleDescriptionInput from common data sources
 */
export function buildDescriptionInput(params: {
  whaleScore: number
  pnl: number
  winRate: number
  avgBetSize: number
  tradesPerHour: number
  portfolioValue: number
  accountAgeDays?: number | null
  totalTrades: number
  recentTrades12h?: number
  tags?: string[]
  isNewWallet?: boolean
  currentTrade?: {
    notionalUsd: number
    side: 'BUY' | 'SELL'
    marketCategory?: string
  }
}): WhaleDescriptionInput {
  return {
    whaleScore: params.whaleScore,
    pnl: params.pnl,
    winRate: params.winRate,
    avgBetSize: params.avgBetSize,
    tradesPerHour: params.tradesPerHour,
    portfolioValue: params.portfolioValue,
    accountAgeDays: params.accountAgeDays ?? null,
    totalTrades: params.totalTrades,
    recentTrades12h: params.recentTrades12h,
    tags: params.tags,
    isNewWallet: params.isNewWallet ?? false,
    currentTrade: params.currentTrade,
  }
}
