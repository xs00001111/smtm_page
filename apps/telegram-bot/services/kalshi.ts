// Minimal Kalshi service adapter
// Kalshi's trading/user APIs typically require authentication and do not expose
// public unauthenticated user portfolio endpoints. If a public endpoint becomes
// available, wire it here and return normalized data for the /stats command.

export type KalshiUserStats = {
  username: string
  // Extend with fields once an API is available
  // e.g., totalValue, realizedPnl, openPositions, etc.
}

export async function getKalshiUserStats(_username: string): Promise<KalshiUserStats | null> {
  // Placeholder: return null to indicate no free public API integration
  return null
}

