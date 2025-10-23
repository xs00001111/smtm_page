/**
 * Polymarket integration service for Telegram bot
 * Connects data fetching APIs with bot commands
 */

import {
  gammaApi,
  dataApi,
  clobApi,
  findMarket,
  getMarketSnapshot,
  getUserPortfolio,
  formatAddress,
  formatPrice,
  formatVolume,
} from '@smtm/data';
import type { Card } from '@smtm/shared/types';
import { logger } from '../utils/logger';

export class PolymarketService {
  /**
   * Get market details formatted as a card
   */
  async getMarketCard(query: string): Promise<Card | null> {
    try {
      const market = await findMarket(query);

      if (!market) {
        return null;
      }

      const lines: string[] = [
        `Volume: ${formatVolume(market.volume)}`,
        `24h Volume: ${formatVolume(market.volume_24hr)}`,
        `Liquidity: ${formatVolume(market.liquidity)}`,
      ];

      if (market.tokens && market.tokens.length > 0) {
        lines.push(''); // Empty line
        lines.push('Current Prices:');
        market.tokens.forEach((token) => {
          lines.push(`  ${token.outcome}: ${formatPrice(token.price)}`);
        });
      }

      return {
        title: market.question,
        lines,
        url: market.market_slug
          ? `https://polymarket.com/event/${market.market_slug}`
          : undefined,
        footer: market.active ? '🟢 Active' : '🔴 Closed',
      };
    } catch (error) {
      logger.error('Failed to get market card:', error);
      return null;
    }
  }

  /**
   * Get price information with recent changes
   */
  async getPriceCard(query: string): Promise<Card | null> {
    try {
      const market = await findMarket(query);

      if (!market || !market.tokens || market.tokens.length === 0) {
        return null;
      }

      const tokenId = market.tokens[0].token_id;
      const priceChange = await clobApi.getPriceChange(tokenId, '1d');

      const lines: string[] = [];

      market.tokens.forEach((token) => {
        lines.push(`${token.outcome}: ${formatPrice(token.price)}`);
      });

      if (priceChange.changePercent !== null) {
        const arrow = priceChange.changePercent > 0 ? '📈' : '📉';
        lines.push('');
        lines.push(
          `24h Change: ${arrow} ${priceChange.changePercent.toFixed(2)}%`
        );
      }

      return {
        title: `💰 ${market.question}`,
        lines,
        url: market.market_slug
          ? `https://polymarket.com/event/${market.market_slug}`
          : undefined,
      };
    } catch (error) {
      logger.error('Failed to get price card:', error);
      return null;
    }
  }

  /**
   * Get trending markets
   */
  async getTrendingCards(limit = 5): Promise<Card[]> {
    try {
      const markets = await gammaApi.getTrendingMarkets(limit);

      return markets.map((market, i) => ({
        title: `${i + 1}. ${market.question}`,
        lines: [
          `Volume: ${formatVolume(market.volume)}`,
          `24h: ${formatVolume(market.volume_24hr)}`,
        ],
        url: market.market_slug
          ? `https://polymarket.com/event/${market.market_slug}`
          : undefined,
      }));
    } catch (error) {
      logger.error('Failed to get trending cards:', error);
      return [];
    }
  }

  /**
   * Get user portfolio summary
   */
  async getPortfolioCard(address: string): Promise<Card | null> {
    try {
      const portfolio = await getUserPortfolio(address);

      const lines: string[] = [
        `Total Value: ${formatVolume(portfolio.totalValue)}`,
        `Active Positions: ${portfolio.positionsCount}`,
      ];

      if (portfolio.positions.length > 0) {
        lines.push('');
        lines.push('Top 3 Positions:');

        const topPositions = portfolio.positions
          .sort((a, b) => parseFloat(b.value || '0') - parseFloat(a.value || '0'))
          .slice(0, 3);

        topPositions.forEach((pos, i) => {
          lines.push(
            `${i + 1}. ${pos.outcome}: ${formatVolume(pos.value)}`
          );
        });
      }

      return {
        title: `Portfolio: ${formatAddress(address, 6)}`,
        lines,
      };
    } catch (error) {
      logger.error('Failed to get portfolio card:', error);
      return null;
    }
  }

  /**
   * Get whale activity for a market
   */
  async getWhalesCard(query: string, minBalance = 1000): Promise<Card | null> {
    try {
      const market = await findMarket(query);

      if (!market) {
        return null;
      }

      const holders = await dataApi.getTopHolders({
        market: market.condition_id,
        limit: 10,
        minBalance,
      });

      const lines: string[] = [];

      if (holders.length === 0) {
        lines.push('No significant holders found.');
      } else {
        holders.forEach((tokenHolders) => {
          const topHolders = tokenHolders.holders.slice(0, 5);
          if (topHolders.length > 0) {
            lines.push('');
            lines.push('Top Holders:');
            topHolders.forEach((holder, i) => {
              lines.push(
                `${i + 1}. ${formatAddress(holder.address, 6)}: ${parseFloat(holder.balance).toFixed(0)}`
              );
            });
          }
        });
      }

      return {
        title: `🐋 Whales: ${market.question}`,
        lines,
      };
    } catch (error) {
      logger.error('Failed to get whales card:', error);
      return null;
    }
  }

  /**
   * Get complete market snapshot
   */
  async getMarketSnapshot(query: string): Promise<Card[]> {
    try {
      const market = await findMarket(query);

      if (!market) {
        return [];
      }

      const snapshot = await getMarketSnapshot(market.condition_id);

      const cards: Card[] = [];

      // Market info card
      cards.push({
        title: snapshot.market.question,
        lines: [
          `Volume: ${formatVolume(snapshot.stats.volume)}`,
          `24h Volume: ${formatVolume(snapshot.stats.volume24hr)}`,
          `Liquidity: ${formatVolume(snapshot.stats.liquidity)}`,
        ],
        url: market.market_slug
          ? `https://polymarket.com/event/${market.market_slug}`
          : undefined,
        footer: snapshot.stats.active ? '🟢 Active' : '🔴 Closed',
      });

      // Price card
      if (snapshot.market.tokens && snapshot.market.tokens.length > 0) {
        const lines: string[] = ['Current Prices:'];
        snapshot.market.tokens.forEach((token) => {
          lines.push(`  ${token.outcome}: ${formatPrice(token.price)}`);
        });

        if (snapshot.priceChange.changePercent !== null) {
          const arrow = snapshot.priceChange.changePercent > 0 ? '📈' : '📉';
          lines.push('');
          lines.push(
            `24h Change: ${arrow} ${snapshot.priceChange.changePercent.toFixed(2)}%`
          );
        }

        cards.push({
          title: '💰 Prices',
          lines,
        });
      }

      // Whales card
      if (snapshot.holders.length > 0) {
        const lines: string[] = [];
        snapshot.holders.forEach((tokenHolders) => {
          const topHolders = tokenHolders.holders.slice(0, 3);
          if (topHolders.length > 0) {
            lines.push('Top Holders:');
            topHolders.forEach((holder, i) => {
              lines.push(
                `${i + 1}. ${formatAddress(holder.address, 6)}: ${parseFloat(holder.balance).toFixed(0)}`
              );
            });
          }
        });

        if (lines.length > 0) {
          cards.push({
            title: '🐋 Whales',
            lines,
          });
        }
      }

      return cards;
    } catch (error) {
      logger.error('Failed to get market snapshot:', error);
      return [];
    }
  }

  /**
   * Search markets and return results
   */
  async searchMarketsCards(query: string, limit = 5): Promise<Card[]> {
    try {
      const markets = await gammaApi.searchMarkets(query, limit);

      return markets.map((market) => ({
        title: market.question,
        lines: [
          `Volume: ${formatVolume(market.volume)}`,
          market.tokens && market.tokens.length > 0
            ? `Outcomes: ${market.tokens.map((t) => t.outcome).join(', ')}`
            : 'No outcomes',
        ],
        url: market.market_slug
          ? `https://polymarket.com/event/${market.market_slug}`
          : undefined,
      }));
    } catch (error) {
      logger.error('Failed to search markets:', error);
      return [];
    }
  }
}

// Export singleton instance
export const polymarketService = new PolymarketService();
