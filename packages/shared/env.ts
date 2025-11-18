import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  TIMEZONE: z.string().default('America/New_York'),
  TELEGRAM_BOT_TOKEN: z.string(),
  DISCORD_BOT_TOKEN: z.string().optional(),
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
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
  // Resolution monitor tuning
  RESOLUTION_SCAN_BASE_MINUTES: z.string().default('10'),
  RESOLUTION_SCAN_NEAR_MINUTES: z.string().default('2'),
  RESOLUTION_NEAR_WINDOW_HOURS: z.string().default('24'),
  RESOLUTION_SCAN_FINAL_SECONDS: z.string().default('30'),
  RESOLUTION_FINAL_WINDOW_MINUTES: z.string().default('60'),
});

export const env = envSchema.parse({
  TIMEZONE: process.env.TIMEZONE || 'America/New_York',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
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
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  TELEGRAM_WEBHOOK_URL: process.env.TELEGRAM_WEBHOOK_URL,
  RESOLUTION_SCAN_BASE_MINUTES: process.env.RESOLUTION_SCAN_BASE_MINUTES || '10',
  RESOLUTION_SCAN_NEAR_MINUTES: process.env.RESOLUTION_SCAN_NEAR_MINUTES || '2',
  RESOLUTION_NEAR_WINDOW_HOURS: process.env.RESOLUTION_NEAR_WINDOW_HOURS || '24',
  RESOLUTION_SCAN_FINAL_SECONDS: process.env.RESOLUTION_SCAN_FINAL_SECONDS || '30',
  RESOLUTION_FINAL_WINDOW_MINUTES: process.env.RESOLUTION_FINAL_WINDOW_MINUTES || '60',
});
