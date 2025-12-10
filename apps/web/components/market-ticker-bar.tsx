"use client"

import React from 'react'

export function MarketTickerBar() {
  return (
    <div className="w-full border-b border-white/5 bg-black/40 backdrop-blur-sm">
      <iframe
        src="https://ticker.polymarket.com/embed?category=Breaking News&theme=dark&speed=1&displayMode=classic"
        width="100%"
        height="60"
        style={{ border: 'none', overflow: 'hidden', display: 'block' }}
        scrolling="no"
        title="Polymarket Breaking News Ticker"
      />
    </div>
  )
}
