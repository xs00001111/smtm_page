/**
 * Polymarket WebSocket monitoring service
 * Provides real-time alerts for market price changes and whale trades
 */

import { RealTimeDataClient } from '@polymarket/real-time-data-client';
import type { Message } from '@polymarket/real-time-data-client';
import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger';
import { formatPrice, formatVolume, formatAddress } from '@smtm/data';

interface MarketSubscription {
  userId: number;
  tokenId: string;
  marketName: string;
  priceChangeThreshold: number; // Percentage threshold for alerts (e.g., 5 = 5%)
  lastPrice?: number;
}

interface WhaleTradeSubscription {
  userId: number;
  tokenId: string;
  marketName: string;
  minTradeSize: number; // Minimum trade size in USD to trigger alert
}

export class WebSocketMonitorService {
  private client: RealTimeDataClient | null = null;
  private bot: Telegraf;
  private marketSubscriptions: Map<string, MarketSubscription[]> = new Map();
  private whaleSubscriptions: Map<string, WhaleTradeSubscription[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000; // Start with 5 seconds
  private isConnecting = false;

  constructor(bot: Telegraf) {
    this.bot = bot;
  }

  /**
   * Start the WebSocket connection and subscribe to events
   */
  async start() {
    if (this.isConnecting || this.client) {
      logger.warn('WebSocket service already started or connecting');
      return;
    }

    this.isConnecting = true;
    logger.info('Starting Polymarket WebSocket monitoring service');

    try {
      this.client = new RealTimeDataClient({
        onMessage: this.handleMessage.bind(this),
        onConnect: this.handleConnect.bind(this),
        onDisconnect: this.handleDisconnect.bind(this),
        onError: this.handleError.bind(this),
      });

      await this.client.connect();
      this.reconnectAttempts = 0;
      this.isConnecting = false;
      logger.info('WebSocket connection established');
    } catch (error) {
      this.isConnecting = false;
      logger.error('Failed to start WebSocket service', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Stop the WebSocket connection
   */
  async stop() {
    logger.info('Stopping WebSocket monitoring service');
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
  }

  /**
   * Subscribe user to market price alerts
   */
  subscribeToMarket(
    userId: number,
    tokenId: string,
    marketName: string,
    priceChangeThreshold: number = 5
  ): boolean {
    const existing = this.marketSubscriptions
      .get(tokenId)
      ?.find((sub) => sub.userId === userId);

    if (existing) {
      logger.info('User already subscribed to market', { userId, tokenId });
      return false;
    }

    const subscription: MarketSubscription = {
      userId,
      tokenId,
      marketName,
      priceChangeThreshold,
    };

    const subs = this.marketSubscriptions.get(tokenId) || [];
    subs.push(subscription);
    this.marketSubscriptions.set(tokenId, subs);

    // Update WebSocket subscriptions
    this.updateSubscriptions();

    logger.info('Added market subscription', { userId, tokenId, marketName });
    return true;
  }

  /**
   * Unsubscribe user from market price alerts
   */
  unsubscribeFromMarket(userId: number, tokenId: string): boolean {
    const subs = this.marketSubscriptions.get(tokenId);
    if (!subs) return false;

    const index = subs.findIndex((sub) => sub.userId === userId);
    if (index === -1) return false;

    subs.splice(index, 1);

    if (subs.length === 0) {
      this.marketSubscriptions.delete(tokenId);
    } else {
      this.marketSubscriptions.set(tokenId, subs);
    }

    // Update WebSocket subscriptions
    this.updateSubscriptions();

    logger.info('Removed market subscription', { userId, tokenId });
    return true;
  }

  /**
   * Subscribe user to whale trade alerts
   */
  subscribeToWhaleTrades(
    userId: number,
    tokenId: string,
    marketName: string,
    minTradeSize: number = 1000
  ): boolean {
    const existing = this.whaleSubscriptions
      .get(tokenId)
      ?.find((sub) => sub.userId === userId);

    if (existing) {
      logger.info('User already subscribed to whale trades', { userId, tokenId });
      return false;
    }

    const subscription: WhaleTradeSubscription = {
      userId,
      tokenId,
      marketName,
      minTradeSize,
    };

    const subs = this.whaleSubscriptions.get(tokenId) || [];
    subs.push(subscription);
    this.whaleSubscriptions.set(tokenId, subs);

    // Update WebSocket subscriptions
    this.updateSubscriptions();

    logger.info('Added whale trade subscription', { userId, tokenId, marketName });
    return true;
  }

  /**
   * Unsubscribe user from whale trade alerts
   */
  unsubscribeFromWhaleTrades(userId: number, tokenId: string): boolean {
    const subs = this.whaleSubscriptions.get(tokenId);
    if (!subs) return false;

    const index = subs.findIndex((sub) => sub.userId === userId);
    if (index === -1) return false;

    subs.splice(index, 1);

    if (subs.length === 0) {
      this.whaleSubscriptions.delete(tokenId);
    } else {
      this.whaleSubscriptions.set(tokenId, subs);
    }

    // Update WebSocket subscriptions
    this.updateSubscriptions();

    logger.info('Removed whale trade subscription', { userId, tokenId });
    return true;
  }

  /**
   * Get all user subscriptions
   */
  getUserSubscriptions(userId: number): {
    markets: Array<{ tokenId: string; marketName: string; threshold: number }>;
    whales: Array<{ tokenId: string; marketName: string; minSize: number }>;
  } {
    const markets: Array<{ tokenId: string; marketName: string; threshold: number }> =
      [];
    const whales: Array<{ tokenId: string; marketName: string; minSize: number }> = [];

    this.marketSubscriptions.forEach((subs, tokenId) => {
      const userSub = subs.find((sub) => sub.userId === userId);
      if (userSub) {
        markets.push({
          tokenId,
          marketName: userSub.marketName,
          threshold: userSub.priceChangeThreshold,
        });
      }
    });

    this.whaleSubscriptions.forEach((subs, tokenId) => {
      const userSub = subs.find((sub) => sub.userId === userId);
      if (userSub) {
        whales.push({
          tokenId,
          marketName: userSub.marketName,
          minSize: userSub.minTradeSize,
        });
      }
    });

    return { markets, whales };
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(message: Message): void {
    try {
      logger.debug('WebSocket message received', {
        topic: message.topic,
        type: message.type,
      });

      if (message.topic === 'clob_market') {
        this.handleMarketMessage(message);
      } else if (message.topic === 'activity' && message.type === 'trades') {
        this.handleTradeMessage(message);
      }
    } catch (error) {
      logger.error('Error handling WebSocket message', error);
    }
  }

  /**
   * Handle market data messages (price changes, etc.)
   */
  private async handleMarketMessage(message: Message): Promise<void> {
    if (message.type === 'price_change') {
      await this.handlePriceChange(message);
    } else if (message.type === 'last_trade_price') {
      await this.handleLastTradePrice(message);
    }
  }

  /**
   * Handle price change events
   */
  private async handlePriceChange(message: Message): Promise<void> {
    const payload = message.payload as any;
    const tokenId = payload.asset_id || payload.token_id;
    const newPrice = parseFloat(payload.price);

    if (!tokenId || isNaN(newPrice)) {
      logger.warn('Invalid price change payload', payload);
      return;
    }

    const subscriptions = this.marketSubscriptions.get(tokenId);
    if (!subscriptions || subscriptions.length === 0) return;

    for (const sub of subscriptions) {
      // Check if price changed significantly
      if (sub.lastPrice !== undefined) {
        const changePercent = Math.abs(((newPrice - sub.lastPrice) / sub.lastPrice) * 100);

        if (changePercent >= sub.priceChangeThreshold) {
          await this.notifyPriceChange(sub, sub.lastPrice, newPrice, changePercent);
        }
      }

      // Update last price
      sub.lastPrice = newPrice;
    }
  }

  /**
   * Handle last trade price events
   */
  private async handleLastTradePrice(message: Message): Promise<void> {
    const payload = message.payload as any;
    const tokenId = payload.asset_id || payload.token_id;
    const price = parseFloat(payload.price);

    if (!tokenId || isNaN(price)) return;

    // Update last price for subscriptions
    const subscriptions = this.marketSubscriptions.get(tokenId);
    if (subscriptions) {
      for (const sub of subscriptions) {
        if (sub.lastPrice === undefined) {
          sub.lastPrice = price;
        }
      }
    }
  }

  /**
   * Handle trade activity messages
   */
  private async handleTradeMessage(message: Message): Promise<void> {
    const payload = message.payload as any;
    const tokenId = payload.asset_id || payload.token_id;
    const size = parseFloat(payload.size || payload.amount || '0');
    const price = parseFloat(payload.price || '0');
    const tradeValue = size * price;

    if (!tokenId || isNaN(tradeValue)) {
      logger.warn('Invalid trade payload', payload);
      return;
    }

    const subscriptions = this.whaleSubscriptions.get(tokenId);
    if (!subscriptions || subscriptions.length === 0) return;

    for (const sub of subscriptions) {
      if (tradeValue >= sub.minTradeSize) {
        await this.notifyWhaleTrade(sub, payload, tradeValue);
      }
    }
  }

  /**
   * Send price change notification to user
   */
  private async notifyPriceChange(
    subscription: MarketSubscription,
    oldPrice: number,
    newPrice: number,
    changePercent: number
  ): Promise<void> {
    const direction = newPrice > oldPrice ? '📈' : '📉';
    const emoji = newPrice > oldPrice ? '🚀' : '⚠️';

    const message =
      `${emoji} **Price Alert**\n\n` +
      `${subscription.marketName}\n\n` +
      `${direction} **${formatPrice(newPrice)}**\n` +
      `Previous: ${formatPrice(oldPrice)}\n` +
      `Change: ${changePercent.toFixed(2)}%`;

    try {
      await this.bot.telegram.sendMessage(subscription.userId, message, {
        parse_mode: 'Markdown',
      });
      logger.info('Sent price change notification', {
        userId: subscription.userId,
        tokenId: subscription.tokenId,
        changePercent,
      });
    } catch (error) {
      logger.error('Failed to send price notification', {
        userId: subscription.userId,
        error,
      });
    }
  }

  /**
   * Send whale trade notification to user
   */
  private async notifyWhaleTrade(
    subscription: WhaleTradeSubscription,
    trade: any,
    tradeValue: number
  ): Promise<void> {
    const maker = trade.maker_address || trade.maker || 'Unknown';
    const side = trade.side || (trade.type === 'buy' ? 'BUY' : 'SELL');
    const emoji = side === 'BUY' ? '💰' : '💸';

    const message =
      `🐋 **Whale Trade Alert**\n\n` +
      `${subscription.marketName}\n\n` +
      `${emoji} **${side}** ${formatVolume(tradeValue)}\n` +
      `Price: ${formatPrice(parseFloat(trade.price || '0'))}\n` +
      `Trader: \`${formatAddress(maker, 6)}\``;

    try {
      await this.bot.telegram.sendMessage(subscription.userId, message, {
        parse_mode: 'Markdown',
      });
      logger.info('Sent whale trade notification', {
        userId: subscription.userId,
        tokenId: subscription.tokenId,
        tradeValue,
      });
    } catch (error) {
      logger.error('Failed to send whale trade notification', {
        userId: subscription.userId,
        error,
      });
    }
  }

  /**
   * Handle successful connection
   */
  private handleConnect(client: RealTimeDataClient): void {
    logger.info('WebSocket connected, subscribing to topics');
    this.updateSubscriptions();
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(): void {
    logger.warn('WebSocket disconnected');
    this.client = null;
    this.scheduleReconnect();
  }

  /**
   * Handle errors
   */
  private handleError(error: Error): void {
    logger.error('WebSocket error', error);
  }

  /**
   * Update WebSocket subscriptions based on current user subscriptions
   */
  private updateSubscriptions(): void {
    if (!this.client) {
      logger.warn('Cannot update subscriptions: client not connected');
      return;
    }

    const subscriptions: any[] = [];

    // Collect all unique token IDs
    const allTokenIds = new Set([
      ...this.marketSubscriptions.keys(),
      ...this.whaleSubscriptions.keys(),
    ]);

    if (allTokenIds.size === 0) {
      logger.info('No active subscriptions');
      return;
    }

    // Subscribe to clob_market for price changes
    if (this.marketSubscriptions.size > 0) {
      subscriptions.push({
        topic: 'clob_market',
        type: 'price_change',
        filters: JSON.stringify({
          asset_ids: Array.from(this.marketSubscriptions.keys()),
        }),
      });

      subscriptions.push({
        topic: 'clob_market',
        type: 'last_trade_price',
        filters: JSON.stringify({
          asset_ids: Array.from(this.marketSubscriptions.keys()),
        }),
      });
    }

    // Subscribe to activity/trades for whale monitoring
    if (this.whaleSubscriptions.size > 0) {
      subscriptions.push({
        topic: 'activity',
        type: 'trades',
        filters: JSON.stringify({
          asset_ids: Array.from(this.whaleSubscriptions.keys()),
        }),
      });
    }

    try {
      this.client.subscribe({ subscriptions });
      logger.info('Updated WebSocket subscriptions', {
        marketCount: this.marketSubscriptions.size,
        whaleCount: this.whaleSubscriptions.size,
        totalTokens: allTokenIds.size,
      });
    } catch (error) {
      logger.error('Failed to update subscriptions', error);
    }
  }

  /**
   * Schedule reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached, giving up');
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);

    setTimeout(() => {
      this.start();
    }, delay);
  }

  /**
   * Get service status
   */
  getStatus(): {
    connected: boolean;
    marketSubscriptions: number;
    whaleSubscriptions: number;
    totalUsers: number;
  } {
    const uniqueUsers = new Set<number>();

    this.marketSubscriptions.forEach((subs) => {
      subs.forEach((sub) => uniqueUsers.add(sub.userId));
    });

    this.whaleSubscriptions.forEach((subs) => {
      subs.forEach((sub) => uniqueUsers.add(sub.userId));
    });

    return {
      connected: this.client !== null,
      marketSubscriptions: this.marketSubscriptions.size,
      whaleSubscriptions: this.whaleSubscriptions.size,
      totalUsers: uniqueUsers.size,
    };
  }
}
