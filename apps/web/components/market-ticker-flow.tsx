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

export function MarketTickerFlow() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]">
      <div className="absolute left-0 right-0 top-6">
        <Row />
      </div>
      <div className="absolute left-0 right-0 top-14 opacity-80">
        <Row reverse />
      </div>
    </div>
  )
}
