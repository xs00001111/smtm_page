import { Telegraf } from 'telegraf';
import { env } from '@smtm/shared/env';
import { logger } from './utils/logger';
import { registerCommands } from './commands';
import { gammaApi } from '@smtm/data';
import { startPriceMonitoring } from './services/price-monitor';
import { WebSocketMonitorService } from './services/websocket-monitor';
import { botConfig } from './config/bot';
import { loadSubscriptions } from './services/subscriptions';
import { loadLinks } from './services/links';
import { initAnalyticsLogging, logAnalyticsError } from './services/analytics';
import { startResolutionMonitor } from './services/resolution-monitor';
import { startAlphaHarvester } from './services/alpha-harvester';
import { startObserverRefresh } from './services/observer-refresh';
import { startTradersHarvester } from './services/traders-harvester';
import { seedWatchlistFromSupabase } from './services/watchlist';

const token = env.TELEGRAM_BOT_TOKEN
if (!token) {
  throw new Error('TELEGRAM_BOT_TOKEN is required to run the Telegram bot')
}
const bot = new Telegraf(token);

// Initialize WebSocket monitoring service
export const wsMonitor = new WebSocketMonitorService(bot);

// Register all commands
initAnalyticsLogging(bot);
registerCommands(bot);

// Error handling
bot.catch((err, ctx) => {
  logger.error({ err, update: ctx.update }, 'Bot error');
  console.error('Bot runtime error:', err);
  // Log to analytics (best-effort)
  void logAnalyticsError(ctx, err);
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
      { command: 'alpha', description: 'Freshest alpha (whale/skew/insider)' },
      { command: 'stats', description: 'Show stats for an address or profile' },
      { command: 'profile_card', description: 'Create a profile card (self or others)' },
      { command: 'trade_card', description: 'Create a trade card' },
      { command: 'markets', description: 'Browse trending, breaking, new, or search' },
      { command: 'price', description: 'Get market price' },
      { command: 'net', description: 'Net positions by user for a market' },
      { command: 'overview', description: 'Market sides, holders, pricing' },
      { command: 'whales', description: 'Top traders, whales by market, or search' },
      { command: 'follow', description: 'Follow market or wallet alerts' },
      { command: 'unfollow', description: 'Stop following' },
      { command: 'list', description: 'List your follows' },
      { command: 'status', description: 'Check connection status' },
    ]);

    // Restore stored data before deciding to start WS
    await loadLinks();
    await loadSubscriptions(wsMonitor);
    // Pre-warm observer assets with trending markets to receive trade activity quickly
    try {
      const trending = await gammaApi.getTrendingMarkets(6)
      const tokenIds: string[] = []
      for (const m of trending) {
        for (const t of (m.tokens || [])) {
          if (t?.token_id) tokenIds.push(t.token_id)
        }
      }
      if (tokenIds.length) wsMonitor.setObserverAssets(tokenIds)
    } catch (e) {
      logger.warn('Failed to pre-warm observer assets', (e as any)?.message || e)
    }
    // Start resolution monitor to notify winners and auto-unfollow
    startResolutionMonitor(wsMonitor);
    // Start alpha harvester in background
    startAlphaHarvester();
    // Periodically refresh WS observer tokens to capture more trades
    startObserverRefresh(wsMonitor);
    // Start daily traders harvester (top 100 wallets + recent trades)
    startTradersHarvester();
    // Seed whale detector watchlist from Supabase snapshot if available
    seedWatchlistFromSupabase(1000).then((ok)=>{
      if (ok) logger.info('watchlist.seed applied from Supabase')
    }).catch(()=>{})

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

    // In polling mode, ensure any existing webhook is removed to avoid conflicts
    if (!useWebhook) {
      try {
        logger.info('Clearing any existing webhooks before polling...');
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });

        // RENDER DEPLOYMENT FIX: Add startup delay to allow old instance to die
        // Render uses zero-downtime deployments (starts new before killing old)
        // This causes 409 conflicts as both instances try to poll simultaneously
        const isRender = Boolean(process.env.RENDER || process.env.RENDER_SERVICE_ID);
        if (isRender) {
          const startupDelay = 15000; // 15 seconds
          logger.info(`Detected Render environment. Waiting ${startupDelay}ms for old instance to shutdown...`);
          logger.warn('⚠️  RECOMMENDATION: Switch to webhook mode to eliminate 409 conflicts during deployments.');
          logger.warn('⚠️  Set TELEGRAM_WEBHOOK_URL env var to: https://your-service.onrender.com/telegram-webhook');
          await new Promise(resolve => setTimeout(resolve, startupDelay));
        } else {
          // Small delay to ensure webhook is fully cleared
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (err) {
        logger.warn('Failed to clear webhook (may not exist)', err);
      }
    }

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
          // Polling mode - with extra conflict handling
          logger.info(`Starting bot in polling mode (attempt ${retries + 1}/${maxRetries})...`);
          await bot.launch({ dropPendingUpdates: true });
        }
        logger.info('Telegram bot is running');
        break;
      } catch (error: any) {
        if (!useWebhook && error?.response?.error_code === 409) {
          if (retries < maxRetries - 1) {
            retries++;
            const delay = Math.min(2000 * Math.pow(2, retries), 60000); // exponential backoff, max 60s
            logger.warn(`409 conflict detected - another instance may be running. Retrying in ${delay}ms (attempt ${retries}/${maxRetries})`);
            logger.warn('If this persists, check for multiple deployments or stuck processes.');
            await new Promise(resolve => setTimeout(resolve, delay));
            // Try to clear webhook again before retry
            try {
              await bot.telegram.deleteWebhook({ drop_pending_updates: true });
            } catch {}
          } else {
            logger.error('Max retries reached for 409 conflict. Multiple bot instances may be running. Exiting.');
            throw new Error('409 Conflict: Cannot start bot - another instance is already polling Telegram. Check your deployments.');
          }
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
