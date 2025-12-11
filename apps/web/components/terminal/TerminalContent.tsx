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
  const n = 40
  const crossAt = Math.floor(n * 0.85)
  const ys: number[] = []
  const ns: number[] = []
  let yes = 44
  let no = 56
  for (let i = 0; i < n; i++) {
    const isLate = i >= crossAt
    const t = i / (n - 1)
    const noise = (0.2 + t * t * 2) * (prng(1000 + i)() - 0.5)
    const driftY = isLate ? (67 - yes) * 0.18 : (50 - yes) * 0.02
    const driftN = isLate ? (33 - no) * 0.18 : (50 - no) * 0.02
    if (!isLate && Math.abs(yes - no) < 2) { yes -= 0.2; no += 0.2 }
    yes = Math.min(95, Math.max(5, yes + driftY + noise))
    no = Math.min(95, Math.max(5, no + driftN - noise))
    ys.push(yes); ns.push(no)
  }
  ys[crossAt] = ns[crossAt]
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
      <div className="text-sm font-semibold text-white/80 mb-3">Featured Questions</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {items.map((it, i) => (
          <div key={i} className="rounded-lg border border-white/10 bg-[#0F0F0F]/70 p-3">
            <div className="text-xs text-white/50 mb-1">{it.tag}</div>
            <div className="font-semibold text-white/90 line-clamp-2">{it.title}</div>
            <div className="mt-3 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-teal" style={{ width: `${it.pct}%` }} />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-white/60">YES {it.pct}%</span>
              <button className="px-2 py-1 rounded-md border border-teal/40 bg-teal/10 text-teal">View</button>
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
          {/* Order book + ticket under chart */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <OrderBook />
            <OrderTicket />
          </div>
        </div>
        <div className="space-y-4">
          <SmartSignalCard />
          <OddsGauge percent={63} />
          <PriceMovers />
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
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 mb-2 text-sm font-semibold"><span className="px-2 py-1 rounded bg-white/5">Buy</span><span className="px-2 py-1 rounded bg-white/5">Sell</span></div>
      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
        <button className="rounded-md border border-teal/40 bg-teal/10 text-teal px-2 py-1">YES 67¢</button>
        <button className="rounded-md border border-red-400/40 bg-red-400/10 text-red-400 px-2 py-1">NO 33¢</button>
      </div>
      <div className="text-4xl font-extrabold tracking-tight mb-2">$163.24</div>
      <div className="flex gap-2 mb-2">
        {[1, 20, 100].map((v) => (<button key={v} className="px-2 py-1 rounded border border-white/10 bg-white/5 text-xs">+${v}</button>))}
        <button className="px-2 py-1 rounded border border-white/10 bg-white/5 text-xs">Max</button>
      </div>
      <div className="h-2 rounded bg-white/10 mb-2">
        <div className="h-2 rounded bg-gradient-to-r from-teal to-lime w-[70%]" />
      </div>
      <div className="text-xs text-white/60 mb-2">To Win <span className="text-white/80">$388.67</span></div>
      <button className="w-full rounded-md bg-gradient-to-r from-teal to-lime text-black font-semibold py-2">Buy YES</button>
    </div>
  )
}

function ChartLines() {
  const { ys, ns } = useDemoSeries()
  return (
    <div className="relative h-80 rounded-md border border-white/5 bg-gradient-to-b from-teal/5 to-transparent">
      <svg className="w-full h-full" viewBox="0 0 800 320" preserveAspectRatio="none">
        {[0,25,50,75,100].map((y)=> (
          <line key={y} x1="0" y1={320-(y*3.2)} x2="800" y2={320-(y*3.2)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
        ))}
        <path d={catmull(ys)} fill="none" stroke="#00E5FF" strokeOpacity="0.95" strokeWidth="2" />
        <path d={catmull(ns)} fill="none" stroke="#EF4444" strokeOpacity="0.95" strokeWidth="2" />
        <circle cx="800" cy={320 - (ys[ys.length-1]/100)*320} r={6} stroke="#00E5FF" strokeWidth={2} fill="#0C0C0C" />
        <circle cx="800" cy={320 - (ns[ns.length-1]/100)*320} r={6} stroke="#EF4444" strokeWidth={2} fill="#0C0C0C" />
      </svg>
    </div>
  )
}
