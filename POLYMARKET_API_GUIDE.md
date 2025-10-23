# Polymarket API Quick Reference

Complete guide to crawling public Polymarket data with no API key required.

## Available APIs

### 1. Data API (On-chain activities)
**Base URL**: `https://data-api.polymarket.com`

- ✅ Public read-only
- ✅ No authentication required
- 📊 User positions, holders, portfolio values

### 2. Gamma Markets API (Market metadata)
**Base URL**: `https://gamma-api.polymarket.com`

- ✅ Public read-only
- ✅ No authentication required
- 📈 Market discovery, search, trending

### 3. CLOB API (Prices & orderbook)
**Base URL**: `https://clob.polymarket.com`

- ✅ Public read-only
- ✅ No authentication required
- 💰 Real-time prices, orderbook, trades

## Quick Start

### Installation

```bash
npm install
```

### Run Examples

```bash
# Basic usage examples
npm run example:basic

# Whale tracker example
npm run example:whales
```

## Common Patterns

### 1. Find a Market

```typescript
import { gammaApi, findMarket } from '@smtm/data';

// By search query
const market = await findMarket('presidential election');

// By slug
const market = await gammaApi.getMarketBySlug('trump-2024');

// By condition ID
const market = await gammaApi.getMarket('0x...');
```

### 2. Get Current Prices

```typescript
import { clobApi, getMarketWithPrices } from '@smtm/data';

// For a single token
const price = await clobApi.getCurrentPrice(tokenId);

// For entire market with all outcomes
const market = await getMarketWithPrices(conditionId);
```

### 3. Track Whale Wallets

```typescript
import { dataApi, getUserPortfolio } from '@smtm/data';

// Get user positions
const positions = await dataApi.getUserPositions({ user: '0x...' });

// Get portfolio value
const value = await dataApi.getUserValue('0x...');

// Get complete portfolio
const portfolio = await getUserPortfolio('0x...');
```

### 4. Find Whales in a Market

```typescript
import { dataApi } from '@smtm/data';

const holders = await dataApi.getTopHolders({
  market: conditionId,
  limit: 50,
  minBalance: 1000,
});
```

## API Endpoints Reference

### Data API Endpoints

| Endpoint | Description | Parameters |
|----------|-------------|------------|
| `GET /positions` | User's open positions | `user`, `limit`, `offset` |
| `GET /closed-positions` | User's closed positions | `user`, `limit`, `offset` |
| `GET /holders` | Top holders for market | `market`, `limit`, `minBalance` |
| `GET /value` | Total portfolio value | `user` |

### Gamma Markets API Endpoints

| Endpoint | Description | Parameters |
|----------|-------------|------------|
| `GET /markets` | List markets | `limit`, `offset`, `active`, `order`, `tag` |
| `GET /markets/:id` | Get specific market | `condition_id` |
| `GET /markets?slug=X` | Get market by slug | `slug` |
| `GET /markets?search=X` | Search markets | `search`, `limit` |

### CLOB API Endpoints

| Endpoint | Description | Parameters |
|----------|-------------|------------|
| `GET /prices-history` | Historical prices | `market`, `interval`, `fidelity` |
| `GET /book` | Current orderbook | `token_id` |
| `GET /trades` | Recent trades | `asset_id`, `limit` |

## Data Flow

```
1. Find Market (Gamma API)
   ↓
2. Get condition_id
   ↓
3. Get token_ids from market.tokens
   ↓
4. Fetch Prices (CLOB API)
   ↓
5. Fetch Holders (Data API)
```

## Example: Complete Market Analysis

```typescript
import {
  findMarket,
  getMarketSnapshot,
  formatVolume,
  formatPrice,
} from '@smtm/data';

// 1. Find the market
const market = await findMarket('presidential election');

// 2. Get complete snapshot
const snapshot = await getMarketSnapshot(market.condition_id);

// 3. Display results
console.log(snapshot.market.question);
console.log(`Volume: ${formatVolume(snapshot.stats.volume)}`);

snapshot.market.tokens?.forEach((token) => {
  console.log(`${token.outcome}: ${formatPrice(token.price)}`);
});

// 4. Get top holders
snapshot.holders.forEach((th) => {
  console.log(`Token: ${th.token}`);
  th.holders.forEach((h) => {
    console.log(`  ${h.address}: ${h.balance}`);
  });
});
```

## cURL Examples

### Get Trending Markets
```bash
curl "https://gamma-api.polymarket.com/markets?active=true&limit=10&order=volume_24hr"
```

### Get User Positions
```bash
curl "https://data-api.polymarket.com/positions?user=0x56687bf447db6ffa42ffe2204a05edaa20f55839"
```

### Get Top Holders
```bash
curl "https://data-api.polymarket.com/holders?market=0xabcdef...&limit=50&minBalance=100"
```

### Get Price History
```bash
curl "https://clob.polymarket.com/prices-history?market=token_id&interval=1d"
```

## TypeScript Integration

All APIs are fully typed:

```typescript
import type {
  GammaMarket,
  Position,
  Holder,
  UserValue,
  Orderbook,
  Trade,
  PricePoint,
} from '@smtm/data';
```

## Utilities

### Formatting Helpers

```typescript
import { formatAddress, formatPrice, formatVolume } from '@smtm/data';

formatAddress('0x1234567890abcdef', 4); // "0x1234...cdef"
formatPrice(0.6234); // "62.3%"
formatVolume(1234567); // "$1.2M"
```

### Batch Processing

```typescript
import { batchProcess } from '@smtm/data';

const results = await batchProcess(
  wallets,
  async (wallet) => await fetchData(wallet),
  10,   // batch size
  1000  // delay in ms
);
```

## Rate Limiting

- Public APIs have rate limits
- Use batch processing with delays
- Default timeout: 10 seconds
- Recommended delay between batches: 500-1000ms

## Project Structure

```
packages/data/
├── clients/
│   ├── data-api.ts       # Data API client
│   ├── gamma-api.ts      # Gamma Markets API client
│   └── clob-api.ts       # CLOB API client
├── examples/
│   ├── basic-usage.ts    # Comprehensive examples
│   └── whale-tracker.ts  # Whale tracking example
├── types.ts              # TypeScript types
├── utils.ts              # Helper functions
├── index.ts              # Main exports
└── README.md             # Full documentation
```

## Common Use Cases

### 1. Market Discovery Bot
```typescript
const trending = await gammaApi.getTrendingMarkets(10);
// Send notifications for new trending markets
```

### 2. Price Alert Bot
```typescript
const priceChange = await clobApi.getPriceChange(tokenId, '1d');
if (Math.abs(priceChange.changePercent) > 5) {
  // Send alert!
}
```

### 3. Whale Tracker
```typescript
const portfolio = await getUserPortfolio(whaleAddress);
// Monitor changes over time
```

### 4. Market Analytics
```typescript
const snapshot = await getMarketSnapshot(conditionId);
// Analyze volume, liquidity, price trends
```

## Documentation Links

- [Polymarket Docs](https://docs.polymarket.com)
- [Data API](https://docs.polymarket.com/#data-api)
- [Gamma Markets API](https://docs.polymarket.com/#gamma-markets-api)
- [CLOB API](https://docs.polymarket.com/#clob-api)

## Support

See `packages/data/README.md` for detailed API documentation and more examples.

## Testing

Run the basic usage example to test your setup:

```bash
npm run example:basic
```

This will fetch real data from Polymarket and display it in your console.
