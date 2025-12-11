"use client"

import React from 'react'
import { Sliders, Activity } from 'lucide-react'

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
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 glass-card">
      <div className="text-sm font-semibold text-white/80 mb-3">Depth Heatmap</div>
      <div className="grid grid-cols-12 gap-[2px]">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-6 bg-teal/10" style={{ opacity: 0.4 + i / 20 }} />
        ))}
      </div>
      <div className="grid grid-cols-12 gap-[2px] mt-[2px]">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-6 bg-red-500/10" style={{ opacity: 1 - i / 20 }} />
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
            <div className="h-80 rounded-md border border-white/5 bg-[radial-gradient(ellipse_at_top,_rgba(0,229,255,0.08),transparent_60%)] grid place-items-center text-white/60">
              <div className="text-center">
                <Activity className="mx-auto mb-3 opacity-60" />
                <div className="text-sm">Live chart placeholder</div>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <OddsGauge percent={63} />
          <PriceMovers />
          <DepthHeatmapCard />
        </div>
      </div>
    </div>
  )
}

