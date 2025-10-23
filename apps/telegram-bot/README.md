# SMTM Telegram Bot

A Telegram bot for tracking prediction market prices and receiving notifications.

## Features

- Real-time price queries for prediction markets
- Subscribe to price alerts for specific markets
- Automated price monitoring with configurable thresholds
- Support for multiple market sources

## Project Structure

```
apps/telegram-bot/
├── index.ts                    # Bot entry point
├── config/
│   └── bot.ts                  # Bot configuration
├── commands/
│   └── index.ts                # Command handlers
├── services/
│   ├── price-monitor.ts        # Price monitoring service
│   └── notifications.ts        # Notification service
└── utils/
    └── logger.ts               # Logger utility
```

## Available Commands

- `/start` - Welcome message and command list
- `/help` - Help information
- `/price <market>` - Get current price for a market
- `/subscribe <market>` - Subscribe to price updates
- `/unsubscribe <market>` - Unsubscribe from price updates
- `/list` - List your subscriptions
- `/markets` - Browse popular markets

## Setup

1. Create a Telegram bot via [@BotFather](https://t.me/botfather)
2. Copy `.env.example` to `.env` and add your bot token
3. Install dependencies: `npm install`
4. Run the bot: `npm run dev:tg`

## Environment Variables

See `.env.example` for required configuration:

- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token
- `TIMEZONE` - Timezone for scheduling (default: America/New_York)
- `POLYMARKET_MARKETS_URL` - Polymarket markets API endpoint
- `POLYMARKET_PRICES_URL` - Polymarket prices API endpoint
- `LOG_LEVEL` - Logging level (default: info)

## TODO

- [ ] Implement actual Polymarket API integration
- [ ] Add database for persistent subscriptions
- [ ] Implement rate limiting
- [ ] Add inline keyboard buttons for better UX
- [ ] Add market search functionality
- [ ] Add price charts/visualizations
- [ ] Add support for multiple prediction market platforms
