# @smtm/data

Public Polymarket data fetching package. No API key required.

## Features

- **Data API**: User positions, closed positions, top holders, portfolio values
- **Gamma Markets API**: Market discovery, search, trending markets
- **CLOB API**: Real-time prices, orderbook, price history, trades
- **Utilities**: Helper functions for common operations, data formatting
- **Type-safe**: Full TypeScript support with comprehensive types

## Installation

This package is part of the SMTM monorepo workspace and is automatically available.

```typescript
import { gammaApi, dataApi, clobApi } from '@smtm/data';
```

## Quick Start

### Fetch Trending Markets

```typescript
import { gammaApi } from '@smtm/data';

const markets = await gammaApi.getTrendingMarkets(10);
markets.forEach((market) => {
  console.log(market.question);
  console.log(`Volume: ${market.volume}`);
});
```

### Get User Positions

```typescript
import { dataApi } from '@smtm/data';

const positions = await dataApi.getUserPositions({
  user: '0x56687bf447db6ffa42ffe2204a05edaa20f55839',
});

positions.forEach((pos) => {
  console.log(`${pos.outcome}: $${pos.value}`);
});
```

### Get Current Prices

```typescript
import { clobApi } from '@smtm/data';

const price = await clobApi.getCurrentPrice(tokenId);
console.log(`Current price: ${price}`);

const priceChange = await clobApi.getPriceChange(tokenId, '1d');
console.log(`24h change: ${priceChange.changePercent}%`);
```

### Search Markets

```typescript
import { gammaApi, findMarket } from '@smtm/data';

// Search by query
const results = await gammaApi.searchMarkets('trump', 5);

// Find specific market (handles slug, conditionId, or search)
const market = await findMarket('presidential-election-2024');
console.log(market.condition_id);
```

## API Clients

### Data API Client

User positions and on-chain activities (public read-only).

```typescript
import { dataApi } from '@smtm/data';

// User positions
const positions = await dataApi.getUserPositions({
  user: '0x...',
  limit: 100,
});

// Closed positions
const closed = await dataApi.getClosedPositions('0x...', 50);

// Top holders (whales)
const holders = await dataApi.getTopHolders({
  market: 'condition_id',
  limit: 50,
  minBalance: 100,
});

// Portfolio value
const value = await dataApi.getUserValue('0x...');
console.log(`Total value: $${value.value}`);

// Batch operations
const rankings = await dataApi.batchGetUserValues([
  '0x1...',
  '0x2...',
  '0x3...',
]);
```

### Gamma Markets API Client

Market discovery and metadata.

```typescript
import { gammaApi } from '@smtm/data';

// Get all markets with filters
const markets = await gammaApi.getMarkets({
  active: true,
  limit: 100,
  order: 'volume',
});

// Get specific market
const market = await gammaApi.getMarket('condition_id');

// Search markets
const results = await gammaApi.searchMarkets('election', 20);

// Get active markets
const active = await gammaApi.getActiveMarkets(50, 'volume');

// Get trending (by 24h volume)
const trending = await gammaApi.getTrendingMarkets(20);

// Get markets by tag
const politics = await gammaApi.getMarketsByTag('politics', 50);

// Get markets ending soon
const ending = await gammaApi.getMarketsEndingSoon(10);

// Find condition ID from various identifiers
const conditionId = await gammaApi.findConditionId('trump-2024');
```

### CLOB API Client

Real-time prices and orderbook.

```typescript
import { clobApi } from '@smtm/data';

// Price history
const history = await clobApi.getPricesHistory({
  market: 'token_id',
  interval: '1d', // 'max', '1d', '1w', '1m', '3m', '1y'
});

// Current orderbook
const orderbook = await clobApi.getOrderbook('token_id');
console.log(`Best bid: ${orderbook.bids[0].price}`);
console.log(`Best ask: ${orderbook.asks[0].price}`);

// Recent trades
const trades = await clobApi.getTrades('token_id', 100);

// Current price (mid-price)
const price = await clobApi.getCurrentPrice('token_id');

// Spread
const { bid, ask, spread } = await clobApi.getSpread('token_id');

// Price change
const change = await clobApi.getPriceChange('token_id', '1d');
console.log(`Change: ${change.changePercent}%`);

// Batch get prices
const prices = await clobApi.batchGetCurrentPrices([
  'token_id_1',
  'token_id_2',
]);
```

## Utility Functions

High-level helpers for common operations.

```typescript
import {
  getMarketWithPrices,
  getWhaleActivity,
  getUserPortfolio,
  getTrendingWithPriceChanges,
  findMarket,
  getMarketSnapshot,
  compareUsers,
  formatAddress,
  formatPrice,
  formatVolume,
} from '@smtm/data';

// Get market with current prices
const market = await getMarketWithPrices('condition_id');

// Get whale activity
const whales = await getWhaleActivity('condition_id', 1000);

// Get user portfolio summary
const portfolio = await getUserPortfolio('0x...');
console.log(`Value: ${formatVolume(portfolio.totalValue)}`);

// Get trending with price changes
const trending = await getTrendingWithPriceChanges(10);

// Find market by any identifier
const market = await findMarket('trump'); // slug, conditionId, or search

// Get complete market snapshot
const snapshot = await getMarketSnapshot('condition_id');

// Compare multiple users
const rankings = await compareUsers(['0x1...', '0x2...', '0x3...']);

// Format helpers
formatAddress('0x1234...5678', 4); // "0x1234...5678"
formatPrice(0.6234); // "62.3%"
formatVolume(1234567); // "$1.2M"
```

## Batch Processing with Rate Limiting

```typescript
import { batchProcess, delay } from '@smtm/data';

const wallets = ['0x1...', '0x2...', '0x3...'];

const results = await batchProcess(
  wallets,
  async (wallet) => await getUserPortfolio(wallet),
  10, // Process 10 at a time
  1000 // 1 second delay between batches
);
```

## Examples

See the `examples/` directory for complete working examples:

- `basic-usage.ts` - Comprehensive examples of all APIs
- `whale-tracker.ts` - Track whale wallets and rankings

Run examples:

```bash
tsx packages/data/examples/basic-usage.ts
tsx packages/data/examples/whale-tracker.ts
```

## API Documentation

Official Polymarket API documentation:

- [Data API Docs](https://docs.polymarket.com/#data-api)
- [Gamma Markets API Docs](https://docs.polymarket.com/#gamma-markets-api)
- [CLOB API Docs](https://docs.polymarket.com/#clob-api)

## Common Use Cases

### Track Portfolio Changes

```typescript
const address = '0x...';
const positions = await dataApi.getUserPositions({ user: address });
const value = await dataApi.getUserValue(address);

// Store and compare later
```

### Find Smart Money

```typescript
const market = await findMarket('election');
const whales = await dataApi.getTopHolders({
  market: market.condition_id,
  limit: 50,
  minBalance: 5000,
});

// Analyze whale positions
```

### Price Alerts

```typescript
const tokenId = 'token_id';
const currentPrice = await clobApi.getCurrentPrice(tokenId);
const change = await clobApi.getPriceChange(tokenId, '1d');

if (Math.abs(change.changePercent) > 5) {
  // Alert: Significant price movement!
}
```

### Market Discovery

```typescript
// Find high-volume active markets
const markets = await gammaApi.getMarkets({
  active: true,
  order: 'volume',
  limit: 50,
});

// Filter by tag
const politics = await gammaApi.getMarketsByTag('politics');
```

## TypeScript Types

All types are exported and available:

```typescript
import type {
  GammaMarket,
  Position,
  Holder,
  UserValue,
  ClosedPosition,
  PricePoint,
  Orderbook,
  Trade,
} from '@smtm/data';
```

## Error Handling

All API calls may throw errors. Wrap in try/catch:

```typescript
try {
  const positions = await dataApi.getUserPositions({ user: address });
} catch (error) {
  console.error('Failed to fetch positions:', error);
}
```

## Rate Limiting

The public APIs have rate limits. Use batch processing utilities and add delays between requests when fetching large amounts of data.

## Notes

- All APIs are public and read-only
- No authentication required
- Responses are real-time or near real-time
- Use condition IDs to identify markets uniquely
- Token IDs identify specific outcomes within markets
