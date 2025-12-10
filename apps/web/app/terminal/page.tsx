"use client"

import { useState } from 'react'
import { TrendingUp, TrendingDown, Activity, Users, DollarSign, AlertCircle } from 'lucide-react'

export default function TerminalPage() {
  const [selectedOutcome, setSelectedOutcome] = useState<'YES' | 'NO'>('YES')
  const [betAmount, setBetAmount] = useState('')

  // Mock market data
  const market = {
    question: "Will Bitcoin hit $100k before January 2026?",
    yesPrice: 0.67,
    noPrice: 0.33,
    volume24h: 487250,
    liquidity: 1250000,
    alpha: 78,
    direction: 'YES' as const,
    skew: 0.82,
  }

  // Mock whale activity
  const whaleActivity = [
    { wallet: '0x742d...3f8a', side: 'YES', amount: 50000, score: 92, time: '2m ago' },
    { wallet: '0x8b91...4c2e', side: 'YES', amount: 35000, score: 87, time: '5m ago' },
    { wallet: '0x3a44...7d91', side: 'NO', amount: 25000, score: 81, time: '12m ago' },
  ]

  // Mock orderbook
  const orderbook = {
    yes: [
      { price: 0.67, size: 12500 },
      { price: 0.66, size: 8750 },
      { price: 0.65, size: 15200 },
      { price: 0.64, size: 9800 },
      { price: 0.63, size: 11200 },
    ],
    no: [
      { price: 0.33, size: 11200 },
      { price: 0.34, size: 9800 },
      { price: 0.35, size: 15200 },
      { price: 0.36, size: 8750 },
      { price: 0.37, size: 12500 },
    ],
  }

  // Mock recent trades
  const recentTrades = [
    { side: 'YES', price: 0.67, amount: 5000, time: '09:43:12' },
    { side: 'YES', price: 0.67, amount: 2500, time: '09:42:58' },
    { side: 'NO', price: 0.33, amount: 3200, time: '09:42:45' },
    { side: 'YES', price: 0.66, amount: 8500, time: '09:41:33' },
    { side: 'YES', price: 0.67, amount: 1500, time: '09:41:12' },
  ]

  const maxPayout = betAmount ? (parseFloat(betAmount) / (selectedOutcome === 'YES' ? market.yesPrice : market.noPrice)).toFixed(2) : '0.00'
  const potentialProfit = betAmount ? (parseFloat(maxPayout) - parseFloat(betAmount)).toFixed(2) : '0.00'

  return (
    <div className="min-h-screen bg-[#0C0C0C] text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0C0C0C]/70 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <a href="/" className="text-xl font-bold bg-gradient-to-r from-[#00E5FF] to-[#B6FF00] bg-clip-text text-transparent">
              SMTM Terminal
            </a>
            <div className="flex items-center gap-4">
              <span className="text-sm text-white/60">Demo Mode</span>
              <button className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#B6FF00] text-black font-semibold text-sm">
                Connect Wallet
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* Market Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">{market.question}</h1>
              <div className="flex items-center gap-4 text-sm text-white/60">
                <span>24h Volume: ${(market.volume24h / 1000).toFixed(0)}K</span>
                <span>•</span>
                <span>Liquidity: ${(market.liquidity / 1000).toFixed(0)}K</span>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="text-right">
                <div className="text-xs text-white/60 mb-1">YES</div>
                <div className="text-2xl font-bold text-teal">{(market.yesPrice * 100).toFixed(0)}%</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-white/60 mb-1">NO</div>
                <div className="text-2xl font-bold text-red-400">{(market.noPrice * 100).toFixed(0)}%</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Chart & Orderbook */}
          <div className="lg:col-span-2 space-y-6">
            {/* Chart Section */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Price Chart</h2>
                <div className="flex gap-2">
                  {['1H', '1D', '1W', '1M', 'ALL'].map((period) => (
                    <button
                      key={period}
                      className="px-3 py-1 text-xs rounded-md bg-white/5 hover:bg-white/10 transition"
                    >
                      {period}
                    </button>
                  ))}
                </div>
              </div>
              {/* Mock Chart Area */}
              <div className="relative h-80 bg-gradient-to-b from-teal/5 to-transparent rounded-lg border border-white/5">
                <svg className="w-full h-full" viewBox="0 0 800 320" preserveAspectRatio="none">
                  <defs>
                    {/* Smooth strokes and subtle glow toward the right (resolution) */}
                    <linearGradient id="yesGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.6" />
                      <stop offset="80%" stopColor="#00E5FF" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#B6FF00" stopOpacity="1" />
                    </linearGradient>
                    <linearGradient id="noGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#EF4444" stopOpacity="0.6" />
                      <stop offset="80%" stopColor="#EF4444" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#FFA3A3" stopOpacity="1" />
                    </linearGradient>
                    <filter id="yesGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="2.2" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="noGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="2.2" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  {/* Grid lines */}
                  {[0, 25, 50, 75, 100].map((y) => (
                    <line
                      key={y}
                      x1="0"
                      y1={320 - (y * 3.2)}
                      x2="800"
                      y2={320 - (y * 3.2)}
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth="1"
                    />
                  ))}

                  {/* YES line (teal) - trending up */}
                  <path
                    d="M 0 200 C 60 197, 140 190, 200 185 C 260 178, 340 170, 400 165 C 460 158, 540 148, 600 140 C 660 132, 740 116, 800 105"
                    fill="none"
                    stroke="url(#yesGrad)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#yesGlow)"
                  />

                  {/* NO line (red) - trending down */}
                  <path
                    d="M 0 120 C 60 123, 140 130, 200 135 C 260 142, 340 150, 400 155 C 460 162, 540 172, 600 180 C 660 188, 740 205, 800 215"
                    fill="none"
                    stroke="url(#noGrad)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#noGlow)"
                  />

                  {/* Volume bars at bottom */}
                  {[50, 120, 200, 280, 350, 420, 500, 580, 650, 720].map((x, i) => (
                    <rect
                      key={i}
                      x={x}
                      y={320 - (Math.random() * 30 + 10)}
                      width="40"
                      height={Math.random() * 30 + 10}
                      fill="rgba(0,229,255,0.2)"
                    />
                  ))}

                  {/* Current price marker for YES */}
                  <circle cx="800" cy="105" r="6" fill="#00E5FF" />
                  <circle cx="800" cy="105" r="4" fill="#0C0C0C" />

                  {/* Current price marker for NO */}
                  <circle cx="800" cy="215" r="6" fill="#EF4444" />
                  <circle cx="800" cy="215" r="4" fill="#0C0C0C" />
                </svg>

                {/* Price labels on the right */}
                <div className="absolute right-4 top-[30%] flex items-center gap-2 bg-[#0C0C0C] px-2 py-1 rounded border border-teal/30">
                  <div className="w-2 h-2 rounded-full bg-teal"></div>
                  <span className="text-sm font-semibold text-teal">YES 67%</span>
                </div>
                <div className="absolute right-4 bottom-[30%] flex items-center gap-2 bg-[#0C0C0C] px-2 py-1 rounded border border-red-400/30">
                  <div className="w-2 h-2 rounded-full bg-red-400"></div>
                  <span className="text-sm font-semibold text-red-400">NO 33%</span>
                </div>

                {/* Y-axis labels */}
                <div className="absolute right-2 top-0 text-xs text-white/40">100%</div>
                <div className="absolute right-2 top-1/4 text-xs text-white/40">75%</div>
                <div className="absolute right-2 top-1/2 text-xs text-white/40">50%</div>
                <div className="absolute right-2 top-3/4 text-xs text-white/40">25%</div>
                <div className="absolute right-2 bottom-0 text-xs text-white/40">0%</div>

                {/* X-axis labels */}
                <div className="absolute bottom-2 left-4 text-xs text-white/40">Dec 4</div>
                <div className="absolute bottom-2 left-1/4 text-xs text-white/40">Dec 5</div>
                <div className="absolute bottom-2 left-1/2 text-xs text-white/40">Dec 6</div>
                <div className="absolute bottom-2 right-1/4 text-xs text-white/40">Dec 7</div>
                <div className="absolute bottom-2 right-20 text-xs text-white/40">Dec 8</div>
              </div>
            </div>

            {/* Orderbook */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <h2 className="text-lg font-semibold mb-4">Order Book</h2>
              <div className="grid grid-cols-2 gap-4">
                {/* YES Orders */}
                <div>
                  <div className="text-xs text-white/60 mb-2 flex justify-between px-2">
                    <span>Price</span>
                    <span>Size</span>
                  </div>
                  {orderbook.yes.map((order, i) => (
                    <div key={i} className="relative mb-1">
                      <div
                        className="absolute inset-0 bg-teal/10 rounded"
                        style={{ width: `${(order.size / 20000) * 100}%` }}
                      />
                      <div className="relative flex justify-between px-2 py-1 text-sm">
                        <span className="text-teal font-medium">{(order.price * 100).toFixed(0)}¢</span>
                        <span className="text-white/60">${(order.size / 1000).toFixed(1)}K</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* NO Orders */}
                <div>
                  <div className="text-xs text-white/60 mb-2 flex justify-between px-2">
                    <span>Price</span>
                    <span>Size</span>
                  </div>
                  {orderbook.no.map((order, i) => (
                    <div key={i} className="relative mb-1">
                      <div
                        className="absolute inset-0 bg-red-500/10 rounded"
                        style={{ width: `${(order.size / 20000) * 100}%` }}
                      />
                      <div className="relative flex justify-between px-2 py-1 text-sm">
                        <span className="text-red-400 font-medium">{(order.price * 100).toFixed(0)}¢</span>
                        <span className="text-white/60">${(order.size / 1000).toFixed(1)}K</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Recent Trades */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <h2 className="text-lg font-semibold mb-4">Recent Trades</h2>
              <div className="space-y-2">
                <div className="text-xs text-white/60 flex justify-between px-2">
                  <span>Time</span>
                  <span>Side</span>
                  <span>Price</span>
                  <span>Amount</span>
                </div>
                {recentTrades.map((trade, i) => (
                  <div key={i} className="flex justify-between px-2 py-1.5 text-sm hover:bg-white/5 rounded">
                    <span className="text-white/60">{trade.time}</span>
                    <span className={trade.side === 'YES' ? 'text-teal font-medium' : 'text-red-400 font-medium'}>
                      {trade.side}
                    </span>
                    <span className="text-white/80">{(trade.price * 100).toFixed(0)}¢</span>
                    <span className="text-white/60">${(trade.amount / 1000).toFixed(1)}K</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Signals & Trade */}
          <div className="space-y-6">
            {/* Alpha Signal */}
            <div className="rounded-xl border border-teal/30 bg-gradient-to-br from-teal/10 to-transparent p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Smart Money Signal</h2>
                <AlertCircle size={20} className="text-teal" />
              </div>
              <div className="text-center mb-4">
                <div className="text-6xl font-bold bg-gradient-to-r from-teal to-lime bg-clip-text text-transparent">
                  {market.alpha}
                </div>
                <div className="text-sm text-white/60 mt-1">Alpha Score</div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <span className="text-sm text-white/80">Direction</span>
                  <div className="flex items-center gap-2">
                    <TrendingUp size={16} className="text-teal" />
                    <span className="font-semibold text-teal">{market.direction}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <span className="text-sm text-white/80">Skew</span>
                  <span className="font-semibold">{(market.skew * 100).toFixed(0)}% {market.direction}</span>
                </div>
                <div className="p-3 rounded-lg bg-teal/10 border border-teal/30">
                  <div className="text-xs text-teal mb-1">Signal</div>
                  <div className="text-sm font-medium">Strong Buy - Smart money heavily favors YES</div>
                </div>
              </div>
            </div>

            {/* Whale Activity */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Whale Activity</h2>
                <Users size={20} className="text-white/60" />
              </div>
              <div className="space-y-3">
                {whaleActivity.map((whale, i) => (
                  <div key={i} className="p-3 rounded-lg bg-white/5 hover:bg-white/10 transition">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-white/60">{whale.wallet}</span>
                      <span className={`text-xs font-semibold ${whale.side === 'YES' ? 'text-teal' : 'text-red-400'}`}>
                        {whale.side}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">${(whale.amount / 1000).toFixed(0)}K</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/60">Score: {whale.score}</span>
                        <span className="text-xs text-white/40">{whale.time}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trade Panel */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <h2 className="text-lg font-semibold mb-4">Place Order</h2>

              {/* Outcome Toggle */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={() => setSelectedOutcome('YES')}
                  className={`py-3 rounded-lg font-semibold transition ${
                    selectedOutcome === 'YES'
                      ? 'bg-teal text-black'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  YES {(market.yesPrice * 100).toFixed(0)}¢
                </button>
                <button
                  onClick={() => setSelectedOutcome('NO')}
                  className={`py-3 rounded-lg font-semibold transition ${
                    selectedOutcome === 'NO'
                      ? 'bg-red-500 text-white'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  NO {(market.noPrice * 100).toFixed(0)}¢
                </button>
              </div>

              {/* Amount Input */}
              <div className="mb-4">
                <label className="text-xs text-white/60 mb-2 block">Amount (USD)</label>
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 focus:border-teal focus:outline-none text-lg"
                />
                <div className="flex gap-2 mt-2">
                  {['25', '50', '100', '500'].map((amount) => (
                    <button
                      key={amount}
                      onClick={() => setBetAmount(amount)}
                      className="flex-1 py-1.5 text-xs rounded bg-white/5 hover:bg-white/10 transition"
                    >
                      ${amount}
                    </button>
                  ))}
                </div>
              </div>

              {/* Position Info */}
              <div className="space-y-2 mb-4 p-3 rounded-lg bg-white/5">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Max Payout</span>
                  <span className="font-semibold">${maxPayout}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Potential Profit</span>
                  <span className={`font-semibold ${parseFloat(potentialProfit) > 0 ? 'text-teal' : ''}`}>
                    ${potentialProfit}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Avg Price</span>
                  <span className="font-semibold">
                    {selectedOutcome === 'YES' ? (market.yesPrice * 100).toFixed(0) : (market.noPrice * 100).toFixed(0)}¢
                  </span>
                </div>
              </div>

              {/* Trade Button */}
              <button
                className={`w-full py-4 rounded-lg font-semibold text-lg transition ${
                  selectedOutcome === 'YES'
                    ? 'bg-gradient-to-r from-teal to-lime text-black hover:opacity-90'
                    : 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:opacity-90'
                }`}
              >
                Buy {selectedOutcome} ${betAmount || '0.00'}
              </button>

              <div className="mt-4 text-xs text-center text-white/40">
                Demo mode - No real transactions
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
