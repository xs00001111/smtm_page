import axios, { AxiosInstance } from 'axios';
import type {
  Position,
  PositionsParams,
  HoldersResponse,
  HoldersParams,
  UserValue,
  ClosedPosition,
  LeaderboardEntry,
  LeaderboardParams,
} from '../types';

/**
 * Polymarket Data API Client
 * Public read-only API for on-chain holdings and activities
 * Docs: https://docs.polymarket.com/#data-api
 */
export class DataApiClient {
  private client: AxiosInstance;
  private baseURL = 'https://data-api.polymarket.com';

  constructor(timeout = 10000) {
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Get open positions for a user
   * @param params - User address and optional pagination
   * @returns Array of positions
   */
  async getUserPositions(params: PositionsParams): Promise<Position[]> {
    const { data } = await this.client.get<Position[]>('/positions', {
      params: {
        user: params.user,
        limit: params.limit,
        offset: params.offset,
      },
    });
    return data;
  }

  /**
   * Get closed positions for a user
   * @param user - User's Ethereum address (0x...)
   * @param limit - Max number of positions to return
   * @param offset - Pagination offset
   * @returns Array of closed positions
   */
  async getClosedPositions(
    user: string,
    limit?: number,
    offset?: number
  ): Promise<ClosedPosition[]> {
    const { data } = await this.client.get<ClosedPosition[]>('/closed-positions', {
      params: { user, limit, offset },
    });
    return data;
  }

  /**
   * Get top holders (whales) for a specific market
   * @param params - Market condition ID and filters
   * @returns Array of holder data per token
   */
  async getTopHolders(params: HoldersParams): Promise<HoldersResponse[]> {
    const { data } = await this.client.get<HoldersResponse[]>('/holders', {
      params: {
        market: params.market,
        limit: params.limit || 50,
        minBalance: params.minBalance || 100,
      },
    });
    return data;
  }

  /**
   * Get total portfolio value for a user
   * @param user - User's Ethereum address (0x...)
   * @returns User value data
   */
  async getUserValue(user: string): Promise<UserValue> {
    const { data } = await this.client.get<UserValue>('/value', {
      params: { user },
    });
    return data;
  }

  /**
   * Get top traders from the Polymarket leaderboard
   * @param params - Limit and offset for pagination
   * @returns Array of leaderboard entries sorted by PnL
   */
  async getLeaderboard(params?: LeaderboardParams): Promise<LeaderboardEntry[]> {
    const { data } = await this.client.get<LeaderboardEntry[]>('/leaderboard', {
      params: {
        limit: params?.limit || 50,
        offset: params?.offset || 0,
      },
    });
    return data;
  }

  /**
   * Batch fetch positions for multiple users
   * Useful for tracking known wallets
   * @param addresses - Array of Ethereum addresses
   * @returns Map of address to positions
   */
  async batchGetUserPositions(
    addresses: string[]
  ): Promise<Map<string, Position[]>> {
    const results = new Map<string, Position[]>();

    // Fetch in parallel with rate limiting consideration
    const promises = addresses.map(async (address) => {
      try {
        const positions = await this.getUserPositions({ user: address });
        results.set(address, positions);
      } catch (error) {
        console.error(`Failed to fetch positions for ${address}:`, error);
        results.set(address, []);
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Batch fetch user values for multiple addresses
   * Useful for leaderboards/rankings
   * @param addresses - Array of Ethereum addresses
   * @returns Map of address to value data
   */
  async batchGetUserValues(
    addresses: string[]
  ): Promise<Map<string, UserValue>> {
    const results = new Map<string, UserValue>();

    const promises = addresses.map(async (address) => {
      try {
        const value = await this.getUserValue(address);
        results.set(address, value);
      } catch (error) {
        console.error(`Failed to fetch value for ${address}:`, error);
        results.set(address, { user: address, value: '0' });
      }
    });

    await Promise.all(promises);
    return results;
  }
}

// Export singleton instance
export const dataApi = new DataApiClient();

// Export factory function for custom configurations
export function createDataApiClient(timeout?: number): DataApiClient {
  return new DataApiClient(timeout);
}
