import { Telegraf } from 'telegraf';
import { env } from '@smtm/shared/env';
import { logger } from './utils/logger';
import { registerCommands } from './commands';
import { startPriceMonitoring } from './services/price-monitor';
import { WebSocketMonitorService } from './services/websocket-monitor';
import { botConfig } from './config/bot';

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

    // Set bot commands for menu
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Start the bot and see welcome message' },
      { command: 'daily_tip', description: 'Get today\'s highest reward market from Polymarket' },
      { command: 'help', description: 'Show help and available commands' },
      { command: 'price', description: 'Get current price for a market' },
      { command: 'subscribe', description: 'Subscribe to real-time price alerts' },
      { command: 'unsubscribe', description: 'Unsubscribe from alerts' },
      { command: 'whale', description: 'Subscribe to whale trade alerts' },
      { command: 'list', description: 'List your subscriptions' },
      { command: 'markets', description: 'Browse popular markets' },
      { command: 'status', description: 'Check WebSocket connection status' },
    ]);

    // Start WebSocket monitoring if enabled
    if (botConfig.websocket.enabled) {
      logger.info('WebSocket monitoring enabled');
      await wsMonitor.start();
    } else {
      logger.info('WebSocket monitoring disabled, using polling fallback');
      startPriceMonitoring(bot);
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
