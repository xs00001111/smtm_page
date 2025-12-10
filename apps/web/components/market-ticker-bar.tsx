"use client"

import React from 'react'

type Item = { title: string; pct: number }

const ITEMS: Item[] = [
  { title: "Will SpaceX's market cap be greater than $1T at market close in 2025?", pct: 66 },
  { title: 'Will there be at least 2000 measles cases in the U.S. in 2025?', pct: 53 },
  { title: 'Will DraftKings launch a prediction market in 2025?', pct: 41 },
  { title: 'Will Bitcoin close above $100k by Dec 31?', pct: 38 },
  { title: 'Will ETH spot ETF be approved by Q4?', pct: 62 },
]

function Track() {
  return (
    <div className="inline-flex items-center gap-8 pr-8">
      {ITEMS.map((it, i) => (
        <div key={i} className="inline-flex items-center gap-3 text-sm whitespace-nowrap">
          <span className="inline-flex items-center gap-2 opacity-80">
            <span className="h-5 w-5 rounded-full bg-white/5 grid place-items-center border border-white/10">
              <span className="h-2 w-2 rounded-full bg-teal" />
            </span>
            <span className="truncate max-w-[44ch]">{it.title}</span>
          </span>
          <span className="ml-1 inline-flex items-center h-6 px-2 rounded-full border border-white/10 bg-white/5 text-white/90 text-xs">
            {it.pct}%
          </span>
        </div>
      ))}
    </div>
  )
}

export function MarketTickerBar() {
  return (
    <div className="w-full bg-[#0C0C0C] relative overflow-hidden leading-none">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="mx-auto w-full">
        <div className="flex h-14 items-center">
          {/* Polymarket badge */}
          <div className="flex items-center gap-2 pl-4 pr-5 border-r border-white/10">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="text-white/90">
              <path d="M3 18L12 3l9 15H3z" fill="currentColor" opacity="0.85" />
            </svg>
            <span className="text-xs font-semibold tracking-wide uppercase text-white/90">Polymarket</span>
          </div>

          {/* Scrolling track */}
          <div className="flex-1 overflow-hidden">
            <div className="inline-flex animate-tickerLeft will-change-transform">
              <Track />
              <Track />
            </div>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-gradient-to-b from-transparent to-[#0C0C0C]" />
    </div>
  )
}
