import { Telegraf } from 'telegraf';
import { env } from '@smtm/shared/env';
import { logger } from './utils/logger';
import { registerCommands } from './commands';
import { startPriceMonitoring } from './services/price-monitor';
import { WebSocketMonitorService } from './services/websocket-monitor';
import { botConfig } from './config/bot';
import { loadSubscriptions } from './services/subscriptions';
import { whaleAggregator } from './services/whale-aggregator';

const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

// Initialize WebSocket monitoring service
export const wsMonitor = new WebSocketMonitorService(bot);

// Register all commands
registerCommands(bot);

// Error handling
bot.catch((err, ctx) => {
  logger.error('Bot error:', err);
  ctx.reply('An error occurred. Please try again later.');
});

// Start the bot
async function start() {
  try {
    logger.info('Starting Telegram bot...');
    await whaleAggregator.load();

    // Set bot commands for menu
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Start the bot and see welcome message' },
      { command: 'help', description: 'Show help and available commands' },
      { command: 'markets', description: 'Browse hot markets' },
      { command: 'search', description: 'Search markets or whales' },
      { command: 'price', description: 'Get market price' },
      { command: 'whales', description: 'Top traders leaderboard' },
      { command: 'whales_top', description: 'Top whales over 24h/7d/30d' },
      { command: 'follow', description: 'Follow market or wallet alerts' },
      { command: 'unfollow', description: 'Stop following' },
      { command: 'list', description: 'List your follows' },
      { command: 'status', description: 'Check connection status' },
    ]);

    // Restore subscriptions from CSV before deciding to start WS
    await loadSubscriptions(wsMonitor);

    // Only start WS if enabled and there are active subscriptions; otherwise lazy-start
    const status = wsMonitor.getStatus();
    if (botConfig.websocket.enabled && (status.marketSubscriptions > 0 || status.whaleSubscriptions > 0)) {
      logger.info('WebSocket monitoring enabled');
      await wsMonitor.start();
    } else if (!botConfig.websocket.enabled) {
      logger.info('WebSocket monitoring disabled, using polling fallback');
      startPriceMonitoring(bot);
    } else {
      logger.info('No active subscriptions; WS will start on first subscription');
    }

    // Launch bot
    await bot.launch();

    logger.info('Telegram bot is running');

    // Enable graceful stop
    process.once('SIGINT', async () => {
      await wsMonitor.stop();
      bot.stop('SIGINT');
    });
    process.once('SIGTERM', async () => {
      await wsMonitor.stop();
      bot.stop('SIGTERM');
    });
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

start();
