"use client"

import React from 'react'

export function MarketTickerBar() {
  return (
    // Wrapper ensures the embed blends cleanly with the hero with no seams.
    <div className="w-full bg-[#0C0C0C] relative overflow-hidden leading-none">
      <iframe
        src="https://ticker.polymarket.com/embed?category=Breaking News&theme=dark&speed=1&displayMode=classic"
        width="100%"
        height="64"
        style={{
          border: 'none',
          overflow: 'hidden',
          display: 'block',
          background: 'transparent',
          // Nudge GPU compositing to avoid sub‑pixel gaps and stutter.
          transform: 'translateZ(0)',
          willChange: 'transform',
        }}
        scrolling="no"
        title="Polymarket Breaking News Ticker"
      />
      {/* Bottom fade + seam guard for perfectly smooth join with the hero */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2 bg-gradient-to-b from-transparent to-[#0C0C0C]" />
      <div className="pointer-events-none absolute inset-x-0 -bottom-px h-px bg-[#0C0C0C]" />
    </div>
  )
}
