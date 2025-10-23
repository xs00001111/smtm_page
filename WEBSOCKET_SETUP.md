# Polymarket WebSocket Real-Time Alerts

This document explains the WebSocket implementation for real-time market alerts and whale tracking in the SMTM Telegram bot.

## 🚀 Features

- **Real-time price alerts** - Get instant notifications when market prices change
- **Whale trade monitoring** - Track large trades as they happen
- **No API key required** - Public WebSocket access for market data
- **Auto-reconnection** - Automatic reconnection with exponential backoff
- **Per-user subscriptions** - Each user can subscribe to different markets
- **Configurable thresholds** - Set custom price change and trade size alerts

## 📡 How It Works

The implementation uses Polymarket's official `@polymarket/real-time-data-client` package to connect to their WebSocket API.

### Available Topics

1. **clob_market** - Market data (NO AUTH REQUIRED)
   - `price_change` - Real-time price updates
   - `last_trade_price` - Latest trade prices
   - `agg_orderbook` - Orderbook aggregations
   - `tick_size_change` - Tick size updates

2. **activity** - Trade activity (NO AUTH REQUIRED)
   - `trades` - Live trade executions
   - `orders_matched` - Order matching events

3. **clob_user** - Personal orders (AUTH REQUIRED)
   - Only needed if tracking personal trades
   - Requires CLOB API credentials

## 🔧 Configuration

### Environment Variables

Add these to your `.env` file:

```bash
# WebSocket Settings
WEBSOCKET_ENABLED=true
PRICE_CHANGE_THRESHOLD=5        # Alert when price changes by 5%
WHALE_TRADE_MIN_SIZE=1000       # Alert for trades >= $1000

# Optional: CLOB API Credentials (only for personal order tracking)
POLYMARKET_API_KEY=
POLYMARKET_API_SECRET=
POLYMARKET_API_PASSPHRASE=
```

### Default Values

- **Price Change Threshold**: 5% (alerts when price moves ±5%)
- **Whale Trade Minimum**: $1,000 USD
- **Max Reconnection Attempts**: 10
- **Initial Reconnection Delay**: 5 seconds (exponential backoff)

## 💬 Telegram Commands

### Subscribe to Price Alerts

```
/subscribe trump 2024
```

You'll receive instant alerts when the price changes by the configured threshold.

### Subscribe to Whale Trades

```
/whale presidential election
```

Get notified when large trades occur in a market.

### List Your Subscriptions

```
/list
```

View all your active price alerts and whale subscriptions.

### Unsubscribe

```
/unsubscribe trump 2024
```

Stop receiving alerts for a specific market.

### Check Status

```
/status
```

View WebSocket connection status and subscription counts.

## 🏗️ Architecture

### Service Structure

```
apps/telegram-bot/
├── services/
│   ├── websocket-monitor.ts    # Main WebSocket service
│   ├── price-monitor.ts         # Fallback polling service
│   └── polymarket.ts            # REST API integration
├── commands/
│   └── index.ts                 # Command handlers
└── index.ts                     # Bot initialization
```

### Data Flow

```
Polymarket WebSocket
    ↓
RealTimeDataClient
    ↓
WebSocketMonitorService
    ↓ (filters by subscription)
Telegram Bot API
    ↓
User receives alert
```

## 🔌 WebSocket Events

### Price Change Event

```json
{
  "topic": "clob_market",
  "type": "price_change",
  "payload": {
    "asset_id": "token_id",
    "price": 0.65
  }
}
```

### Trade Event

```json
{
  "topic": "activity",
  "type": "trades",
  "payload": {
    "asset_id": "token_id",
    "side": "BUY",
    "price": 0.65,
    "size": 1000,
    "maker_address": "0x..."
  }
}
```

## 📊 Subscription Management

### In-Memory Storage

Currently, subscriptions are stored in memory using Maps:

```typescript
marketSubscriptions: Map<tokenId, Subscription[]>
whaleSubscriptions: Map<tokenId, WhaleSubscription[]>
```

### Subscription Object

```typescript
interface MarketSubscription {
  userId: number;              // Telegram user ID
  tokenId: string;             // Polymarket token ID
  marketName: string;          // Human-readable market name
  priceChangeThreshold: number; // Alert threshold (%)
  lastPrice?: number;          // Last known price
}
```

## 🔄 Reconnection Logic

The service automatically reconnects on disconnection with exponential backoff:

1. First attempt: 5 seconds
2. Second attempt: 10 seconds
3. Third attempt: 20 seconds
4. ...up to 10 attempts

After 10 failed attempts, manual restart is required.

## 🚧 Future Enhancements

### Recommended Improvements

1. **Database Storage**
   - Persist subscriptions to database
   - Survive bot restarts
   - User subscription history

2. **Advanced Filtering**
   - Price range alerts (e.g., "alert when > 70%")
   - Directional alerts (only upward/downward)
   - Time-based alerts (only during market hours)

3. **Multi-Token Subscriptions**
   - Subscribe to all outcomes in a market
   - Aggregate price movements across tokens

4. **Whale Wallet Tracking**
   - Subscribe to specific wallet addresses
   - Track portfolio changes
   - Correlation with market movements

5. **Analytics Dashboard**
   - Subscription metrics
   - Alert frequency
   - User engagement stats

6. **Rate Limiting**
   - Per-user subscription limits
   - Alert frequency throttling
   - Premium tier for unlimited subscriptions

## 🐛 Troubleshooting

### WebSocket Not Connecting

1. Check environment variables are set correctly
2. Verify `WEBSOCKET_ENABLED=true`
3. Check logs for connection errors
4. Ensure network allows WebSocket connections

### Not Receiving Alerts

1. Verify subscription with `/list` command
2. Check WebSocket status with `/status`
3. Ensure price is actually changing (check Polymarket website)
4. Verify threshold settings (lower threshold for more alerts)

### High Memory Usage

- Subscriptions are stored in memory
- Consider implementing cleanup for inactive subscriptions
- Monitor with `/status` command

## 📝 Example Usage

### Complete Workflow

```bash
# 1. User subscribes to price alerts
/subscribe trump presidential election

✅ Subscribed to price alerts!
📊 Market: Will Trump win the 2024 Presidential Election?
🔔 You will receive alerts when the price changes by 5% or more.

# 2. Price changes on Polymarket
# WebSocket receives event: price_change
# Service checks: 65% → 62% = 4.6% change
# Not triggered (< 5% threshold)

# 3. Larger price change occurs
# WebSocket receives: 62% → 58% = 6.5% change
# Alert triggered!

📈 Price Alert

Will Trump win the 2024 Presidential Election?

⚠️ 58.0%
Previous: 62.0%
Change: 6.45%

# 4. User subscribes to whale alerts
/whale trump presidential election

🐋 Subscribed to whale trade alerts!
📊 Market: Will Trump win the 2024 Presidential Election?
💰 Minimum trade size: $1,000

# 5. Large trade occurs
🐋 Whale Trade Alert

Will Trump win the 2024 Presidential Election?

💰 BUY $5,432
Price: 58.0%
Trader: 0x1234...5678
```

## 🔐 Security Notes

- No API keys stored for public topics
- User IDs are Telegram IDs (encrypted by Telegram)
- No sensitive user data collected
- WebSocket connections use WSS (encrypted)

## 📚 Related Documentation

- [Polymarket WebSocket Docs](https://docs.polymarket.com/developers/CLOB/websocket/wss-overview)
- [Real-Time Data Client](https://github.com/Polymarket/real-time-data-client)
- [POLYMARKET_API_GUIDE.md](./POLYMARKET_API_GUIDE.md)

## 🤝 Contributing

To add new features or improve the WebSocket service:

1. Edit `apps/telegram-bot/services/websocket-monitor.ts`
2. Add new command handlers in `apps/telegram-bot/commands/index.ts`
3. Update environment variables in `packages/shared/env.ts`
4. Test with the bot using `/status` and `/list` commands
5. Update this documentation

## ⚠️ Important Notes

- **No API Key Needed** for price alerts and whale tracking
- Subscriptions are currently **in-memory only** (lost on restart)
- WebSocket connection is **shared** across all users
- Consider implementing **rate limiting** for production use
- Monitor **memory usage** with many subscriptions

## 🎯 Testing

### Manual Testing

```bash
# 1. Start the bot
npm run dev:tg

# 2. Check WebSocket connection
# Look for log: "WebSocket connection established"

# 3. Subscribe to a volatile market
/subscribe meme coin

# 4. Check status
/status

# Should show:
# Connection: ✅ Connected
# Active market subscriptions: 1
```

### Testing Alerts

Use a highly volatile market for faster testing:
- Crypto price markets
- Sports game markets (live events)
- Breaking news markets

## 📈 Performance

### Expected Performance

- **Connection time**: < 2 seconds
- **Alert latency**: < 1 second from price change
- **Memory per subscription**: ~500 bytes
- **CPU usage**: Minimal (event-driven)

### Scalability

- Current design supports hundreds of users
- For thousands of users, implement:
  - Database persistence
  - Message queue for alerts
  - Multiple bot instances with load balancing

---

**Status**: ✅ Fully implemented and ready to test!

**Last Updated**: 2025-10-23
