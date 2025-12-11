// Export all types
export * from './types';

// Export API clients
export * from './clients/data-api';
export * from './clients/gamma-api';
// Note: clob-api depends on optional '@polymarket/clob-client'.
// Exporting it here forces Next to resolve that package during web builds.
// Keep it internal to server-only contexts to avoid bundling issues.
// export * from './clients/clob-api';

// Export utilities
export * from './utils';
export * from './whales';
export * from './whale-descriptions';
export * from './alpha';
export * from './trades';
export * from './market-movers';
