/**
 * Polymarket WebSocket monitoring service
 * Provides real-time alerts for market price changes and whale trades
 */

import { RealTimeDataClient } from '@polymarket/real-time-data-client';
import type { Message } from '@polymarket/real-time-data-client';
import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger';
import { gammaApi, dataApi, WhaleDetector, TradeBuffer } from '@smtm/data';
import { AlphaAggregator } from './alpha-aggregator';
import { updateMarketToken, updateWhaleToken } from './subscriptions';
import { botConfig } from '../config/bot';
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
  addressFilter?: string; // Optional wallet address to follow
}

interface WhaleAllSubscription {
  userId: number;
  addressFilter: string; // Wallet address to follow across all markets
  minTradeSize: number;
}

export class WebSocketMonitorService {
  private client: RealTimeDataClient | null = null;
  private bot: Telegraf;
  private marketSubscriptions: Map<string, MarketSubscription[]> = new Map();
  private whaleSubscriptions: Map<string, WhaleTradeSubscription[]> = new Map();
  private whaleAllSubscriptions: Map<string, WhaleAllSubscription[]> = new Map(); // key: wallet address (lowercase)
  private pendingWhaleSubscriptions: Map<string, Array<{ userId: number; marketName: string; minTradeSize: number; addressFilter?: string }>> = new Map();
  private observerTokenIds: Set<string> = new Set();
  private pendingMarketSubscriptions: Map<string, MarketSubscription[]> = new Map(); // key: conditionId
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 10000; // Start with 10 seconds
  private isConnecting = false;
  private isRateLimited = false;
  private rateLimitCooldown = 180000; // 3 minutes cooldown after rate limit
  private nextReconnectAt: number | null = null;
  // Lightweight orderbook/imbalance cache (enrichment only)
  private orderbookState: Map<string, { ts: number; bid: number | null; ask: number | null; depthBid: number; depthAsk: number; imbalance: number | null }> = new Map();

  constructor(bot: Telegraf) {
    this.bot = bot;
  }

  private hasSubscriptions(): boolean {
    return this.marketSubscriptions.size > 0 || this.whaleSubscriptions.size > 0 || this.whaleAllSubscriptions.size > 0;
  }

  /**
   * Start the WebSocket connection and subscribe to events
   */
  async start() {
    if (this.isConnecting || this.client) {
      logger.warn('WebSocket service already started or connecting');
      return;
    }

    // Avoid connecting if feature disabled or no subs yet
    if (!botConfig.websocket.enabled) {
      logger.info('WebSocket disabled by config');
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
      // Disable the client's built-in immediate auto-reconnect. We'll manage
      // reconnection with backoff to avoid 429 rate limits.
      // @ts-ignore - property exists at runtime in the packaged client
      this.client.autoReconnect = false;

      await this.client.connect();
      // Do not mark as not-connecting yet; wait for onConnect callback to fire.
      this.reconnectAttempts = 0;
      logger.info('WebSocket connect initiated');

      // Attempt resolving any pending market subscriptions
      this.resolvePendingMarkets().catch(()=>{})
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

    // Ensure WS started and update subscriptions
    if (!this.client && !this.isConnecting) {
      this.start();
    }
    this.updateSubscriptions();

    logger.info('Added market subscription', { userId, tokenId, marketName });
    return true;
  }

  /**
   * Subscribe user to a market by condition id (pending until token is resolved)
   */
  subscribePendingMarket(
    userId: number,
    conditionId: string,
    marketName: string,
    priceChangeThreshold: number = 5
  ): boolean {
    const list = this.pendingMarketSubscriptions.get(conditionId) || []
    if (list.find((s) => s.userId === userId)) {
      logger.info('User already has pending market subscription', { userId, conditionId })
      return false
    }
    list.push({ userId, tokenId: '', marketName, priceChangeThreshold })
    this.pendingMarketSubscriptions.set(conditionId, list)
    logger.info('Added pending market subscription', { userId, conditionId })
    // Try to resolve shortly
    setTimeout(()=>{ this.resolvePendingMarkets().catch(()=>{}) }, 500)
    return true
  }

  private async resolvePendingMarkets(): Promise<void> {
    if (this.pendingMarketSubscriptions.size === 0) return
    logger.info('Resolving pending market subscriptions', { count: this.pendingMarketSubscriptions.size, whales: this.pendingWhaleSubscriptions.size })
    const conditionIds = new Set<string>([
      ...this.pendingMarketSubscriptions.keys(),
      ...this.pendingWhaleSubscriptions.keys(),
    ])
    for (const conditionId of Array.from(conditionIds)) {
      const marketSubs = this.pendingMarketSubscriptions.get(conditionId) || []
      const whaleSubs = this.pendingWhaleSubscriptions.get(conditionId) || []
      let tokenId: string | null = null
      try {
        // Prefer Gamma for metadata
        const market = await gammaApi.getMarket(conditionId)
        if (market?.tokens && market.tokens.length > 0) {
          tokenId = market.tokens[0].token_id
          // Register market pair (YES/NO) for alpha aggregator if available
          try {
            const yes = (market.tokens || []).find((t:any) => (t.outcome||'').toLowerCase() === 'yes')?.token_id
            const no  = (market.tokens || []).find((t:any) => (t.outcome||'').toLowerCase() === 'no')?.token_id
            if (yes && no) {
              const { AlphaAggregator } = await import('./alpha-aggregator')
              AlphaAggregator.registerMarketPair(conditionId, yes, no, market.question)
            }
          } catch {}
        }
        // Fallback: resolve via CLOB Market endpoint (no Data API)
        if (!tokenId) {
          try {
            const mkt: any = await (await import('@smtm/data')).clobApi.getMarket(conditionId)
            if (mkt?.tokens && mkt.tokens.length > 0) {
              tokenId = mkt.tokens[0].token_id
            }
          } catch {}
        }
      } catch (e) {
        logger.error('resolvePendingMarkets error', e)
      }
      if (tokenId) {
        logger.info('Resolved condition to token', { conditionId, tokenId, priceSubs: marketSubs.length, whaleSubs: whaleSubs.length })
        // Activate price alert subscribers
        for (const sub of marketSubs) {
          this.subscribeToMarket(sub.userId, tokenId, sub.marketName, sub.priceChangeThreshold)
          // Notify user
          try { await this.bot.telegram.sendMessage(sub.userId, `✅ Price alerts activated for: ${sub.marketName}`) } catch {}
          // Update CSV
          try { await updateMarketToken(sub.userId, conditionId, tokenId) } catch {}
        }
        // Activate whale alert subscribers
        for (const sub of whaleSubs) {
          this.subscribeToWhaleTrades(sub.userId, tokenId, sub.marketName, sub.minTradeSize, sub.addressFilter)
          try { await this.bot.telegram.sendMessage(sub.userId, `✅ Whale alerts activated for: ${sub.marketName}`) } catch {}
          try { await updateWhaleToken(sub.userId, conditionId, tokenId) } catch {}
        }
        if (marketSubs.length) this.pendingMarketSubscriptions.delete(conditionId)
        if (whaleSubs.length) this.pendingWhaleSubscriptions.delete(conditionId)
      }
    }
  }

  /**
   * Subscribe user to whale alerts by condition id (pending until token available)
   */
  subscribePendingWhale(
    userId: number,
    conditionId: string,
    marketName: string,
    minTradeSize: number,
    addressFilter?: string,
  ): boolean {
    const list = this.pendingWhaleSubscriptions.get(conditionId) || []
    if (list.find((s) => s.userId === userId)) {
      logger.info('User already has pending whale subscription', { userId, conditionId })
      return false
    }
    list.push({ userId, marketName, minTradeSize, addressFilter })
    this.pendingWhaleSubscriptions.set(conditionId, list)
    logger.info('Added pending whale subscription', { userId, conditionId })
    // Try to resolve shortly
    setTimeout(()=>{ this.resolvePendingMarkets().catch(()=>{}) }, 500)
    return true
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
    minTradeSize: number = 1000,
    addressFilter?: string
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
      addressFilter: addressFilter?.toLowerCase(),
    };

    const subs = this.whaleSubscriptions.get(tokenId) || [];
    subs.push(subscription);
    this.whaleSubscriptions.set(tokenId, subs);

    // Ensure WS started and update subscriptions
    if (!this.client && !this.isConnecting) {
      this.start();
    }
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
   * Subscribe user to whale alerts across ALL markets (copy trading)
   */
  subscribeToWhaleTradesAll(
    userId: number,
    addressFilter: string,
    minTradeSize: number = 1000
  ): boolean {
    const walletKey = addressFilter.toLowerCase();
    const existing = this.whaleAllSubscriptions
      .get(walletKey)
      ?.find((sub) => sub.userId === userId);

    if (existing) {
      logger.info('User already subscribed to whale-all', { userId, wallet: walletKey });
      return false;
    }

    const subscription: WhaleAllSubscription = {
      userId,
      addressFilter: walletKey,
      minTradeSize,
    };

    const subs = this.whaleAllSubscriptions.get(walletKey) || [];
    subs.push(subscription);
    this.whaleAllSubscriptions.set(walletKey, subs);

    logger.info('Added whale-all subscription', { userId, wallet: walletKey });
    return true;
  }

  /**
   * Unsubscribe user from whale alerts across ALL markets
   */
  unsubscribeFromWhaleTradesAll(userId: number, addressFilter: string): boolean {
    const walletKey = addressFilter.toLowerCase();
    const subs = this.whaleAllSubscriptions.get(walletKey);
    if (!subs) return false;

    const index = subs.findIndex((sub) => sub.userId === userId);
    if (index === -1) return false;

    subs.splice(index, 1);

    if (subs.length === 0) {
      this.whaleAllSubscriptions.delete(walletKey);
    } else {
      this.whaleAllSubscriptions.set(walletKey, subs);
    }

    logger.info('Removed whale-all subscription', { userId, wallet: walletKey });
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
    } else if (message.type === 'agg_orderbook') {
      await this.handleAggOrderbook(message)
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
   * Handle aggregated orderbook messages (top-of-book + aggregated depth)
   */
  private async handleAggOrderbook(message: Message): Promise<void> {
    const payload = message.payload as any
    const tokenId = payload.asset_id || payload.token_id
    if (!tokenId) return
    const ts = Date.now()

    // Accept a few possible shapes: arrays of { price, size } or compact { p, s }
    const bids: Array<any> = Array.isArray(payload.bids) ? payload.bids : []
    const asks: Array<any> = Array.isArray(payload.asks) ? payload.asks : []
    const topBid = bids.length ? parseFloat((bids[0].price ?? bids[0].p) || '0') : NaN
    const topAsk = asks.length ? parseFloat((asks[0].price ?? asks[0].p) || '0') : NaN

    // Sum first 5 levels for a quick imbalance proxy
    const levels = 5
    const depthBid = bids.slice(0, levels).reduce((acc, l) => acc + parseFloat((l.size ?? l.s) || '0') * parseFloat((l.price ?? l.p) || '0'), 0)
    const depthAsk = asks.slice(0, levels).reduce((acc, l) => acc + parseFloat((l.size ?? l.s) || '0') * parseFloat((l.price ?? l.p) || '0'), 0)
    const denom = depthBid + depthAsk
    const imbalance = denom > 0 ? (depthBid - depthAsk) / denom : null

    this.orderbookState.set(tokenId, {
      ts,
      bid: Number.isFinite(topBid) ? topBid : null,
      ask: Number.isFinite(topAsk) ? topAsk : null,
      depthBid,
      depthAsk,
      imbalance,
    })
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

    logger.info('ws:trade', { tokenId, price, size, notional: Math.round(tradeValue), maker: (payload.maker_address || payload.maker || '').toLowerCase() })

    // Feed detector for global whale ingestion (in-memory)
    try {
      const ev = WhaleDetector.handleTradeMessage(payload)
      // If maker is a known watchlist whale, log explicitly
      const wl = new Set((WhaleDetector as any).getWatchlist ? (WhaleDetector as any).getWatchlist() : [])
      const mk = (payload.maker_address || payload.maker || '').toLowerCase()
      if (mk && wl.has(mk)) {
        logger.info('alpha:ws whale_trade', { tokenId, maker: mk, price, size, notional: Math.round(tradeValue) })
      }
    } catch {}
    // Feed raw trade buffer for alpha fallbacks and skew
    try { TradeBuffer.handleTrade(payload) } catch {}
    // Feed alpha aggregator (whale alpha for now)
    try { await AlphaAggregator.onTrade(payload) } catch {}

    // Check market-specific whale subscriptions
    const subscriptions = this.whaleSubscriptions.get(tokenId);
    if (subscriptions && subscriptions.length > 0) {
      for (const sub of subscriptions) {
        if (tradeValue >= sub.minTradeSize) {
          // If following a specific wallet, filter by maker address
          const maker = (payload.maker_address || payload.maker || '').toLowerCase();
          if (sub.addressFilter && maker !== sub.addressFilter) continue;
          logger.info('notify:whale_trade', { tokenId, userId: sub.userId, market: sub.marketName, minTradeSize: sub.minTradeSize, notional: Math.round(tradeValue), maker })
          await this.notifyWhaleTrade(sub, payload, tradeValue);
        }
      }
    }

    // Check whale-all subscriptions (following wallet across all markets)
    const maker = (payload.maker_address || payload.maker || '').toLowerCase();
    if (maker) {
      const whaleAllSubs = this.whaleAllSubscriptions.get(maker);
      if (whaleAllSubs && whaleAllSubs.length > 0) {
        for (const sub of whaleAllSubs) {
          if (tradeValue >= sub.minTradeSize) {
            await this.notifyWhaleTradeAll(sub, payload, tradeValue, tokenId);
          }
        }
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
   * Send whale-all trade notification to user
   */
  private async notifyWhaleTradeAll(
    subscription: WhaleAllSubscription,
    trade: any,
    tradeValue: number,
    tokenId: string
  ): Promise<void> {
    const maker = trade.maker_address || trade.maker || 'Unknown';
    const side = trade.side || (trade.type === 'buy' ? 'BUY' : 'SELL');
    const emoji = side === 'BUY' ? '💰' : '💸';
    const shortAddr = formatAddress(maker, 6);

    // Try to get market name from our subscriptions or fetch it
    let marketName = 'Unknown Market';

    // Check if we have this market in our subscriptions
    const marketSubs = this.marketSubscriptions.get(tokenId);
    if (marketSubs && marketSubs.length > 0) {
      marketName = marketSubs[0].marketName;
    } else {
      const whaleSubs = this.whaleSubscriptions.get(tokenId);
      if (whaleSubs && whaleSubs.length > 0) {
        marketName = whaleSubs[0].marketName;
      }
    }

    const message =
      `🐋 **Copy Trade Alert**\n\n` +
      `Whale: \`${shortAddr}\`\n` +
      `Market: ${marketName}\n\n` +
      `${emoji} **${side}** ${formatVolume(tradeValue)}\n` +
      `Price: ${formatPrice(parseFloat(trade.price || '0'))}`;

    try {
      await this.bot.telegram.sendMessage(subscription.userId, message, {
        parse_mode: 'Markdown',
      });
      logger.info('Sent whale-all trade notification', {
        userId: subscription.userId,
        wallet: subscription.addressFilter,
        tradeValue,
      });
    } catch (error) {
      logger.error('Failed to send whale-all trade notification', {
        userId: subscription.userId,
        error,
      });
    }
  }

  /**
   * Debug helpers to validate push delivery without real market activity
   */
  async debugSendPrice(userId: number): Promise<boolean> {
    // Pick first market subscription for this user
    for (const [_, subs] of this.marketSubscriptions) {
      const sub = subs.find((s) => s.userId === userId)
      if (sub) {
        const oldP = sub.lastPrice ?? 0.45
        const newP = oldP * (1 + sub.priceChangeThreshold / 50) // trigger >threshold change
        const delta = Math.abs(((newP - oldP) / oldP) * 100)
        await this.notifyPriceChange(sub, oldP, newP, delta)
        return true
      }
    }
    return false
  }

  async debugSendWhale(userId: number): Promise<boolean> {
    for (const [tokenId, subs] of this.whaleSubscriptions) {
      const sub = subs.find((s) => s.userId === userId)
      if (sub) {
        const maker = sub.addressFilter || '0x56687bf447db6ffa42ffe2204a05edaa20f55839'
        const trade = {
          asset_id: tokenId,
          price: '0.62',
          size: '2500',
          maker_address: maker,
          side: 'BUY',
        }
        const tradeValue = parseFloat(trade.size) * parseFloat(trade.price)
        await this.notifyWhaleTrade(sub, trade, tradeValue)
        return true
      }
    }
    return false
  }

  /**
   * Handle successful connection
   */
  private handleConnect(client: RealTimeDataClient): void {
    logger.info('WebSocket connected successfully, subscribing to topics');
    this.reconnectAttempts = 0; // Reset reconnection counter on successful connect
    this.isRateLimited = false; // Clear rate limit flag
    this.isConnecting = false;
    this.updateSubscriptions();
  }

  /**
   * Handle disconnection
   */
  private handleDisconnect(): void {
    logger.warn('WebSocket disconnected');
    this.client = null;
    this.isConnecting = false;
    if (this.hasSubscriptions()) {
      this.scheduleReconnect();
    } else {
      logger.info('No active subscriptions; will reconnect on first subscription');
    }
  }

  /**
   * Handle errors
   */
  private handleError(error: Error): void {
    logger.error('WebSocket error', error);

    // Check for rate limit error (429)
    if (error.message && error.message.includes('429')) {
      logger.warn('Rate limited by Polymarket API, entering cooldown period');
      this.isRateLimited = true;
      this.reconnectAttempts = Math.max(this.reconnectAttempts, 5); // Skip to longer delays
      // Ensure we don't let the underlying client spin reconnects rapidly
      if (this.client) {
        // @ts-ignore
        this.client.autoReconnect = false;
      }
      // Schedule a reconnect with cooldown if disconnected state
      this.scheduleReconnect();
    }
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
    const allTokenIds = new Set<string>([
      ...this.marketSubscriptions.keys(),
      ...this.whaleSubscriptions.keys(),
      ...this.observerTokenIds,
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

    // Subscribe to activity/trades for whale monitoring and aggregator
    // Include marketSubscriptions tokens so aggregator can see trades even if users only follow prices
    if (this.whaleSubscriptions.size > 0 || this.observerTokenIds.size > 0 || this.marketSubscriptions.size > 0) {
      const activityIds = new Set<string>([
        ...this.whaleSubscriptions.keys(),
        ...this.observerTokenIds,
        ...this.marketSubscriptions.keys(),
      ])
      subscriptions.push({
        topic: 'activity',
        type: 'trades',
        filters: JSON.stringify({ asset_ids: Array.from(activityIds) }),
      });
    }

    // Optional: aggregated orderbook for enrichment
    if (botConfig.websocket.includeAggOrderbook) {
      const ids = new Set<string>()
      for (const id of this.marketSubscriptions.keys()) ids.add(id)
      for (const id of this.whaleSubscriptions.keys()) ids.add(id)
      for (const id of this.observerTokenIds) ids.add(id)
      if (ids.size > 0) {
        subscriptions.push({
          topic: 'clob_market',
          type: 'agg_orderbook',
          filters: JSON.stringify({ asset_ids: Array.from(ids) }),
        })
      }
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
   * Provide a background set of assets to observe trades for (feeds the aggregator)
   */
  setObserverAssets(tokenIds: string[]): void {
    let added = 0
    for (const id of tokenIds) {
      if (id && !this.observerTokenIds.has(id)) { this.observerTokenIds.add(id); added++ }
    }
    if (added > 0) {
      logger.info('Observer assets updated', { added, total: this.observerTokenIds.size })
      // Ensure WS started and refresh subs
      if (!this.client && !this.isConnecting) this.start()
      this.updateSubscriptions()
    }
  }

  /**
   * Schedule reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.isConnecting) {
      logger.warn('Connection attempt already in progress, skipping reconnect schedule');
      return;
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached, giving up');
      return;
    }

    // Use longer delay if rate limited
    let delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
    if (this.isRateLimited) {
      delay = Math.max(delay, this.rateLimitCooldown);
      logger.info(`Rate limit detected, using cooldown period: ${delay}ms`);
    }

    // Cap maximum delay at 5 minutes and add small jitter to avoid thundering herd
    delay = Math.min(delay, 300000);
    const jitter = 0.2; // 20% jitter
    const factor = 1 + (Math.random() * 2 - 1) * jitter;
    delay = Math.floor(delay * factor);
    this.nextReconnectAt = Date.now() + delay;

    this.reconnectAttempts++;

    logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${(delay / 1000).toFixed(0)}s`);

    setTimeout(() => {
      this.isRateLimited = false; // Reset rate limit flag
      this.nextReconnectAt = null;
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
    reconnectAttempts: number;
    nextReconnectInMs: number | null;
    rateLimited: boolean;
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
      reconnectAttempts: this.reconnectAttempts,
      nextReconnectInMs: this.nextReconnectAt ? Math.max(0, this.nextReconnectAt - Date.now()) : null,
      rateLimited: this.isRateLimited,
    };
  }
}
