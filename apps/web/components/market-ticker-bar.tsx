"use client"

import React from 'react'

const TICKERS = [
  { sym: 'BTC', price: '$63,842', change: '+1.3%' },
  { sym: 'ETH', price: '$2,482', change: '-0.4%' },
  { sym: 'NVDA', price: '$889.12', change: '+0.8%' },
  { sym: 'DOGE', price: '$0.18', change: '+3.2%' },
  { sym: 'PEPE', price: '$0.000012', change: '-1.1%' },
  { sym: 'SOL', price: '$152.44', change: '+2.6%' },
  { sym: 'GME', price: '$18.73', change: '-0.6%' },
  { sym: 'AMC', price: '$4.12', change: '+0.3%' },
]

export function MarketTickerBar() {
  return (
    <div className="w-full py-3 border-b border-white/5 bg-black/40 backdrop-blur-sm">
      <div className="relative overflow-hidden">
        {/* Single scrolling row */}
        <div className="flex whitespace-nowrap motion-safe:animate-tickerLeft will-change-transform">
          {/* Duplicate the tickers for seamless loop */}
          {[0, 1, 2].map((setIndex) => (
            <div key={setIndex} className="flex items-center shrink-0">
              {TICKERS.map((ticker, idx) => (
                <div
                  key={`${setIndex}-${ticker.sym}-${idx}`}
                  className="inline-flex items-center gap-3 px-6 text-sm"
                >
                  <span className={idx % 2 === 0 ? 'text-teal font-semibold' : 'text-lime font-semibold'}>
                    {ticker.sym}
                  </span>
                  <span className="text-white/90 font-medium">
                    {ticker.price}
                  </span>
                  <span className={ticker.change.startsWith('-') ? 'text-red-400' : 'text-emerald-400'}>
                    {ticker.change}
                  </span>
                  <span className="text-white/20 mx-2">•</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
