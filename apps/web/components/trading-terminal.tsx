"use client"

import { useState, useMemo } from 'react'
import { TrendingUp, TrendingDown, Activity, Clock, Users, DollarSign, X } from 'lucide-react'

// Mock data
const MOCK_MARKET = {
  question: 'Will Bitcoin hit $100K by EOY 2025?',
  outcomes: ['Yes', 'No'],
  prices: [0.68, 0.32],
  volume: 2400000,
  liquidity: 850000,
  endDate: '2025-12-31',
}

const MOCK_ORDER_BOOK = {
  bids: [
    { price: 0.68, size: 1250, total: 850 },
    { price: 0.67, size: 2100, total: 1407 },
    { price: 0.66, size: 3450, total: 2277 },
    { price: 0.65, size: 1800, total: 1170 },
    { price: 0.64, size: 2950, total: 1888 },
  ],
  asks: [
    { price: 0.69, size: 1100, total: 759 },
    { price: 0.70, size: 1850, total: 1295 },
    { price: 0.71, size: 2200, total: 1562 },
    { price: 0.72, size: 1650, total: 1188 },
    { price: 0.73, size: 2450, total: 1789 },
  ],
}

const MOCK_RECENT_TRADES = [
  { price: 0.68, size: 450, side: 'buy', time: '14:32:15' },
  { price: 0.67, size: 230, side: 'sell', time: '14:31:42' },
  { price: 0.68, size: 680, side: 'buy', time: '14:30:18' },
  { price: 0.67, size: 125, side: 'sell', time: '14:29:55' },
  { price: 0.68, size: 340, side: 'buy', time: '14:28:22' },
]

const MOCK_MY_POSITIONS = [
  { market: 'Trump wins 2024', outcome: 'Yes', size: 100, avgPrice: 0.58, currentPrice: 0.62, pnl: 400 },
  { market: 'Fed cuts rates', outcome: 'No', size: 50, avgPrice: 0.45, currentPrice: 0.42, pnl: -150 },
]

export function TradingTerminal() {
  const [selectedOutcome, setSelectedOutcome] = useState(0)
  const [executionModalOpen, setExecutionModalOpen] = useState(false)
  const [orderSide, setOrderSide] = useState<'buy' | 'sell'>('buy')
  const [orderAmount, setOrderAmount] = useState('')
  const [orderPrice, setOrderPrice] = useState(MOCK_MARKET.prices[0].toString())

  const openExecutionModal = (side: 'buy' | 'sell') => {
    setOrderSide(side)
    setOrderPrice(MOCK_MARKET.prices[selectedOutcome].toString())
    setExecutionModalOpen(true)
  }

  const priceChange = useMemo(() => {
    // Mock price change
    return 0.05 // +5%
  }, [])

  return (
    <div className="container mx-auto px-4 py-6 max-w-[1600px]">
      {/* Market Header */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 mb-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-extrabold mb-2">{MOCK_MARKET.question}</h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted">
              <span className="inline-flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                Volume: ${(MOCK_MARKET.volume / 1_000_000).toFixed(1)}M
              </span>
              <span className="inline-flex items-center gap-1">
                <Activity className="h-4 w-4" />
                Liquidity: ${(MOCK_MARKET.liquidity / 1_000_000).toFixed(1)}M
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Ends: {MOCK_MARKET.endDate}
              </span>
            </div>
          </div>

          <div className="flex gap-4">
            {MOCK_MARKET.outcomes.map((outcome, i) => (
              <button
                key={i}
                onClick={() => setSelectedOutcome(i)}
                className={`px-6 py-3 rounded-lg border transition-all ${
                  selectedOutcome === i
                    ? 'border-teal/50 bg-teal/10 text-teal'
                    : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                }`}
              >
                <div className="text-xs text-white/60 mb-1">{outcome}</div>
                <div className="text-2xl font-bold">
                  {(MOCK_MARKET.prices[i] * 100).toFixed(1)}¢
                </div>
                <div className={`text-xs flex items-center gap-1 ${priceChange >= 0 ? 'text-teal' : 'text-red-400'}`}>
                  {priceChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {priceChange >= 0 ? '+' : ''}{(priceChange * 100).toFixed(1)}%
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column - Order Book & Trades */}
        <div className="lg:col-span-3 space-y-6">
          {/* Order Book */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="text-sm font-semibold text-white/60 mb-4">ORDER BOOK</h2>

            {/* Asks */}
            <div className="space-y-1 mb-4">
              {[...MOCK_ORDER_BOOK.asks].reverse().map((ask, i) => (
                <div key={i} className="flex items-center justify-between text-xs relative">
                  <div
                    className="absolute inset-0 bg-red-500/5"
                    style={{ width: `${(ask.size / 3500) * 100}%` }}
                  />
                  <span className="relative text-red-400 font-mono">{(ask.price * 100).toFixed(1)}¢</span>
                  <span className="relative text-white/60">{ask.size}</span>
                  <span className="relative text-white/40">{ask.total}</span>
                </div>
              ))}
            </div>

            {/* Spread */}
            <div className="py-2 border-y border-white/10 text-center mb-4">
              <div className="text-xs text-teal font-semibold">
                Spread: {((MOCK_ORDER_BOOK.asks[0].price - MOCK_ORDER_BOOK.bids[0].price) * 100).toFixed(1)}¢
              </div>
            </div>

            {/* Bids */}
            <div className="space-y-1">
              {MOCK_ORDER_BOOK.bids.map((bid, i) => (
                <div key={i} className="flex items-center justify-between text-xs relative">
                  <div
                    className="absolute inset-0 bg-teal/5"
                    style={{ width: `${(bid.size / 3500) * 100}%` }}
                  />
                  <span className="relative text-teal font-mono">{(bid.price * 100).toFixed(1)}¢</span>
                  <span className="relative text-white/60">{bid.size}</span>
                  <span className="relative text-white/40">{bid.total}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Trades */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="text-sm font-semibold text-white/60 mb-4">RECENT TRADES</h2>
            <div className="space-y-2">
              {MOCK_RECENT_TRADES.map((trade, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className={trade.side === 'buy' ? 'text-teal' : 'text-red-400'}>
                    {(trade.price * 100).toFixed(1)}¢
                  </span>
                  <span className="text-white/60">{trade.size}</span>
                  <span className="text-white/40">{trade.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Center Column - Chart & Execution */}
        <div className="lg:col-span-6 space-y-6">
          {/* Chart Placeholder */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 h-[400px] flex items-center justify-center">
            <div className="text-center text-muted">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <div className="text-sm">Price Chart</div>
              <div className="text-xs mt-1">(Coming Soon)</div>
            </div>
          </div>

          {/* Buy/Sell Buttons */}
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => openExecutionModal('buy')}
              className="h-16 rounded-xl border border-teal/30 bg-teal/10 text-teal font-bold text-lg hover:bg-teal/20 transition"
            >
              Buy {MOCK_MARKET.outcomes[selectedOutcome]}
            </button>
            <button
              onClick={() => openExecutionModal('sell')}
              className="h-16 rounded-xl border border-red-400/30 bg-red-400/10 text-red-400 font-bold text-lg hover:bg-red-400/20 transition"
            >
              Sell {MOCK_MARKET.outcomes[selectedOutcome]}
            </button>
          </div>
        </div>

        {/* Right Column - Activity Feed & Positions */}
        <div className="lg:col-span-3 space-y-6">
          {/* My Positions */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="text-sm font-semibold text-white/60 mb-4">MY POSITIONS</h2>
            <div className="space-y-3">
              {MOCK_MY_POSITIONS.map((position, i) => (
                <div key={i} className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <div className="text-xs font-semibold mb-1">{position.market}</div>
                  <div className="text-xs text-muted mb-2">{position.outcome} • {position.size} shares</div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/60">Avg: {(position.avgPrice * 100).toFixed(1)}¢</span>
                    <span className="text-white/60">Now: {(position.currentPrice * 100).toFixed(1)}¢</span>
                  </div>
                  <div className={`text-xs font-semibold mt-1 ${position.pnl >= 0 ? 'text-teal' : 'text-red-400'}`}>
                    P&L: {position.pnl >= 0 ? '+' : ''}${position.pnl}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity Feed */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <h2 className="text-sm font-semibold text-white/60 mb-4 inline-flex items-center gap-2">
              <Users className="h-4 w-4" />
              ACTIVITY FEED
            </h2>
            <div className="space-y-3">
              <ActivityItem
                user="CryptoWhale"
                action="bought"
                amount={2500}
                outcome="Yes"
                price={0.68}
                time="2m ago"
              />
              <ActivityItem
                user="DegenTrader"
                action="sold"
                amount={1200}
                outcome="Yes"
                price={0.67}
                time="5m ago"
              />
              <ActivityItem
                user="AlphaSeeker"
                action="bought"
                amount={850}
                outcome="No"
                price={0.32}
                time="8m ago"
              />
              <ActivityItem
                user="MarketMaker"
                action="bought"
                amount={3400}
                outcome="Yes"
                price={0.68}
                time="12m ago"
              />
              <ActivityItem
                user="SmartMoney"
                action="sold"
                amount={670}
                outcome="No"
                price={0.33}
                time="15m ago"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Execution Modal */}
      {executionModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setExecutionModalOpen(false)}
        >
          <div
            className="bg-[#0F0F0F] border-2 border-white/20 rounded-xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold">
                {orderSide === 'buy' ? 'Buy' : 'Sell'} {MOCK_MARKET.outcomes[selectedOutcome]}
              </h3>
              <button
                onClick={() => setExecutionModalOpen(false)}
                className="text-white/60 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Price Input */}
              <div>
                <label className="block text-xs text-white/60 mb-2 font-semibold">PRICE</label>
                <div className="relative">
                  <input
                    type="number"
                    value={orderPrice}
                    onChange={(e) => setOrderPrice(e.target.value)}
                    className="w-full h-12 px-4 pr-8 rounded-lg border border-white/10 bg-white/[0.03] text-white font-mono text-lg focus:outline-none focus:border-teal/50"
                    step="0.01"
                    min="0"
                    max="1"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60">¢</span>
                </div>
                <div className="text-xs text-muted mt-1">
                  Best {orderSide}: {(orderSide === 'buy' ? MOCK_ORDER_BOOK.bids[0].price : MOCK_ORDER_BOOK.asks[0].price) * 100}¢
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-xs text-white/60 mb-2 font-semibold">AMOUNT ($)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60">$</span>
                  <input
                    type="number"
                    value={orderAmount}
                    onChange={(e) => setOrderAmount(e.target.value)}
                    className="w-full h-12 pl-8 pr-4 rounded-lg border border-white/10 bg-white/[0.03] text-white font-mono text-lg focus:outline-none focus:border-teal/50"
                    placeholder="0.00"
                    step="10"
                    min="0"
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  {[10, 25, 50, 100].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setOrderAmount(amount.toString())}
                      className="flex-1 py-1 rounded border border-white/10 bg-white/[0.02] text-xs hover:bg-white/[0.06] transition"
                    >
                      ${amount}
                    </button>
                  ))}
                </div>
              </div>

              {/* Shares Estimate */}
              {orderAmount && orderPrice && (
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-white/60">Estimated Shares:</span>
                    <span className="font-semibold">
                      {Math.floor(parseFloat(orderAmount) / parseFloat(orderPrice))}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-white/60">Max Payout:</span>
                    <span className="font-semibold text-teal">
                      ${(Math.floor(parseFloat(orderAmount) / parseFloat(orderPrice)) * 1).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Execute Button */}
              <button
                className={`w-full h-14 rounded-lg font-bold text-lg transition ${
                  orderSide === 'buy'
                    ? 'bg-teal text-black hover:opacity-90'
                    : 'bg-red-500 text-white hover:opacity-90'
                }`}
              >
                {orderSide === 'buy' ? 'Place Buy Order' : 'Place Sell Order'}
              </button>

              <div className="text-xs text-center text-muted">
                This is a mock interface. No real trades will be executed.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ActivityItem({
  user,
  action,
  amount,
  outcome,
  price,
  time,
}: {
  user: string
  action: 'bought' | 'sold'
  amount: number
  outcome: string
  price: number
  time: string
}) {
  return (
    <div className="text-xs">
      <div className="flex items-center justify-between mb-1">
        <span className="font-semibold">{user}</span>
        <span className="text-white/40">{time}</span>
      </div>
      <div className="text-white/60">
        <span className={action === 'bought' ? 'text-teal' : 'text-red-400'}>{action}</span> ${amount}{' '}
        <span className="text-white/80">{outcome}</span> @ {(price * 100).toFixed(1)}¢
      </div>
    </div>
  )
}
