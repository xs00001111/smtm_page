# SMTM Telegram Bot

A Telegram bot for tracking prediction market prices and receiving notifications.

## Features

- Real-time price queries for prediction markets
- Subscribe to price alerts for specific markets
- Automated price monitoring with configurable thresholds
- Support for multiple market sources
- Opt‑in Alpha Alerts with tiers, mute, and quiet hours

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

- `/start` — Welcome message and command list
- `/help` — Help information
- `/price <market>` — Get current price for a market (id, slug, or keywords)
- `/markets [query]` — Browse hot markets or search by keywords
- `/whales [0x<market_id>|query]` — Leaderboard, whales in a market, or search traders
- `/follow <market_id|0x<wallet>[ 0x<market_id>]` — Follow market price alerts or whale trades
- `/unfollow <market_id|0x<wallet>[ 0x<market_id>]` — Stop following
- `/list` — List your follows
- `/profile_card [address|@username|profile_url]` — Create a profile card (omit args to use your linked profile)
- `/alpha` — Shows current alpha alert status and settings buttons
- `/settings` — Controls for alpha alerts (enable/disable, tier, quiet hours)
- `/mute` — Immediately disables alpha alerts

## Setup

1. Create a Telegram bot via [@BotFather](https://t.me/botfather)
2. Copy `.env.example` to `.env` and add your bot token
3. Install dependencies: `npm install`
4. Run the bot: `npm run dev:tg`

### Alpha Alerts (opt‑in)

- Alerts are off by default. Use `/start` to onboard or `/alpha` to open settings.
- Tiers:
  - `⚡ High` — send all alerts
  - `🎯 High confidence` — confidence >= 0.75 only
  - `🧠 Daily` — store alerts and deliver a digest at 09:00 server time
- Quiet hours presets let you avoid overnight pings; alerts during quiet hours are queued to your next digest.

Local storage files are created under `apps/telegram-bot/data/`:
- `alpha_prefs.json` — user preferences
- `alpha_digest.json` — queued alerts for daily digests

To send a sample alert on startup (for testing):
```
ALPHA_ALERTS_SAMPLE=true npm run dev:tg
```

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
