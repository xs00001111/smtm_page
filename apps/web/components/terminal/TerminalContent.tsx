"use client"

import React from 'react'
import { Sliders, Activity, TrendingUp } from 'lucide-react'

// --- lightweight helpers for the demo chart
function prng(seed: number) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
}

function catmull(values: number[], w = 800, h = 320) {
  if (!values.length) return ''
  const stepX = w / (values.length - 1)
  const pts = values.map((v, i) => [i * stepX, h - (v / 100) * h]) as [number, number][]
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`
  }
  return d
}

function useDemoSeries() {
  // Generate dramatic Polymarket-style price data with news events:
  // - Long stable periods
  // - Explosive movements on breaking news
  // - Quick reversals and corrections
  // - Multiple dramatic events throughout the timeline
  const n = 60
  const ys: number[] = []
  const ns: number[] = []
  const rng = prng(4242)

  let yes = 45  // Start at 45%
  let no = 55   // Start at 55%

  // Define dramatic news events with steep changes and reversals
  const newsEvents = [
    // Early consolidation with small moves
    { at: 10, magnitude: 5, type: 'spike' },      // Breaking news pushes YES up
    { at: 11, magnitude: -2, type: 'correction' }, // Immediate correction

    // Mid-period volatility
    { at: 18, magnitude: -8, type: 'crash' },     // Bad news crashes YES
    { at: 19, magnitude: -3, type: 'continuation' }, // Continues down
    { at: 22, magnitude: 6, type: 'recovery' },   // Recovery rally

    // Major news event sequence
    { at: 30, magnitude: -6, type: 'dip' },       // Pre-news dip
    { at: 35, magnitude: 18, type: 'explosion' }, // MASSIVE news spike!
    { at: 36, magnitude: 5, type: 'continuation' }, // Momentum continues
    { at: 37, magnitude: -8, type: 'profit-taking' }, // Profit taking
    { at: 38, magnitude: -4, type: 'correction' }, // More correction

    // Late consolidation and final push
    { at: 48, magnitude: 4, type: 'accumulation' },
    { at: 52, magnitude: 8, type: 'breakout' },   // Final breakout
    { at: 53, magnitude: -3, type: 'consolidation' },
    { at: 57, magnitude: 5, type: 'pump' },       // Last pump
  ]

  for (let i = 0; i < n; i++) {
    // Check for news events
    const events = newsEvents.filter(e => e.at === i)

    if (events.length > 0) {
      // Apply all events at this timestamp
      events.forEach(event => {
        yes += event.magnitude
        no -= event.magnitude
      })
    } else {
      // Normal periods: very small movements (consolidation)
      const microNoise = (rng() - 0.5) * 0.8
      yes += microNoise
      no -= microNoise
    }

    // Keep within bounds and ensure they sum to ~100
    yes = Math.min(92, Math.max(8, yes))
    no = 100 - yes

    ys.push(yes)
    ns.push(no)
  }

  return { ys, ns }
}

function SmartSignalCard() {
  const alpha = 78
  const dir = 'YES'
  const skew = 82
  const yesVals = [40,47,51,52,54,57,63,70,75,77,78,81]
  const noVals = yesVals.map(v => 100 - v - 5)
  const Row = ({ vals, color, label }: { vals: number[], color: string, label: string }) => (
    <div className="mb-1">
      <div className="flex items-center justify-between text-xs text-white/60 mb-1">
        <span>{label}</span>
        <span className="text-white/50">avg {(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(0)}%</span>
      </div>
      <div className="grid grid-cols-12 gap-[2px]">
        {vals.map((v,i)=> (
          <div key={i} className="h-6 rounded-sm" style={{ backgroundColor: color, opacity: Math.max(0.25, v/100) }} />
        ))}
      </div>
    </div>
  )
  return (
    <div className="rounded-xl border border-teal/30 bg-gradient-to-br from-teal/10 to-transparent p-6 glass-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Smart Money Signal</h2>
        <TrendingUp className="text-teal" size={18} />
      </div>
      <div className="text-center mb-3">
        <div className="text-6xl font-extrabold bg-gradient-to-r from-teal to-lime bg-clip-text text-transparent">{alpha}</div>
        <div className="text-xs text-white/70">Alpha Score</div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div className="rounded-md bg-white/5 p-2 flex items-center justify-between"><span className="text-white/70">Direction</span><span className="text-teal font-semibold">{dir}</span></div>
        <div className="rounded-md bg-white/5 p-2 flex items-center justify-between"><span className="text-white/70">Skew</span><span className="font-semibold">{skew}% YES</span></div>
      </div>
      <div className="p-3 rounded-md bg-white/5 border border-white/10">
        <div className="text-xs text-white/70 mb-2">Signal Heatmap</div>
        <Row vals={yesVals} color="rgba(0,229,255,0.5)" label="YES" />
        <Row vals={noVals} color="rgba(239,68,68,0.5)" label="NO" />
      </div>
    </div>
  )
}

function OddsGauge({ percent }: { percent: number }) {
  const p = Math.min(99, Math.max(1, percent))
  const r = 48
  const c = 2 * Math.PI * r
  const offset = c * (1 - p / 100)
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 glass-card">
      <div className="text-sm font-semibold text-white/80 mb-3">Market Odds & Probabilities</div>
      <div className="flex items-center justify-center">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r={r} stroke="rgba(255,255,255,0.1)" strokeWidth="10" fill="none" />
          <circle cx="70" cy="70" r={r} stroke="#00E5FF" strokeWidth="10" fill="none" strokeDasharray={c} strokeDashoffset={offset} transform="rotate(-90 70 70)" />
          <text x="70" y="75" textAnchor="middle" className="fill-white" fontSize="20" fontWeight="700">{p}%</text>
        </svg>
      </div>
      <div className="mt-3 text-center text-xs text-white/60">YES probability</div>
    </div>
  )
}

function FeaturedMarkets() {
  const items = [
    { title: 'Bitcoin above $100k by year end?', tag: 'Bitcoin', pct: 65 },
    { title: 'ETH spot ETF approved by Q4?', tag: 'Ethereum', pct: 61 },
    { title: 'Solana flips BNB market cap?', tag: 'Solana', pct: 42 },
  ]
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 glass-card">
      <div className="text-sm font-semibold text-white/80 mb-4">Featured Questions</div>
      <div className="grid grid-cols-3 gap-6">
        {items.map((it, i) => (
          <div key={i} className="group cursor-pointer">
            <div className="text-xs text-white/50 mb-1">{it.tag}</div>
            <div className="font-semibold text-white/90 mb-3 group-hover:text-teal transition">{it.title}</div>
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-teal transition-all group-hover:bg-lime" style={{ width: `${it.pct}%` }} />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/60">YES {it.pct}%</span>
              <span className="text-teal/70 group-hover:text-teal transition">View →</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PriceMovers() {
  const movers = [
    { name: 'BTC Dominance', ch: +0.9 },
    { name: 'ETH ETF', ch: +1.1 },
    { name: 'SOL Upgrade', ch: +0.6 },
    { name: 'DeFi TVL', ch: -0.5 },
    { name: 'Stablecoin Supply', ch: +0.3 },
  ]
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 glass-card">
      <div className="text-sm font-semibold text-white/80 mb-3">Real‑Time Price Movements</div>
      <div className="space-y-2 text-sm">
        {movers.map((m, i) => (
          <div key={i} className="flex items-center justify-between">
            <span className="text-white/80">{m.name}</span>
            <span className={m.ch >= 0 ? 'text-teal' : 'text-red-400'}>{m.ch >= 0 ? '+' : ''}{m.ch.toFixed(2)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DepthHeatmapCard() {
  // Generate realistic-looking depth: more around mid‑price with light noise
  const bins = 12
  const mid = Math.floor(bins / 2)
  const r = prng(4242)
  const sigma = 2.2
  const yes = Array.from({ length: bins }, (_, i) => {
    const g = Math.exp(-Math.pow(i - mid, 2) / (2 * sigma * sigma)) // 0..1 bell curve
    const base = 0.25 + 0.65 * g // 0.25..0.9
    const noise = (r() - 0.5) * 0.12
    return Math.max(0.12, Math.min(1, base + noise))
  })
  // NO depth is typically lower when YES skew is high; mirror with slight skew
  const no = yes.map((v, i) => {
    const mirror = yes[bins - 1 - i]
    const noise = (r() - 0.5) * 0.1
    const val = 0.18 + (0.55 * (1 - mirror)) + noise
    return Math.max(0.12, Math.min(1, val))
  })
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 glass-card">
      <div className="text-sm font-semibold text-white/80 mb-3">Depth Heatmap</div>
      <div className="grid grid-cols-12 gap-[2px]">
        {yes.map((v, i) => (
          <div key={i} className="h-6 bg-teal" style={{ opacity: v * 0.9 }} />
        ))}
      </div>
      <div className="grid grid-cols-12 gap-[2px] mt-[2px]">
        {no.map((v, i) => (
          <div key={i} className="h-6 bg-red-500" style={{ opacity: v * 0.9 }} />
        ))}
      </div>
      <div className="mt-2 text-xs text-white/60">Top: YES depth • Bottom: NO depth</div>
    </div>
  )
}

export default function TerminalContent() {
  return (
    <div className="mx-auto w-full max-w-screen-2xl px-4 py-6">
      <div className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Will Bitcoin hit $100k before January 2026?</h1>
            <div className="flex items-center gap-4 text-sm text-white/60">
              <span>24h Volume: $487K</span>
              <span>•</span>
              <span>Liquidity: $1250K</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 space-y-4">
          <FeaturedMarkets />
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 glass-card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Price Chart</h2>
              <button className="inline-flex items-center gap-1 text-xs rounded-md border border-white/10 bg-white/5 px-2 py-1 hover:bg-white/10"><Sliders className="h-3.5 w-3.5" /> Tuning</button>
            </div>
            {/* Simple SVG chart with two paths */}
            <ChartLines />
          </div>
          {/* Order book + ticket under chart - use flex to align bottoms */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <OrderBook />
            <OrderTicket />
          </div>
        </div>
        <div className="space-y-4 flex flex-col">
          <SmartSignalCard />
          <OddsGauge percent={63} />
          <PriceMovers />
          {/* Depth heatmap aligned at bottom with order book/ticket */}
          <DepthHeatmapCard />
        </div>
      </div>
    </div>
  )
}

// --- Order book + ticket (lightweight mock) ---
function OrderBook() {
  const rows = Array.from({ length: 6 }, (_, i) => ({ price: 42 - i, size: (Math.random() * 1800 + 200).toFixed(2) }))
  const bids = Array.from({ length: 6 }, (_, i) => ({ price: 41 + i, size: (Math.random() * 1800 + 200).toFixed(2) }))
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-2 text-sm font-semibold">Order Book</div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-white/60 mb-1">NO (asks)</div>
          {rows.map((r, i) => (
            <div key={i} className="flex justify-between px-2 py-1 rounded bg-red-500/10 mb-1">
              <span className="text-red-400">{r.price}¢</span>
              <span className="text-white/70">${r.size}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="text-white/60 mb-1">YES (bids)</div>
          {bids.map((r, i) => (
            <div key={i} className="flex justify-between px-2 py-1 rounded bg-teal/10 mb-1">
              <span className="text-teal">{r.price}¢</span>
              <span className="text-white/70">${r.size}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function OrderTicket() {
  const [orderType, setOrderType] = React.useState<'market' | 'limit'>('market')
  const [buySell, setBuySell] = React.useState<'buy' | 'sell'>('buy')
  const [yesNo, setYesNo] = React.useState<'yes' | 'no'>('yes')
  const [limitPrice, setLimitPrice] = React.useState('67')

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <button
            onClick={() => setBuySell('buy')}
            className={`px-3 py-1.5 rounded transition ${buySell === 'buy' ? 'bg-teal/20 text-teal border border-teal/40' : 'bg-white/5 text-white/60'}`}
          >
            Buy
          </button>
          <button
            onClick={() => setBuySell('sell')}
            className={`px-3 py-1.5 rounded transition ${buySell === 'sell' ? 'bg-red-400/20 text-red-400 border border-red-400/40' : 'bg-white/5 text-white/60'}`}
          >
            Sell
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={() => setOrderType('market')}
            className={`px-2 py-1 rounded transition ${orderType === 'market' ? 'bg-white/10 text-white border border-white/20' : 'bg-white/5 text-white/40'}`}
          >
            Market
          </button>
          <button
            onClick={() => setOrderType('limit')}
            className={`px-2 py-1 rounded transition ${orderType === 'limit' ? 'bg-white/10 text-white border border-white/20' : 'bg-white/5 text-white/40'}`}
          >
            Limit
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <button
          onClick={() => setYesNo('yes')}
          className={`rounded-md border px-2 py-2 transition ${yesNo === 'yes' ? 'border-teal/60 bg-teal/20 text-teal font-semibold' : 'border-teal/20 bg-teal/5 text-teal/60'}`}
        >
          YES 67¢
        </button>
        <button
          onClick={() => setYesNo('no')}
          className={`rounded-md border px-2 py-2 transition ${yesNo === 'no' ? 'border-red-400/60 bg-red-400/20 text-red-400 font-semibold' : 'border-red-400/20 bg-red-400/5 text-red-400/60'}`}
        >
          NO 33¢
        </button>
      </div>

      {orderType === 'limit' && (
        <div className="mb-3">
          <label className="text-xs text-white/60 mb-1 block">Limit Price (¢)</label>
          <input
            type="number"
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-teal/50"
            placeholder="Enter limit price"
          />
        </div>
      )}

      <div className="mb-3">
        <label className="text-xs text-white/60 mb-1 block">Amount (USD)</label>
        <div className="text-3xl font-extrabold tracking-tight mb-2">$163.24</div>
        <div className="flex gap-2">
          {[1, 20, 100].map((v) => (
            <button key={v} className="px-2 py-1 rounded border border-white/10 bg-white/5 text-xs hover:bg-white/10 transition">
              +${v}
            </button>
          ))}
          <button className="px-2 py-1 rounded border border-white/10 bg-white/5 text-xs hover:bg-white/10 transition">Max</button>
        </div>
      </div>

      <div className="h-2 rounded bg-white/10 mb-2">
        <div className="h-2 rounded bg-gradient-to-r from-teal to-lime w-[70%]" />
      </div>
      <div className="text-xs text-white/60 mb-3">
        To Win <span className="text-white/80 font-semibold">$388.67</span>
      </div>
      <button className={`w-full rounded-md font-semibold py-2.5 transition ${
        buySell === 'buy'
          ? 'bg-gradient-to-r from-teal to-lime text-black hover:opacity-90'
          : 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:opacity-90'
      }`}>
        {buySell === 'buy' ? 'Buy' : 'Sell'} {yesNo.toUpperCase()}
      </button>
    </div>
  )
}

function ChartLines() {
  const { ys, ns } = useDemoSeries()

  // Chart dimensions with margins for axes
  const chartWidth = 800
  const chartHeight = 320
  const marginLeft = 60  // Increased for Y-axis label spacing
  const marginBottom = 35
  const marginTop = 10
  const marginRight = 10
  const plotWidth = chartWidth - marginLeft - marginRight
  const plotHeight = chartHeight - marginTop - marginBottom

  // Generate time labels (last 24 hours)
  const now = new Date()
  const timeLabels = [0, 6, 12, 18, 24].map(h => {
    const d = new Date(now)
    d.setHours(now.getHours() - (24 - h))
    return `${d.getHours()}:00`
  })

  return (
    <div className="relative h-80">
      <svg className="w-full h-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="xMinYMid meet">
        {/* Y-axis grid lines and labels */}
        {[0, 25, 50, 75, 100].map((pct) => {
          const y = marginTop + plotHeight - (pct / 100) * plotHeight
          return (
            <g key={pct}>
              <line
                x1={marginLeft}
                y1={y}
                x2={chartWidth - marginRight}
                y2={y}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
              />
              <text
                x={marginLeft - 10}
                y={y + 4}
                textAnchor="end"
                className="fill-white/40"
                fontSize="11"
              >
                {pct}%
              </text>
            </g>
          )
        })}

        {/* X-axis time labels */}
        {timeLabels.map((label, i) => {
          const x = marginLeft + (i / (timeLabels.length - 1)) * plotWidth
          return (
            <text
              key={i}
              x={x}
              y={chartHeight - 10}
              textAnchor="middle"
              className="fill-white/40"
              fontSize="11"
            >
              {label}
            </text>
          )
        })}

        {/* Clip path for chart area */}
        <defs>
          <clipPath id="chart-clip">
            <rect x={marginLeft} y={marginTop} width={plotWidth} height={plotHeight} />
          </clipPath>
        </defs>

        {/* Chart lines */}
        <g clipPath="url(#chart-clip)">
          <path
            d={catmull(ys, plotWidth, plotHeight)}
            fill="none"
            stroke="#00E5FF"
            strokeOpacity="0.95"
            strokeWidth="2.5"
            transform={`translate(${marginLeft}, ${marginTop})`}
          />
          <path
            d={catmull(ns, plotWidth, plotHeight)}
            fill="none"
            stroke="#EF4444"
            strokeOpacity="0.95"
            strokeWidth="2.5"
            transform={`translate(${marginLeft}, ${marginTop})`}
          />

          {/* End point indicators */}
          <circle
            cx={marginLeft + plotWidth}
            cy={marginTop + plotHeight - (ys[ys.length-1] / 100) * plotHeight}
            r={5}
            stroke="#00E5FF"
            strokeWidth={2}
            fill="#0C0C0C"
          />
          <circle
            cx={marginLeft + plotWidth}
            cy={marginTop + plotHeight - (ns[ns.length-1] / 100) * plotHeight}
            r={5}
            stroke="#EF4444"
            strokeWidth={2}
            fill="#0C0C0C"
          />
        </g>

        {/* Axis labels */}
        <text
          x={15}
          y={chartHeight / 2}
          textAnchor="middle"
          className="fill-white/50"
          fontSize="11"
          transform={`rotate(-90, 15, ${chartHeight / 2})`}
        >
          Probability (%)
        </text>
        <text
          x={chartWidth / 2}
          y={chartHeight - 8}
          textAnchor="middle"
          className="fill-white/50"
          fontSize="11"
        >
          Time (Last 24h)
        </text>
      </svg>
    </div>
  )
}
