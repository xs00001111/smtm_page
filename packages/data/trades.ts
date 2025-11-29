export interface RawTrade {
  ts: number
  tokenId: string
  wallet: string | null
  price: number
  size: number
  notional: number
}

class TradeBufferImpl {
  private buf: RawTrade[] = []
  private max = 2000

  handleTrade(payload: any): void {
    const tokenId = payload.asset_id || payload.token_id
    const price = parseFloat(payload.price || '0')
    const size = parseFloat(payload.size || payload.amount || '0')
    const wallet = (payload.maker_address || payload.maker || null)
    if (!tokenId || !Number.isFinite(price) || !Number.isFinite(size) || size <= 0) return
    const ts = Date.now()
    const notional = price * size
    this.buf.push({ ts, tokenId, wallet, price, size, notional })
    if (this.buf.length > this.max) this.buf.splice(0, this.buf.length - this.max)
  }

  getTrades(limit = 200, opts?: { sinceMs?: number; tokenIds?: string[]; wallet?: string }): RawTrade[] {
    const sinceMs = opts?.sinceMs ?? 60 * 60 * 1000
    const cutoff = Date.now() - sinceMs
    const tokens = opts?.tokenIds ? new Set(opts.tokenIds) : null
    const wallet = opts?.wallet?.toLowerCase()
    const filtered = this.buf.filter(t => t.ts >= cutoff && (!tokens || tokens.has(t.tokenId)) && (!wallet || (t.wallet || '').toLowerCase() === wallet))
    return filtered.slice(-Math.max(1, Math.min(limit, this.max)))
  }
}

export const TradeBuffer = new TradeBufferImpl()

