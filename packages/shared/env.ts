import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  TIMEZONE: z.string().default('America/New_York'),
  TELEGRAM_BOT_TOKEN: z.string(),
  POLYMARKET_MARKETS_URL: z.string().url().default('https://gamma-api.polymarket.com/markets'),
  POLYMARKET_PRICES_URL: z.string().url().default('https://clob.polymarket.com/prices-history'),
  // Optional CLOB API credentials (only needed for clob_user topic)
  POLYMARKET_API_KEY: z.string().optional(),
  POLYMARKET_API_SECRET: z.string().optional(),
  POLYMARKET_API_PASSPHRASE: z.string().optional(),
  // WebSocket settings
  WEBSOCKET_ENABLED: z.string().default('true'),
  PRICE_CHANGE_THRESHOLD: z.string().default('5'),
  WHALE_TRADE_MIN_SIZE: z.string().default('1000'),
  TELEGRAM_SUBSCRIPTIONS_FILE: z.string().default('apps/telegram-bot/data/subscriptions.csv'),
  TELEGRAM_LINKS_FILE: z.string().default('apps/telegram-bot/data/links.csv'),
});

export const env = envSchema.parse({
  TIMEZONE: process.env.TIMEZONE || 'America/New_York',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  POLYMARKET_MARKETS_URL: process.env.POLYMARKET_MARKETS_URL || 'https://gamma-api.polymarket.com/markets',
  POLYMARKET_PRICES_URL: process.env.POLYMARKET_PRICES_URL || 'https://clob.polymarket.com/prices-history',
  POLYMARKET_API_KEY: process.env.POLYMARKET_API_KEY,
  POLYMARKET_API_SECRET: process.env.POLYMARKET_API_SECRET,
  POLYMARKET_API_PASSPHRASE: process.env.POLYMARKET_API_PASSPHRASE,
  WEBSOCKET_ENABLED: process.env.WEBSOCKET_ENABLED || 'true',
  PRICE_CHANGE_THRESHOLD: process.env.PRICE_CHANGE_THRESHOLD || '5',
  WHALE_TRADE_MIN_SIZE: process.env.WHALE_TRADE_MIN_SIZE || '1000',
  TELEGRAM_SUBSCRIPTIONS_FILE: process.env.TELEGRAM_SUBSCRIPTIONS_FILE || 'apps/telegram-bot/data/subscriptions.csv',
  TELEGRAM_LINKS_FILE: process.env.TELEGRAM_LINKS_FILE || 'apps/telegram-bot/data/links.csv',
});
