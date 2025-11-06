import { Telegraf } from 'telegraf';
import { env } from '@smtm/shared/env';
import { logger } from './utils/logger';
import { registerCommands } from './commands';
import { startPriceMonitoring } from './services/price-monitor';
import { WebSocketMonitorService } from './services/websocket-monitor';
import { botConfig } from './config/bot';
import { loadSubscriptions } from './services/subscriptions';
import { loadLinks } from './services/links';

const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

// Initialize WebSocket monitoring service
export const wsMonitor = new WebSocketMonitorService(bot);

// Register all commands
registerCommands(bot);

// Error handling
bot.catch((err, ctx) => {
  logger.error({ err, update: ctx.update }, 'Bot error');
  console.error('Bot runtime error:', err);
  try {
    ctx.reply('An error occurred. Please try again later.').catch(() => {});
  } catch {}
});

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Promise Rejection');
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Uncaught Exception');
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Start the bot
async function start() {
  try {
    logger.info('Starting Telegram bot...');

    // Set bot commands for menu
    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Start the bot and see welcome message' },
      { command: 'help', description: 'Show help and available commands' },
      { command: 'link', description: 'Link your Polymarket profile' },
      { command: 'unlink', description: 'Unlink all connected profiles' },
      { command: 'stats', description: 'Show stats for an address or profile' },
      { command: 'profile_card', description: 'Create a profile card' },
      { command: 'trade_card', description: 'Create a trade card' },
      { command: 'whale_card', description: 'Create a whale card' },
      { command: 'markets', description: 'Browse hot markets' },
      { command: 'search', description: 'Search markets or whales' },
      { command: 'price', description: 'Get market price' },
      { command: 'net', description: 'Net positions by user for a market' },
      { command: 'overview', description: 'Market sides, holders, pricing' },
      { command: 'whales', description: 'Top traders leaderboard' },
      { command: 'follow', description: 'Follow market or wallet alerts' },
      { command: 'unfollow', description: 'Stop following' },
      { command: 'list', description: 'List your follows' },
      { command: 'status', description: 'Check connection status' },
    ]);

    // Restore stored data before deciding to start WS
    await loadLinks();
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

    // Launch bot with retry logic for 409 conflicts
    let retries = 0;
    const maxRetries = 5;

    const useWebhook = Boolean(process.env.TELEGRAM_WEBHOOK_URL);
    while (retries < maxRetries) {
      try {
        if (useWebhook) {
          // Webhook mode (avoids 409 from multiple polling instances)
          const url = process.env.TELEGRAM_WEBHOOK_URL as string;
          const path = new URL(url).pathname || '/telegram-webhook';
          await bot.telegram.setWebhook(url);
          const { createServer } = await import('http');
          const server = createServer((req, res) => {
            if (req.url === path && req.method === 'POST') {
              (bot.webhookCallback(path) as any)(req, res);
            } else {
              res.statusCode = 200; res.end('ok');
            }
          });
          const port = Number(process.env.PORT || 3000);
          server.listen(port);
          logger.info('Telegram bot webhook server listening', { port, path });
          break; // launched
        } else {
          // Polling mode
          await bot.launch({ dropPendingUpdates: true });
        }
        logger.info('Telegram bot is running');
        break;
      } catch (error: any) {
        if (!useWebhook && error?.response?.error_code === 409 && retries < maxRetries - 1) {
          retries++;
          const delay = Math.min(1000 * Math.pow(2, retries), 30000); // exponential backoff, max 30s
          logger.warn(`409 conflict detected, retrying in ${delay}ms (attempt ${retries}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }

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
    logger.error({ err: error }, 'Failed to start bot');
    console.error('Full error details:', error);
    process.exit(1);
  }
}

start();
