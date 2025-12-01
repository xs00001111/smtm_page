import axios, { AxiosInstance } from 'axios';
import { createHash } from 'crypto';
import type {
  PricesHistoryResponse,
  PricesHistoryParams,
  Orderbook,
  Trade,
} from '../types';

let Wallet: any = null;
try {
  const ethers = require('ethers');
  Wallet = ethers.Wallet;
} catch {
  // ethers not available
}

let ClobClient: any = null;
async function loadClobSdk(): Promise<any | null> {
  if (ClobClient) return ClobClient;
  try {
    // Try ESM import
    const mod = await import('@polymarket/clob-client');
    ClobClient = (mod as any).ClobClient || (mod as any).default?.ClobClient || mod;
    console.log('[CLOB] ✓ Loaded @polymarket/clob-client via dynamic import');
    return ClobClient;
  } catch (e: any) {
    try {
      // Fallback to require (if available in this runtime)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('@polymarket/clob-client');
      ClobClient = mod.ClobClient || mod.default?.ClobClient || mod;
      console.log('[CLOB] ✓ Loaded @polymarket/clob-client via require');
      return ClobClient;
    } catch (e2: any) {
      console.warn('[CLOB] ✗ Failed to load @polymarket/clob-client', e?.message || e, '/', e2?.message || e2);
      return null;
    }
  }
}

/**
 * Polymarket CLOB API Client
 * Uses official @polymarket/clob-client when credentials available for authenticated endpoints
 * Falls back to direct axios for public endpoints
 * Docs: https://docs.polymarket.com/#clob-api
 */
export class ClobApiClient {
  private client: AxiosInstance;
  private officialClient: any = null; // authenticated client (when creds available)
  private publicClient: any = null;   // unauthenticated public client
  private baseURL = 'https://clob.polymarket.com';
  private apiKey?: string;
  private apiSecret?: string;
  private apiPassphrase?: string;

  constructor(timeout = 10000, credentials?: { apiKey?: string; apiSecret?: string; apiPassphrase?: string }) {
    this.apiKey = credentials?.apiKey || process.env.POLYMARKET_API_KEY;
    this.apiSecret = credentials?.apiSecret || process.env.POLYMARKET_API_SECRET;
    this.apiPassphrase = credentials?.apiPassphrase || process.env.POLYMARKET_API_PASSPHRASE;

    // Log credential availability (without exposing values)
    console.log('[CLOB] Credential check:', {
      hasApiKey: !!this.apiKey,
      hasApiSecret: !!this.apiSecret,
      hasApiPassphrase: !!this.apiPassphrase,
      hasClientClass: !!ClobClient,
    });

    // Initialize official client if credentials and package are available
    // Defer public client creation to first use to support dynamic import in ESM runtimes

    if (ClobClient && Wallet && this.apiKey && this.apiSecret && this.apiPassphrase) {
      try {
        console.log('[CLOB] Attempting to initialize official client...');
        // ApiKeyCreds is just a plain object interface
        const creds = {
          key: this.apiKey,
          secret: this.apiSecret,
          passphrase: this.apiPassphrase,
        };

        // Create or use wallet signer (needed for authenticated endpoints)
        // For read-only operations, we can use any wallet - no funds needed
        let signer;
        const signerKey = process.env.POLYMARKET_SIGNER_PRIVATE_KEY;
        if (signerKey) {
          signer = new Wallet(signerKey);
          console.log('[CLOB] Using provided signer wallet:', signer.address);
        } else {
          // Generate deterministic wallet from API key hash (valid 32-byte private key)
          const hash = createHash('sha256').update(this.apiKey).digest('hex');
          signer = new Wallet('0x' + hash);
          console.log('[CLOB] Generated deterministic read-only signer:', signer.address);
        }

        // Chain ID 137 = Polygon mainnet (Polymarket's chain)
        this.officialClient = new ClobClient(this.baseURL, 137, signer, creds);
        console.log('[CLOB] ✓ Official authenticated client initialized successfully');
      } catch (e) {
        console.error('[CLOB] ✗ Failed to initialize official client:', (e as any)?.message, (e as any)?.stack);
      }
    } else {
      const missing = [];
      if (!ClobClient) missing.push('package');
      if (!Wallet) missing.push('ethers.Wallet');
      if (!this.apiKey) missing.push('POLYMARKET_API_KEY');
      if (!this.apiSecret) missing.push('POLYMARKET_API_SECRET');
      if (!this.apiPassphrase) missing.push('POLYMARKET_API_PASSPHRASE');
      console.log('[CLOB] ⚠ Skipping authenticated client - missing:', missing.join(', '));
    }

    // Always create axios fallback
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // Keep a neutral UA; avoid Origin/Referer which can trigger stricter checks
        'User-Agent': 'smtm-bot/1.0 (+https://smtm.ai)'
      },
    });
  }

  /**
   * Get historical prices for a market
   * @param params - Market identifier and time range
   * @returns Price history data
   */
  async getPricesHistory(params: PricesHistoryParams): Promise<PricesHistoryResponse> {
    const { data } = await this.client.get<PricesHistoryResponse>('/prices-history', {
      params: {
        market: params.market,
        interval: params.interval || 'max',
        fidelity: params.fidelity,
      },
    });
    return data;
  }

  /**
   * Get current orderbook for a market
   * @param assetId - Token ID for the outcome
   * @returns Orderbook with bids and asks
   */
  async getOrderbook(assetId: string): Promise<Orderbook> {
    try {
      const { data } = await this.client.get<Orderbook>(`/book`, {
        params: { token_id: assetId },
        headers: { Authorization: undefined as any },
      });
      return data;
    } catch (err: any) {
      const status = err?.response?.status;
      const text = err?.response?.data ? JSON.stringify(err.response.data).slice(0, 120) : String(err?.message || err);
      console.warn(`[CLOB] axios /book failed (${status}): ${text} — retrying via fetch`);
      const url = new URL(this.baseURL + '/book');
      url.searchParams.set('token_id', assetId);
      const res = await fetch(url.toString(), {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; smtm-bot/1.0; +https://smtm.ai)',
          'Origin': 'https://polymarket.com',
          'Referer': 'https://polymarket.com/',
        } as any,
      } as any);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`fetch /book ${res.status}: ${body.slice(0, 160)}`);
      }
      return (await res.json()) as Orderbook;
    }
  }

  /**
   * Get recent trades for a market
   * @param assetId - Token ID for the outcome
   * @param limit - Max number of trades
   * @returns Array of recent trades
   */
  async getTrades(assetId: string, limit = 100): Promise<Trade[]> {
    // Use public, unauthenticated HTTP endpoint for read-only trades
    try {
      const { data } = await this.client.get<Trade[]>('/trades', {
        // Use token_id which is broadly accepted
        params: { token_id: assetId, limit },
      });
      console.log(`[CLOB] Public HTTP trades returned ${Array.isArray(data) ? data.length : 0} records`);
      return Array.isArray(data) ? data.slice(0, limit) : [];
    } catch (err: any) {
      const status = err?.response?.status;
      const text = err?.response?.data ? JSON.stringify(err.response.data).slice(0, 160) : String(err?.message || err);
      console.warn(`[CLOB] axios /trades failed (${status}): ${text} — retrying via fetch`);
      const url = new URL(this.baseURL + '/trades');
      url.searchParams.set('token_id', assetId);
      url.searchParams.set('limit', String(limit));
      const res = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'smtm-bot/1.0 (+https://smtm.ai)'
        } as any,
      } as any);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`fetch /trades ${res.status}: ${body.slice(0, 200)}`);
      }
      const json = (await res.json()) as Trade[];
      console.log(`[CLOB] fetch /trades returned ${Array.isArray(json) ? json.length : 0} records`);
      return Array.isArray(json) ? json.slice(0, limit) : [];
    }
  }

  /**
   * Get current market price (mid-price from orderbook)
   * @param assetId - Token ID for the outcome
   * @returns Current mid-price or null if no orderbook
   */
  async getCurrentPrice(assetId: string): Promise<number | null> {
    try {
      const orderbook = await this.getOrderbook(assetId);

      if (!orderbook.bids?.length || !orderbook.asks?.length) {
        return null;
      }

      const bestBid = parseFloat(orderbook.bids[0].price);
      const bestAsk = parseFloat(orderbook.asks[0].price);

      return (bestBid + bestAsk) / 2;
    } catch (error) {
      console.error('Failed to get current price:', error);
      return null;
    }
  }

  /**
   * Get best bid/ask prices
   * @param assetId - Token ID for the outcome
   * @returns Best bid and ask prices
   */
  async getSpread(assetId: string): Promise<{
    bid: number | null;
    ask: number | null;
    spread: number | null;
  }> {
    try {
      const orderbook = await this.getOrderbook(assetId);

      const bid = orderbook.bids?.length
        ? parseFloat(orderbook.bids[0].price)
        : null;
      const ask = orderbook.asks?.length
        ? parseFloat(orderbook.asks[0].price)
        : null;

      const spread = bid && ask ? ask - bid : null;

      return { bid, ask, spread };
    } catch (error) {
      console.error('Failed to get spread:', error);
      return { bid: null, ask: null, spread: null };
    }
  }

  /**
   * Get price change over a time period
   * @param assetId - Token ID for the outcome
   * @param interval - Time interval
   * @returns Price change data
   */
  async getPriceChange(
    assetId: string,
    interval: '1d' | '1w' | '1m' = '1d'
  ): Promise<{
    current: number | null;
    previous: number | null;
    change: number | null;
    changePercent: number | null;
  }> {
    try {
      const history = await this.getPricesHistory({
        market: assetId,
        interval,
      });

      if (!history.history?.length) {
        return {
          current: null,
          previous: null,
          change: null,
          changePercent: null,
        };
      }

      const points = history.history;
      const current = points[points.length - 1].p;
      const previous = points[0].p;
      const change = current - previous;
      const changePercent = (change / previous) * 100;

      return { current, previous, change, changePercent };
    } catch (error) {
      console.error('Failed to get price change:', error);
      return {
        current: null,
        previous: null,
        change: null,
        changePercent: null,
      };
    }
  }

  /**
   * Get trading volume from recent trades
   * @param assetId - Token ID for the outcome
   * @param limit - Number of recent trades to analyze
   * @returns Total volume
   */
  async getRecentVolume(assetId: string, limit = 100): Promise<number> {
    try {
      const trades = await this.getTrades(assetId, limit);
      return trades.reduce((sum, trade) => {
        return sum + parseFloat(trade.size) * parseFloat(trade.price);
      }, 0);
    } catch (error) {
      console.error('Failed to get recent volume:', error);
      return 0;
    }
  }

  /**
   * Batch get current prices for multiple assets
   * @param assetIds - Array of token IDs
   * @returns Map of asset ID to price
   */
  async batchGetCurrentPrices(
    assetIds: string[]
  ): Promise<Map<string, number | null>> {
    const results = new Map<string, number | null>();

    // Fetch in parallel with consideration for rate limits
    const promises = assetIds.map(async (assetId) => {
      const price = await this.getCurrentPrice(assetId);
      results.set(assetId, price);
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Get market by condition ID
   * @param conditionId - Market condition ID (0x...)
   * @returns Market data
   */
  async getMarket(conditionId: string): Promise<any> {
    try {
      const { data } = await this.client.get(`/markets/${conditionId}`, {
        headers: { Authorization: undefined as any },
      });
      return data;
    } catch (err: any) {
      const status = err?.response?.status;
      const text = err?.response?.data ? JSON.stringify(err.response.data).slice(0, 120) : String(err?.message || err);
      console.warn(`[CLOB] axios /markets/${conditionId.slice(0,8)}.. failed (${status}): ${text} — retrying via fetch`);
      const url = `${this.baseURL}/markets/${conditionId}`;
      const res = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; smtm-bot/1.0; +https://smtm.ai)',
          'Origin': 'https://polymarket.com',
          'Referer': 'https://polymarket.com/',
        } as any,
      } as any);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`fetch /markets/${conditionId.slice(0,8)}.. ${res.status}: ${body.slice(0, 160)}`);
      }
      return await res.json();
    }
  }
}

// Export singleton instance
export const clobApi = new ClobApiClient();

// Export factory function for custom configurations
export function createClobApiClient(timeout?: number): ClobApiClient {
  return new ClobApiClient(timeout);
}
