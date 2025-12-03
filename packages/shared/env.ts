import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  TIMEZONE: z.string().default('America/New_York'),
  // Make optional so non-bot processes (e.g., Next dev) don't fail parsing
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  DISCORD_BOT_TOKEN: z.string().optional(),
  POLYMARKET_MARKETS_URL: z.string().url().default('https://gamma-api.polymarket.com/markets'),
  POLYMARKET_PRICES_URL: z.string().url().default('https://clob.polymarket.com/prices-history'),
  // Optional CLOB API credentials (only needed for clob_user topic)
  POLYMARKET_API_KEY: z.string().optional(),
  POLYMARKET_API_SECRET: z.string().optional(),
  POLYMARKET_API_PASSPHRASE: z.string().optional(),
  // WebSocket settings
  WEBSOCKET_ENABLED: z.string().default('true'),
  WEBSOCKET_INCLUDE_AGG_ORDERBOOK: z.string().default('false'),
  PRICE_CHANGE_THRESHOLD: z.string().default('5'),
  WHALE_TRADE_MIN_SIZE: z.string().default('1000'),
  // Alpha cooldowns (seconds)
  ALPHA_COOLDOWN_WHALE_SECONDS: z.string().default('90'),
  ALPHA_COOLDOWN_SKEW_SECONDS: z.string().default('240'),
  ALPHA_COOLDOWN_INSIDER_SECONDS: z.string().default('240'),
  TELEGRAM_SUBSCRIPTIONS_FILE: z.string().default('apps/telegram-bot/data/subscriptions.csv'),
  TELEGRAM_LINKS_FILE: z.string().default('apps/telegram-bot/data/links.csv'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_ALPHA_ENABLED: z.string().default('true'),
  SUPABASE_ANALYTICS_ENABLED: z.string().default('false'),
  TELEGRAM_WEBHOOK_URL: z.string().url().optional(),
  // Resolution monitor tuning
  RESOLUTION_MONITOR_ENABLED: z.string().default('false'),
  RESOLUTION_SCAN_BASE_MINUTES: z.string().default('10'),
  RESOLUTION_SCAN_NEAR_MINUTES: z.string().default('2'),
  RESOLUTION_NEAR_WINDOW_HOURS: z.string().default('24'),
  RESOLUTION_SCAN_FINAL_SECONDS: z.string().default('30'),
  RESOLUTION_FINAL_WINDOW_MINUTES: z.string().default('60'),
  // Alpha fetch window
  ALPHA_FRESH_WINDOW_SECONDS: z.string().default('600'),
  // Alpha harvester (disabled by default - requires special CLOB API access)
  ALPHA_HARVEST_ENABLED: z.string().default('false'),
  ALPHA_HARVEST_INTERVAL_MS: z.string().default('180000'),
  // Observer refresh
  OBSERVER_REFRESH_ENABLED: z.string().default('true'),
  OBSERVER_REFRESH_INTERVAL_MS: z.string().default('300000'),
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
  WEBSOCKET_INCLUDE_AGG_ORDERBOOK: process.env.WEBSOCKET_INCLUDE_AGG_ORDERBOOK || 'false',
  PRICE_CHANGE_THRESHOLD: process.env.PRICE_CHANGE_THRESHOLD || '5',
  WHALE_TRADE_MIN_SIZE: process.env.WHALE_TRADE_MIN_SIZE || '1000',
  ALPHA_COOLDOWN_WHALE_SECONDS: process.env.ALPHA_COOLDOWN_WHALE_SECONDS || '90',
  ALPHA_COOLDOWN_SKEW_SECONDS: process.env.ALPHA_COOLDOWN_SKEW_SECONDS || '240',
  ALPHA_COOLDOWN_INSIDER_SECONDS: process.env.ALPHA_COOLDOWN_INSIDER_SECONDS || '240',
  TELEGRAM_SUBSCRIPTIONS_FILE: process.env.TELEGRAM_SUBSCRIPTIONS_FILE || 'apps/telegram-bot/data/subscriptions.csv',
  TELEGRAM_LINKS_FILE: process.env.TELEGRAM_LINKS_FILE || 'apps/telegram-bot/data/links.csv',
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ALPHA_ENABLED: process.env.SUPABASE_ALPHA_ENABLED || 'true',
  SUPABASE_ANALYTICS_ENABLED: process.env.SUPABASE_ANALYTICS_ENABLED || 'false',
  TELEGRAM_WEBHOOK_URL: process.env.TELEGRAM_WEBHOOK_URL,
  RESOLUTION_MONITOR_ENABLED: process.env.RESOLUTION_MONITOR_ENABLED || 'false',
  RESOLUTION_SCAN_BASE_MINUTES: process.env.RESOLUTION_SCAN_BASE_MINUTES || '10',
  RESOLUTION_SCAN_NEAR_MINUTES: process.env.RESOLUTION_SCAN_NEAR_MINUTES || '2',
  RESOLUTION_NEAR_WINDOW_HOURS: process.env.RESOLUTION_NEAR_WINDOW_HOURS || '24',
  RESOLUTION_SCAN_FINAL_SECONDS: process.env.RESOLUTION_SCAN_FINAL_SECONDS || '30',
  RESOLUTION_FINAL_WINDOW_MINUTES: process.env.RESOLUTION_FINAL_WINDOW_MINUTES || '60',
  ALPHA_FRESH_WINDOW_SECONDS: process.env.ALPHA_FRESH_WINDOW_SECONDS || '600',
  ALPHA_HARVEST_ENABLED: process.env.ALPHA_HARVEST_ENABLED || 'false',
  ALPHA_HARVEST_INTERVAL_MS: process.env.ALPHA_HARVEST_INTERVAL_MS || '180000',
  OBSERVER_REFRESH_ENABLED: process.env.OBSERVER_REFRESH_ENABLED || 'true',
  OBSERVER_REFRESH_INTERVAL_MS: process.env.OBSERVER_REFRESH_INTERVAL_MS || '300000',
});
