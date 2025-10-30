// Polymarket Data API Types
// https://docs.polymarket.com

// Position data from Data API
export interface Position {
  id: string;
  market: string;
  asset_id: string;
  user_address: string;
  outcome: string;
  size: string;
  value: string;
  initial_value?: string;
  pnl?: string;
  created_at?: string;
  updated_at?: string;
}

// Holder data from Data API
export interface Holder {
  address: string;
  balance: string;
  value?: string;
}

export interface HoldersResponse {
  token: string;
  holders: Holder[];
}

// User value from Data API
export interface UserValue {
  user: string;
  value: string;
  positions_count?: number;
}

// Closed position from Data API
export interface ClosedPosition {
  id: string;
  market: string;
  asset_id: string;
  user_address: string;
  outcome: string;
  size: string;
  initial_value: string;
  final_value: string;
  pnl: string;
  closed_at: string;
  created_at: string;
}

// Gamma Markets API Types

export interface Token {
  token_id: string;
  outcome: string;
  price?: string;
  winner?: boolean;
}

export interface MarketEvent {
  id: string;
  slug: string;
  title?: string;
  description?: string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
}

export interface GammaMarket {
  condition_id: string;
  question: string;
  description?: string;
  image?: string;
  icon?: string;
  market_slug?: string;
  slug?: string;
  events?: MarketEvent[];
  end_date_iso?: string;
  game_start_time?: string;
  seconds_delay?: number;
  fpmm?: string;
  maker_base_fee?: number;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  new?: boolean;
  featured?: boolean;
  submitted_by?: string;
  volume?: string;
  volume_24hr?: string;
  liquidity?: string;
  tokens?: Token[];
  rewards?: any;
  tags?: string[];
  competitive?: number;
  accepting_orders?: boolean;
  neg_risk?: boolean;
  neg_risk_market_id?: string;
  neg_risk_request_id?: string;
  question_id?: string;
}

export interface MarketsQueryParams {
  limit?: number;
  offset?: number;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  order?: 'liquidity' | 'volume' | 'volume_24hr' | 'end_date_min';
  ascending?: boolean;
  tag?: string;
}

// CLOB API Types (for prices and orderbook)

export interface PricePoint {
  t: number; // timestamp
  p: number; // price
}

export interface PricesHistoryResponse {
  history: PricePoint[];
  interval?: string;
  market?: string;
}

export interface OrderbookLevel {
  price: string;
  size: string;
}

export interface Orderbook {
  timestamp: number;
  market: string;
  asset_id: string;
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
}

export interface Trade {
  id: string;
  market: string;
  asset_id: string;
  side: 'BUY' | 'SELL';
  size: string;
  price: string;
  timestamp: number;
}

// API Response wrappers
export interface ApiResponse<T> {
  data: T;
  error?: string;
}

// Query parameter types
export interface PositionsParams {
  user: string;
  limit?: number;
  offset?: number;
}

export interface HoldersParams {
  market: string; // conditionId
  limit?: number;
  minBalance?: number;
}

export interface LeaderboardEntry {
  rank: string;
  user_id: string;
  user_name: string;
  vol: number;
  pnl: number;
  profile_image: string;
}

export interface LeaderboardParams {
  limit?: number;
  offset?: number;
}

export interface PricesHistoryParams {
  market?: string;
  interval?: 'max' | '1d' | '1w' | '1m' | '3m' | '1y';
  fidelity?: number;
}
