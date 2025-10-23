import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger';
import { getTopRewardMarket, formatRewardInfo } from '../services/rewards';
import { findMarket } from '@smtm/data';
import { wsMonitor } from '../index';
import { botConfig } from '../config/bot';

export function registerCommands(bot: Telegraf) {
  // Start command
  bot.command('start', async (ctx) => {
    logger.info('User started bot', { userId: ctx.from?.id });
    await ctx.reply(
      'Welcome to SMTM Bot! 🎯\n\n' +
        '📊 Your AI-powered trading and information bot for prediction markets.\n\n' +
        '🎲 Supported Platforms:\n' +
        '• Polymarket - Trade on real-world events\n' +
        '• Kalshi - Coming soon!\n\n' +
        '✨ What I can do:\n' +
        '• 🔥 Browse trending markets\n' +
        '• 🔔 Real-time price alerts (WebSocket)\n' +
        '• 🐋 Whale trade notifications\n' +
        '• 💰 Daily reward tips from Polymarket\n' +
        '• 📊 Live market prices and data\n\n' +
        '🚀 Quick Start:\n' +
        '1. `/markets` - See what\'s trending\n' +
        '2. `/subscribe trump 2024` - Get live alerts\n' +
        '3. `/list` - View your subscriptions\n\n' +
        '💡 **Search is smart!** Just use natural language:\n' +
        '• `/subscribe bitcoin` - finds BTC markets\n' +
        '• `/whale election` - tracks big election bets\n' +
        '• `/price trump` - gets current odds\n\n' +
        'Let\'s start trading smarter! 🎯'
    );
  });

  // Help command
  bot.command('help', async (ctx) => {
    await ctx.reply(
      '📚 **SMTM Bot Help**\n\n' +
        '🔥 **Discovery:**\n' +
        '`/markets` - Browse trending markets\n' +
        '`/price trump` - Get current market price\n\n' +
        '🔔 **Real-Time Alerts:**\n' +
        '`/subscribe bitcoin` - Live price alerts\n' +
        '`/whale election` - Whale trade alerts ($1000+)\n' +
        '`/list` - View your subscriptions\n' +
        '`/unsubscribe trump` - Stop alerts\n\n' +
        '💰 **Daily Rewards:**\n' +
        '`/daily_tip` - Today\'s highest reward market\n\n' +
        '⚙️ **System:**\n' +
        '`/status` - Check WebSocket connection\n\n' +
        '💡 **Pro Tips:**\n' +
        '• **Natural language works!** Just type what you\'re looking for\n' +
        '  `/subscribe trump 2024` ✅\n' +
        '  `/whale presidential election` ✅\n' +
        '  `/price btc` ✅\n\n' +
        '• **Instant alerts** - WebSocket powered (sub-second latency)\n' +
        '• **No API key needed** - Just start using!\n' +
        '• **Track unlimited markets** - Subscribe to as many as you want\n\n' +
        '**Workflow Example:**\n' +
        '1. `/markets` → See what\'s hot\n' +
        '2. `/subscribe trump` → Get alerts\n' +
        '3. `/whale trump` → Track big money\n' +
        '4. `/list` → Manage subscriptions\n\n' +
        'Questions? Just ask or try any command! 🚀',
      { parse_mode: 'Markdown' }
    );
  });

  // Price command
  bot.command('price', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      await ctx.reply('Please specify a market. Example: /price trump-2024');
      return;
    }

    const marketId = args.join(' ');
    logger.info('Price command', { userId: ctx.from?.id, marketId });

    await ctx.reply(`Fetching price for ${marketId}... (Implementation pending)`);
  });

  // Subscribe command - Real-time price alerts
  bot.command('subscribe', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      await ctx.reply(
        '❓ Please specify a market.\n\n' +
          'Example: /subscribe trump 2024\n\n' +
          'I will send you real-time alerts when the price changes significantly!'
      );
      return;
    }

    const query = args.join(' ');
    const userId = ctx.from!.id;
    logger.info('Subscribe command', { userId, query });

    try {
      await ctx.reply('🔍 Searching for market...');

      // Find the market
      const market = await findMarket(query);
      if (!market) {
        await ctx.reply(
          `❌ Could not find market matching "${query}".\n\n` +
            'Try a different search term or use /markets to browse.'
        );
        return;
      }

      // Get the first token ID for subscription
      const tokenId = market.tokens?.[0]?.token_id;
      if (!tokenId) {
        await ctx.reply('❌ This market does not have tradable tokens.');
        return;
      }

      // Subscribe to price alerts
      const success = wsMonitor.subscribeToMarket(
        userId,
        tokenId,
        market.question,
        botConfig.websocket.priceChangeThreshold
      );

      if (!success) {
        await ctx.reply('⚠️ You are already subscribed to this market.');
        return;
      }

      // Get current price to show
      const currentPrice = market.tokens?.[0]?.price
        ? (parseFloat(market.tokens[0].price) * 100).toFixed(1)
        : 'N/A';

      await ctx.reply(
        `✅ **Subscribed to price alerts!**\n\n` +
          `📊 **Market:** ${market.question}\n\n` +
          `💰 **Current Price:** ${currentPrice}%\n` +
          `🔔 **Alert Threshold:** ${botConfig.websocket.priceChangeThreshold}% change\n\n` +
          `You'll get instant alerts via WebSocket when the price moves!\n\n` +
          `• View all: /list\n` +
          `• Track whales: /whale ${query}\n` +
          `• Unsubscribe: /unsubscribe ${query}`,
        { parse_mode: 'Markdown' }
      );

      logger.info('User subscribed to market', { userId, tokenId, market: market.question });
    } catch (error) {
      logger.error('Error in subscribe command', error);
      await ctx.reply('❌ An error occurred. Please try again later.');
    }
  });

  // Unsubscribe command
  bot.command('unsubscribe', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      await ctx.reply(
        '❓ Please specify a market.\n\n' +
          'Example: /unsubscribe trump 2024\n\n' +
          'Use /list to see your subscriptions'
      );
      return;
    }

    const query = args.join(' ');
    const userId = ctx.from!.id;
    logger.info('Unsubscribe command', { userId, query });

    try {
      await ctx.reply('🔍 Searching for market...');

      // Find the market
      const market = await findMarket(query);
      if (!market) {
        await ctx.reply(
          `❌ Could not find market matching "${query}".\n\n` +
            'Use /list to see your current subscriptions.'
        );
        return;
      }

      const tokenId = market.tokens?.[0]?.token_id;
      if (!tokenId) {
        await ctx.reply('❌ This market does not have tradable tokens.');
        return;
      }

      // Unsubscribe from alerts
      const success = wsMonitor.unsubscribeFromMarket(userId, tokenId);
      if (!success) {
        await ctx.reply('⚠️ You are not subscribed to this market.');
        return;
      }

      await ctx.reply(
        `✅ Unsubscribed from alerts!\n\n` +
          `📊 Market: ${market.question}\n\n` +
          `You will no longer receive price alerts for this market.`
      );

      logger.info('User unsubscribed from market', { userId, tokenId });
    } catch (error) {
      logger.error('Error in unsubscribe command', error);
      await ctx.reply('❌ An error occurred. Please try again later.');
    }
  });

  // Whale trade alerts command
  bot.command('whale', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      await ctx.reply(
        '🐋 Whale Trade Alerts\n\n' +
          '❓ Please specify a market.\n\n' +
          'Example: /whale trump 2024\n\n' +
          `I will alert you when large trades (>${botConfig.websocket.whaleTrademinSize} USD) occur!`
      );
      return;
    }

    const query = args.join(' ');
    const userId = ctx.from!.id;
    logger.info('Whale command', { userId, query });

    try {
      await ctx.reply('🔍 Searching for market...');

      const market = await findMarket(query);
      if (!market) {
        await ctx.reply(
          `❌ Could not find market matching "${query}".\n\n` +
            'Try a different search term.'
        );
        return;
      }

      const tokenId = market.tokens?.[0]?.token_id;
      if (!tokenId) {
        await ctx.reply('❌ This market does not have tradable tokens.');
        return;
      }

      const success = wsMonitor.subscribeToWhaleTrades(
        userId,
        tokenId,
        market.question,
        botConfig.websocket.whaleTrademinSize
      );

      if (!success) {
        await ctx.reply('⚠️ You are already subscribed to whale alerts for this market.');
        return;
      }

      await ctx.reply(
        `🐋 Subscribed to whale trade alerts!\n\n` +
          `📊 Market: ${market.question}\n\n` +
          `💰 Minimum trade size: $${botConfig.websocket.whaleTrademinSize.toLocaleString()}\n\n` +
          `You will be notified when large trades occur.\n\n` +
          `Use /list to see all subscriptions`
      );

      logger.info('User subscribed to whale alerts', { userId, tokenId });
    } catch (error) {
      logger.error('Error in whale command', error);
      await ctx.reply('❌ An error occurred. Please try again later.');
    }
  });

  // List subscriptions command
  bot.command('list', async (ctx) => {
    const userId = ctx.from!.id;
    logger.info('List command', { userId });

    try {
      const subs = wsMonitor.getUserSubscriptions(userId);

      if (subs.markets.length === 0 && subs.whales.length === 0) {
        await ctx.reply(
          '📭 You have no active subscriptions.\n\n' +
            'Use /subscribe to get price alerts\n' +
            'Use /whale to track large trades'
        );
        return;
      }

      let message = '📋 Your Subscriptions\n\n';

      if (subs.markets.length > 0) {
        message += '📈 Price Alerts:\n';
        subs.markets.forEach((sub, i) => {
          message += `${i + 1}. ${sub.marketName}\n   Alert threshold: ${sub.threshold}%\n\n`;
        });
      }

      if (subs.whales.length > 0) {
        message += '🐋 Whale Trades:\n';
        subs.whales.forEach((sub, i) => {
          message += `${i + 1}. ${sub.marketName}\n   Min size: $${sub.minSize.toLocaleString()}\n\n`;
        });
      }

      message += '\nUse /unsubscribe to remove alerts';

      await ctx.reply(message);
    } catch (error) {
      logger.error('Error in list command', error);
      await ctx.reply('❌ An error occurred. Please try again later.');
    }
  });

  // Status command - Check WebSocket connection
  bot.command('status', async (ctx) => {
    logger.info('Status command', { userId: ctx.from?.id });

    try {
      const status = wsMonitor.getStatus();

      const message =
        '🔌 WebSocket Status\n\n' +
        `Connection: ${status.connected ? '✅ Connected' : '❌ Disconnected'}\n` +
        `Active market subscriptions: ${status.marketSubscriptions}\n` +
        `Active whale subscriptions: ${status.whaleSubscriptions}\n` +
        `Total users monitoring: ${status.totalUsers}\n\n` +
        (status.connected ? 'All systems operational! 🚀' : 'Attempting to reconnect...');

      await ctx.reply(message);
    } catch (error) {
      logger.error('Error in status command', error);
      await ctx.reply('❌ An error occurred. Please try again later.');
    }
  });

  // Markets command - Show trending markets with subscribe buttons
  bot.command('markets', async (ctx) => {
    const userId = ctx.from?.id;
    logger.info('Markets command', { userId });

    try {
      await ctx.reply('🔍 Fetching trending markets...');

      const { gammaApi } = await import('@smtm/data');
      const markets = await gammaApi.getTrendingMarkets(5);

      if (markets.length === 0) {
        await ctx.reply('❌ No markets found at the moment.');
        return;
      }

      let message = '🔥 **Trending Markets**\n\n';

      markets.forEach((market, i) => {
        const price = market.tokens?.[0]?.price
          ? (parseFloat(market.tokens[0].price) * 100).toFixed(1)
          : 'N/A';

        message += `${i + 1}. **${market.question}**\n`;
        message += `   📊 Price: ${price}%\n`;
        message += `   💰 Volume: $${(market.volume / 1000000).toFixed(1)}M\n`;
        message += `   🔔 Subscribe: \`/subscribe ${market.question.slice(0, 30)}...\`\n\n`;
      });

      message +=
        '💡 **How to subscribe:**\n' +
        '• Use natural language: `/subscribe trump 2024`\n' +
        '• Or copy from above: tap any subscribe command\n' +
        '• Search anything: `/subscribe bitcoin`, `/subscribe election`';

      await ctx.reply(message, { parse_mode: 'Markdown' });
    } catch (error) {
      logger.error('Error in markets command', error);
      await ctx.reply('❌ An error occurred fetching markets. Please try again later.');
    }
  });

  // Daily tip command - Get daily rewards from Polymarket
  bot.command('daily_tip', async (ctx) => {
    logger.info('Daily_tip command', { userId: ctx.from?.id });

    try {
      await ctx.reply('🔍 Fetching today\'s highest reward market from Polymarket...');

      const topReward = await getTopRewardMarket();

      if (!topReward) {
        await ctx.reply(
          '❌ No reward markets available at the moment.\n\n' +
            'Check back later or visit: https://polymarket.com/rewards'
        );
        return;
      }

      const message = formatRewardInfo(topReward);
      await ctx.reply(message, { parse_mode: 'Markdown' });

      logger.info('Daily_tip sent', {
        userId: ctx.from?.id,
        market: topReward.question,
        rewardRate: topReward.rewardRate,
      });
    } catch (error) {
      logger.error('Error in daily_tip command', error);
      await ctx.reply(
        '❌ Sorry, I encountered an error fetching reward data.\n\n' +
          'Please try again later or visit: https://polymarket.com/rewards'
      );
    }
  });

  logger.info('Commands registered');
}
