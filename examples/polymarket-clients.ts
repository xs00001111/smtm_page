// Polymarket CLOB client usage examples (public vs authenticated)
// - Public client: read-only endpoints (no auth headers)
// - Trading client: order placement/cancellation (authenticated)

import { ClobClient } from "@polymarket/clob-client";

// 1) Public, unauthenticated client for read-only market data
//    IMPORTANT: Do not pass apiKey/apiSecret/timestamp/signature/passphrase
export const publicClient = new ClobClient();

// 2) Authenticated client ONLY for trading (place/cancel orders)
//    Provide your own signing function that returns a 0x-prefixed signature string.
//    Example using an injected wallet or libraries like ethers/viem (not included here).
type SigningFunction = (message: string | Uint8Array) => Promise<string>;

export function createTradingClient(params: {
  apiKey: string;
  apiSecret: string;
  walletAddress: string;
  signingFunction: SigningFunction;
}) {
  const { apiKey, apiSecret, walletAddress, signingFunction } = params;

  return new ClobClient({
    apiKey,
    apiSecret,
    walletAddress,
    signingFunction,
  });
}

// Simple error helper for consistency
function handleError(context: string, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${context} failed:`, message);
}

// 3a) Fetch trades by assetId (read-only, NO auth)
export async function fetchTradesByAssetId(assetId: string) {
  try {
    const trades = await publicClient.getTrades({ assetId });
    // Minimal output for demo purposes
    console.log(`Trades for assetId ${assetId}:`, trades?.length ?? 0);
    return trades;
  } catch (err) {
    handleError("getTrades (assetId)", err);
    throw err;
  }
}

// 3a-alt) Fetch trades by marketId (read-only, NO auth)
export async function fetchTradesByMarketId(marketId: string) {
  try {
    const trades = await publicClient.getTrades({ marketId });
    console.log(`Trades for marketId ${marketId}:`, trades?.length ?? 0);
    return trades;
  } catch (err) {
    handleError("getTrades (marketId)", err);
    throw err;
  }
}

// 3b) Fetch orderbook (read-only, NO auth)
export async function fetchOrderbookByAssetId(assetId: string) {
  try {
    const orderbook = await publicClient.getOrderbook({ assetId });
    console.log(`Orderbook for assetId ${assetId}:`, {
      bids: orderbook?.bids?.length ?? 0,
      asks: orderbook?.asks?.length ?? 0,
    });
    return orderbook;
  } catch (err) {
    handleError("getOrderbook", err);
    throw err;
  }
}

// 3c) Fetch active markets (read-only, NO auth)
export async function fetchActiveMarkets() {
  try {
    // If your SDK supports filtering, this uses it directly.
    // Otherwise, fetch all markets and filter by status === 'active'.
    const markets = await publicClient.getMarkets({ active: true } as any);
    console.log("Active markets count:", markets?.length ?? 0);
    return markets;
  } catch (err) {
    handleError("getMarkets (active)", err);
    throw err;
  }
}

// 3d) Place an order (authenticated)
export async function placeOrderExample(params: {
  apiKey: string;
  apiSecret: string;
  walletAddress: string;
  signingFunction: SigningFunction;
  input: {
    assetId: string; // e.g., "4517584991"
    side: "BUY" | "SELL";
    price: string; // e.g., "0.52"
    size: string; // e.g., "100"
    // Expiration is often seconds since epoch
    expirationEpochSeconds?: number;
  };
}) {
  const { apiKey, apiSecret, walletAddress, signingFunction, input } = params;
  const tradingClient = createTradingClient({
    apiKey,
    apiSecret,
    walletAddress,
    signingFunction,
  });

  try {
    const expirationEpochSeconds =
      input.expirationEpochSeconds ?? Math.floor(Date.now() / 1000) + 60 * 60; // +1h

    // Many SDKs expose a single placeOrder; if your version
    // uses createOrder + postOrder, adapt accordingly.
    const result = await (tradingClient as any).placeOrder({
      assetId: input.assetId,
      side: input.side,
      price: input.price,
      size: input.size,
      expiration: expirationEpochSeconds,
    });

    console.log("Order placed:", result?.orderId ?? result);
    return result;
  } catch (err) {
    handleError("placeOrder", err);
    throw err;
  }
}

// Optional: minimal demo usage (commented out to avoid accidental execution)
// (async () => {
//   await fetchTradesByAssetId("4517584991");
//   await fetchTradesByMarketId("123456");
//   await fetchOrderbookByAssetId("4517584991");
//   await fetchActiveMarkets();
//   // For placing orders, provide real credentials + signer:
//   // await placeOrderExample({
//   //   apiKey: process.env.POLY_API_KEY!,
//   //   apiSecret: process.env.POLY_API_SECRET!,
//   //   walletAddress: process.env.WALLET_ADDRESS!,
//   //   signingFunction: async (message) => {
//   //     // Implement with your wallet; must return 0x-hex signature
//   //     throw new Error("Implement signingFunction with your wallet");
//   //   },
//   //   input: {
//   //     assetId: "4517584991",
//   //     side: "BUY",
//   //     price: "0.52",
//   //     size: "100",
//   //   },
//   // });
// })();

