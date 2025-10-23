// Re-export commonly used types from @smtm/data
export type { GammaMarket as Market } from '@smtm/data';
export type { Position, Holder, UserValue } from '@smtm/data';

// Legacy type for backwards compatibility
export interface Price {
  token_id: string;
  price: string;
  timestamp?: number;
}

export interface Card {
  title: string;
  lines: string[];
  url?: string;
  footer?: string;
}

export interface HandlePriceResult {
  cards: Card[];
}
