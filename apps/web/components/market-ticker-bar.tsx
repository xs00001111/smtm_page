"use client"

import React from 'react'

export function MarketTickerBar() {
  return (
    <div className="w-full bg-[#0C0C0C]">
      <iframe
        src="https://ticker.polymarket.com/embed?category=Breaking News&theme=dark&speed=1&displayMode=classic"
        width="100%"
        height="60"
        style={{ border: 'none', overflow: 'hidden', display: 'block', background: 'transparent' }}
        scrolling="no"
        title="Polymarket Breaking News Ticker"
      />
    </div>
  )
}
