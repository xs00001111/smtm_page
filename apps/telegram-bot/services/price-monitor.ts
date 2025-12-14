import { Telegraf } from 'telegraf';
import * as cron from 'node-cron';
import { logger } from '../utils/logger';
import { botConfig } from '../config/bot';

interface Subscription {
  userId: number;
  marketId: string;
  lastPrice?: number;
}

// In-memory storage for subscriptions (TODO: move to database)
const subscriptions: Subscription[] = [];

export function startPriceMonitoring(bot: Telegraf) {
  logger.info('Starting price monitoring service');

  // Schedule price checks every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    await checkPrices(bot);
  }, {
    timezone: botConfig.timezone,
  });

  logger.info('Price monitoring service started');
}

async function checkPrices(bot: Telegraf) {
  if (subscriptions.length === 0) {
    return;
  }

  logger.info(`Checking prices for ${subscriptions.length} subscriptions`);

  for (const subscription of subscriptions) {
    try {
      // TODO: Fetch actual price from Polymarket API
      const currentPrice = Math.random() * 100; // Placeholder

      // Check if price changed significantly
      if (subscription.lastPrice) {
        const changePercent = Math.abs(
          ((currentPrice - subscription.lastPrice) / subscription.lastPrice) * 100
        );

        if (changePercent >= botConfig.priceMonitoring.changeThreshold) {
          await notifyPriceChange(
            bot,
            subscription.userId,
            subscription.marketId,
            subscription.lastPrice,
            currentPrice,
            changePercent
          );
        }
      }

      // Update last price
      subscription.lastPrice = currentPrice;
    } catch (error) {
      logger.error({
        marketId: subscription.marketId,
        error,
      }, 'Error checking price');
    }
  }
}

async function notifyPriceChange(
  bot: Telegraf,
  userId: number,
  marketId: string,
  oldPrice: number,
  newPrice: number,
  changePercent: number
) {
  const direction = newPrice > oldPrice ? '📈' : '📉';
  const message =
    `${direction} Price Alert: ${marketId}\n\n` +
    `Previous: ${oldPrice.toFixed(2)}%\n` +
    `Current: ${newPrice.toFixed(2)}%\n` +
    `Change: ${changePercent.toFixed(2)}%`;

  try {
    await bot.telegram.sendMessage(userId, message);
    logger.info({ userId, marketId, changePercent }, 'Sent price notification');
  } catch (error) {
    logger.error({ userId, marketId, error }, 'Failed to send notification');
  }
}

export function addSubscription(userId: number, marketId: string) {
  const existing = subscriptions.find(
    (s) => s.userId === userId && s.marketId === marketId
  );

  if (existing) {
    return false;
  }

  subscriptions.push({ userId, marketId });
  logger.info({ userId, marketId }, 'Added subscription');
  return true;
}

export function removeSubscription(userId: number, marketId: string) {
  const index = subscriptions.findIndex(
    (s) => s.userId === userId && s.marketId === marketId
  );

  if (index === -1) {
    return false;
  }

  subscriptions.splice(index, 1);
  logger.info({ userId, marketId }, 'Removed subscription');
  return true;
}

export function getUserSubscriptions(userId: number): string[] {
  return subscriptions
    .filter((s) => s.userId === userId)
    .map((s) => s.marketId);
}
