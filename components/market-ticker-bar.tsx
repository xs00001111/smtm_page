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

function Row({ reverse }: { reverse?: boolean }) {
  const cls = reverse ? 'animate-tickerRight' : 'animate-tickerLeft'
  return (
    <div className="overflow-hidden whitespace-nowrap">
      <div className={`inline-flex items-center gap-8 ${cls} filter [filter:drop-shadow(0_0_12px_rgba(0,229,255,0.14))_drop-shadow(0_0_10px_rgba(182,255,0,0.10))]`} style={{ willChange: 'transform' }}>
        {[...Array(2)].map((_, i) => (
          <div key={i} className="inline-flex items-center gap-8">
            {TICKERS.map((t, idx) => (
              <span key={`${i}-${t.sym}-${idx}`} className="inline-flex items-center gap-2 text-xs md:text-sm uppercase tracking-widest opacity-75">
                <span className={idx % 2 === 0 ? 'text-teal' : 'text-lime'}>{t.sym}</span>
                <span className="text-white/95">{t.price}</span>
                <span className={t.change.startsWith('-') ? 'text-red-400' : 'text-teal'}>{t.change}</span>
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function MarketTickerBar() {
  return (
    <div className="w-full bg-black/30 backdrop-blur-sm py-2 border-b border-white/10">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="overflow-x-auto whitespace-nowrap">
          <div className="inline-flex items-center gap-8 text-white/80">
            {TICKERS.map((t, idx) => (
              <span key={`${t.sym}-${idx}`} className="inline-flex items-center gap-2 text-xs md:text-sm uppercase tracking-widest">
                <span className={idx % 2 === 0 ? 'text-teal' : 'text-lime'}>{t.sym}</span>
                <span className="text-white/90">{t.price}</span>
                <span className={t.change.startsWith('-') ? 'text-red-400' : 'text-teal'}>{t.change}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
