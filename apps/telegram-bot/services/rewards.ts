import { gammaApi } from '@smtm/data';
import type { GammaMarket } from '@smtm/data';
import { logger } from '../utils/logger';

/**
 * Rewards service for fetching Polymarket daily rewards/rebates
 */

export interface RewardInfo {
  market: string;
  question: string;
  slug: string;
  rewardRate: string;
  minSize: string;
  maxSpread: string;
  volume24h: string;
  liquidity: string;
}

/**
 * Fetch markets with active rewards program
 */
export async function getRewardMarkets(limit = 20): Promise<RewardInfo[]> {
  try {
    logger.info('rewards: fetching via gammaApi.getActiveMarkets')

    // Primary: active markets, sort by total volume
    const markets = await gammaApi.getActiveMarkets(200, 'volume')

    const rewardMarkets = markets
      .filter((m: any) => m && m.rewards && Array.isArray(m.rewards.rates) && m.rewards.rates.length > 0)
      .map((m: any) => ({
        market: m.condition_id,
        question: m.question,
        slug: m.market_slug || '',
        rewardRate: m.rewards?.rates?.[0]?.rate_per_day || '0',
        minSize: m.rewards?.min_size || m.rewards?.rates?.[0]?.min_size || '0',
        maxSpread: m.rewards?.max_spread || m.rewards?.rates?.[0]?.max_spread || '0',
        volume24h: m.volume_24hr || '0',
        liquidity: m.liquidity || '0',
      }))
      .slice(0, limit)

    logger.info({ count: rewardMarkets.length }, 'rewards: gamma results')
    if (rewardMarkets.length > 0) return rewardMarkets

    // Final fallback: return empty and let caller present link
    logger.warn('rewards: no reward markets found from any source')
    return []
  } catch (error) {
    logger.error(error, 'Error fetching reward markets')
    throw error
  }
}

/**
 * Get the highest reward market (by daily reward rate)
 */
export async function getTopRewardMarket(): Promise<RewardInfo | null> {
  try {
    const markets = await getRewardMarkets(50);

    if (markets.length === 0) {
      return null;
    }

    // Sort by reward rate (descending)
    markets.sort((a, b) => parseFloat(b.rewardRate) - parseFloat(a.rewardRate));

    return markets[0];
  } catch (error) {
    logger.error(error, 'Error fetching top reward market');
    return null;
  }
}

/**
 * Format reward info for display
 */
export function formatRewardInfo(reward: RewardInfo): string {
  const rewardRate = parseFloat(reward.rewardRate);
  const minSize = parseFloat(reward.minSize);
  const maxSpread = parseFloat(reward.maxSpread);
  const volume24h = parseFloat(reward.volume24h);
  const liquidity = parseFloat(reward.liquidity);

  return (
    `💰 *Highest Reward Market Today*\n\n` +
    `📊 *Market:* ${reward.question}\n\n` +
    `🎯 *Daily Reward Rate:* $${rewardRate.toFixed(2)} USDC/day\n` +
    `💵 *Min Position Size:* $${minSize.toFixed(0)}\n` +
    `📈 *Max Spread:* ${(maxSpread * 100).toFixed(2)}%\n\n` +
    `📉 *Market Stats:*\n` +
    `• 24h Volume: $${formatVolume(volume24h)}\n` +
    `• Liquidity: $${formatVolume(liquidity)}\n\n` +
    `🔗 *Trade Now:* https://polymarket.com/event/${reward.slug}\n\n` +
    `💡 *How to Earn:*\n` +
    `1. Place limit orders within the spread\n` +
    `2. Maintain minimum position size\n` +
    `3. Rewards distributed daily at midnight UTC`
  );
}

/**
 * Format a summary of top reward markets
 */
export function formatRewardSummary(rewards: RewardInfo[]): string {
  if (rewards.length === 0) {
    return '❌ No reward markets available at the moment.';
  }

  let message = '💰 *Top Daily Reward Markets*\n\n';

  rewards.slice(0, 5).forEach((reward, index) => {
    const rewardRate = parseFloat(reward.rewardRate);
    const minSize = parseFloat(reward.minSize);

    message +=
      `${index + 1}. *${truncate(reward.question, 50)}*\n` +
      `   💵 $${rewardRate.toFixed(2)}/day | Min: $${minSize.toFixed(0)}\n` +
      `   🔗 polymarket.com/event/${reward.slug}\n\n`;
  });

  message +=
    `💡 *Tips:*\n` +
    `• Place orders within spread to earn\n` +
    `• Higher volume = more competitive\n` +
    `• Rewards paid daily at midnight UTC\n\n` +
    `Visit: https://polymarket.com/rewards`;

  return message;
}

/**
 * Helper: Format large numbers
 */
function formatVolume(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toFixed(0);
}

/**
 * Helper: Truncate text
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
