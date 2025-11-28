import { env } from '@smtm/shared/env';

export const botConfig = {
  // Bot token
  token: env.TELEGRAM_BOT_TOKEN,

  // Timezone for scheduling
  timezone: env.TIMEZONE,

  // Price monitoring settings
  priceMonitoring: {
    // Check prices every 5 minutes
    interval: 5 * 60 * 1000,
    // Price change threshold to trigger notification (percentage)
    changeThreshold: parseFloat(env.PRICE_CHANGE_THRESHOLD),
  },

  // WebSocket settings
  websocket: {
    enabled: env.WEBSOCKET_ENABLED === 'true',
    includeAggOrderbook: (env as any).WEBSOCKET_INCLUDE_AGG_ORDERBOOK === 'true',
    priceChangeThreshold: parseFloat(env.PRICE_CHANGE_THRESHOLD),
    whaleTrademinSize: parseFloat(env.WHALE_TRADE_MIN_SIZE),
  },

  // Alpha cooldowns (in seconds)
  alphaCooldowns: {
    whale: Math.max(10, parseInt((env as any).ALPHA_COOLDOWN_WHALE_SECONDS || '90', 10)),
    skew: Math.max(30, parseInt((env as any).ALPHA_COOLDOWN_SKEW_SECONDS || '240', 10)),
    insider: Math.max(30, parseInt((env as any).ALPHA_COOLDOWN_INSIDER_SECONDS || '240', 10)),
  },

  // Polymarket CLOB API credentials (optional)
  polymarket: {
    apiKey: env.POLYMARKET_API_KEY,
    apiSecret: env.POLYMARKET_API_SECRET,
    apiPassphrase: env.POLYMARKET_API_PASSPHRASE,
  },

  // API endpoints
  api: {
    polymarketMarkets: env.POLYMARKET_MARKETS_URL,
    polymarketPrices: env.POLYMARKET_PRICES_URL,
  },

  // Rate limiting
  rateLimit: {
    // Max messages per window
    maxMessages: 30,
    // Window duration in milliseconds (1 minute)
    windowMs: 60 * 1000,
  },
};
