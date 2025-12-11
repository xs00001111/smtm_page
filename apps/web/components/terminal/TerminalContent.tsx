"use client"

import React from 'react'
import { Sliders, Activity, TrendingUp } from 'lucide-react'

// --- lightweight helpers for the demo chart
function prng(seed: number) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
}

// Fritsch–Carlson monotone cubic interpolation to avoid overshoot/curls
function monotonePath(values: number[], w = 800, h = 320) {
  if (!values.length) return ''
  const n = values.length
  const stepX = w / (n - 1)
  const xs = Array.from({ length: n }, (_, i) => i * stepX)
  const ys = values.map((v) => h - (v / 100) * h)
  const dx = Array.from({ length: n - 1 }, (_, i) => xs[i + 1] - xs[i])
  const dy = Array.from({ length: n - 1 }, (_, i) => ys[i + 1] - ys[i])
  const m = dy.map((d, i) => (d === 0 ? 0 : d / dx[i]))
  const tangents = new Array<number>(n)
  tangents[0] = m[0]
  tangents[n - 1] = m[n - 2]
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) tangents[i] = 0
    else tangents[i] = (m[i - 1] * dx[i] + m[i] * dx[i - 1]) / (dx[i - 1] + dx[i])
  }
  // Limit the tangents to preserve monotonicity
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      tangents[i] = 0
      tangents[i + 1] = 0
      continue
    }
    const a = tangents[i] / m[i]
    const b = tangents[i + 1] / m[i]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      tangents[i] = t * a * m[i]
      tangents[i + 1] = t * b * m[i]
    }
  }
  let d = `M ${xs[0]} ${ys[0]}`
  for (let i = 0; i < n - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1]
    const y0 = ys[i], y1 = ys[i + 1]
    const t0 = tangents[i]
    const t1 = tangents[i + 1]
    const dx01 = x1 - x0
    d += ` C ${x0 + dx01 / 3} ${y0 + (t0 * dx01) / 3}, ${x1 - dx01 / 3} ${y1 - (t1 * dx01) / 3}, ${x1} ${y1}`
  }
  return d
}

function useDemoSeries() {
  // Generate dramatic Polymarket-style price data with news events:
  // - Long stable periods
  // - Explosive movements on breaking news
  // - Quick reversals and corrections
  // - Multiple dramatic events throughout the timeline
  // - Independent movements to avoid perfect symmetry
  const n = 60
  const ys: number[] = []
  const ns: number[] = []
  const rng = prng(4242)
  const rng2 = prng(8484) // Second RNG for NO line independence

  let yes = 45  // Start at 45%
  let no = 53   // Start at 53% (doesn't sum to exactly 100)

  // Define dramatic news events with steep changes and reversals
  const yesEvents = [
    { at: 10, magnitude: 5 },
    { at: 11, magnitude: -2 },
    { at: 14, magnitude: 3 },   // YES-only event
    { at: 18, magnitude: -8 },
    { at: 19, magnitude: -3 },
    { at: 22, magnitude: 6 },
    { at: 25, magnitude: -2 },  // YES-only dip
    { at: 30, magnitude: -6 },
    { at: 35, magnitude: 18 },
    { at: 36, magnitude: 5 },
    { at: 37, magnitude: -8 },
    { at: 38, magnitude: -4 },
    { at: 42, magnitude: 3 },   // YES-only bump
    { at: 48, magnitude: 4 },
    { at: 52, magnitude: 8 },
    { at: 53, magnitude: -3 },
    { at: 57, magnitude: 5 },
  ]

  // NO has very different events (independent movements)
  const noEvents = [
    { at: 9, magnitude: 2 },    // Different timing
    { at: 10, magnitude: -3 },  // Different magnitude
    { at: 12, magnitude: 4 },   // NO-only event
    { at: 17, magnitude: 3 },
    { at: 18, magnitude: 5 },   // Much smaller reaction
    { at: 20, magnitude: 2 },   // NO-only
    { at: 22, magnitude: -4 },
    { at: 28, magnitude: -3 },  // Different timing
    { at: 30, magnitude: 7 },
    { at: 34, magnitude: 4 },   // Different timing
    { at: 35, magnitude: -12 }, // Different magnitude
    { at: 37, magnitude: 6 },   // Different timing
    { at: 39, magnitude: 5 },   // Different timing
    { at: 45, magnitude: -4 },  // NO-only event
    { at: 49, magnitude: 2 },   // Different timing
    { at: 51, magnitude: -5 },  // Different timing
    { at: 54, magnitude: 3 },   // Different timing
    { at: 58, magnitude: -2 },  // Different timing
  ]

  for (let i = 0; i < n; i++) {
    // Check for news events on YES
    const yesEvent = yesEvents.find(e => e.at === i)
    const noEvent = noEvents.find(e => e.at === i)

    if (yesEvent) {
      yes += yesEvent.magnitude
    }

    // Always add noise for bumpiness, even during events
    const yesNoise = (rng() - 0.5) * 1.8
    // Add occasional small bumps/dips (20% chance)
    const yesBump = rng() > 0.8 ? (rng() - 0.5) * 3 : 0
    yes += yesNoise + yesBump

    if (noEvent) {
      no += noEvent.magnitude
    }

    // NO has its own independent noise and bumps
    const noNoise = (rng2() - 0.5) * 1.7
    const noBump = rng2() > 0.8 ? (rng2() - 0.5) * 2.8 : 0
    no += noNoise + noBump

    // Keep within bounds
    yes = Math.min(90, Math.max(10, yes))
    no = Math.min(90, Math.max(10, no))

    ys.push(yes)
    ns.push(no)
  }

  return { ys, ns }
}

function SmartSignalCard() {
  const alpha = 78
  const dir = 'YES'
  const skew = 82
  return (
    <div className="rounded-xl border border-teal/30 bg-gradient-to-br from-teal/10 to-transparent p-6 glass-card">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Smart Money Signal</h2>
        <TrendingUp className="text-teal" size={18} />
      </div>
      <div className="text-center mb-4">
        <div className="text-6xl font-extrabold bg-gradient-to-r from-teal to-lime bg-clip-text text-transparent">{alpha}</div>
        <div className="text-xs text-white/70">Alpha Score</div>
      </div>
      <div className="flex items-center justify-between text-xs pb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-white/60">Direction</span>
          <span className="text-teal font-semibold">{dir}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white/60">Skew</span>
          <span className="font-semibold">{skew}% YES</span>
        </div>
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
          <div key={i} className="h-12 bg-teal" style={{ opacity: v * 0.9 }} />
        ))}
      </div>
      <div className="grid grid-cols-12 gap-[2px] mt-[2px]">
        {no.map((v, i) => (
          <div key={i} className="h-12 bg-red-500" style={{ opacity: v * 0.9 }} />
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

  // Dynamically size the chart to fill its container width.
  // This avoids a large unused gap on the right side.
  const containerRef = React.useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = React.useState(800)

  React.useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    // Initialize width immediately
    setContainerWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (cr) setContainerWidth(cr.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Chart dimensions with margins for axes
  const chartWidth = Math.max(320, Math.floor(containerWidth))
  const chartHeight = 320
  const marginLeft = 50  // Optimized for Y-axis label
  const marginBottom = 25  // Reduced since we removed bottom label
  const marginTop = 10
  const marginRight = 10  // Keep a small 10px right margin
  const plotWidth = chartWidth - marginLeft - marginRight
  const plotHeight = chartHeight - marginTop - marginBottom

  // Generate time labels (last 24 hours)
  const now = new Date()
  const timeLabels = [0, 6, 12, 18, 24].map(h => {
    const d = new Date(now)
    d.setHours(now.getHours() - (24 - h))
    return `${d.getHours()}:00`
  })

  // Memoize paths for performance when resizing
  const yesPath = React.useMemo(() => monotonePath(ys, plotWidth, plotHeight), [ys, plotWidth, plotHeight])
  const noPath = React.useMemo(() => monotonePath(ns, plotWidth, plotHeight), [ns, plotWidth, plotHeight])

  return (
    <div ref={containerRef} className="relative h-80">
      {/* Use a dynamic viewBox so the chart truly fills the box width. */}
      <svg className="w-full h-full" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
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
              y={chartHeight - 8}
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
            d={yesPath}
            fill="none"
            stroke="#00E5FF"
            strokeOpacity="0.95"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            transform={`translate(${marginLeft}, ${marginTop})`}
          />
          <path
            d={noPath}
            fill="none"
            stroke="#EF4444"
            strokeOpacity="0.95"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            transform={`translate(${marginLeft}, ${marginTop})`}
          />
        </g>

        {/* Axis labels */}
        <text
          x={10}
          y={chartHeight / 2}
          textAnchor="middle"
          className="fill-white/50"
          fontSize="11"
          transform={`rotate(-90, 10, ${chartHeight / 2})`}
        >
          Probability (%)
        </text>
      </svg>
    </div>
  )
}
