"use client"

import { useEffect, useMemo, useState } from 'react'

type EventItem = { title: string; pct: number; icon?: string }

const BASE: EventItem[] = [
  { title: "Will SpaceX's market cap be > $1T in 2025?", pct: 66, icon: '🚀' },
  { title: 'Will Bitcoin close above $100k by Dec 31?', pct: 38, icon: '₿' },
  { title: 'Will there be at least 2000 measles cases in the U.S. in 2025?', pct: 53, icon: '🧪' },
  { title: 'Will ETH spot ETF be approved by Q4?', pct: 62, icon: 'Ξ' },
]

export function PolymarketEventLines() {
  // Light shuffling so it feels alive but stays readable
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 4000)
    return () => clearInterval(t)
  }, [])
  const items = useMemo(() => {
    const arr = [...BASE]
    // rotate 1 step for a gentle change
    if (tick % 2 === 1) arr.push(arr.shift()!)
    return arr
  }, [tick])

  return (
    <div className="pointer-events-none absolute inset-0 -z-10">
      {/* Subtle arcade/claw reference */}
      <div className="absolute top-2 sm:top-4 left-1/2 -translate-x-1/2 opacity-50 select-none">
        <div className="claw-sweep">
          <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
            <defs>
              <linearGradient id="clawGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#00E5FF" />
                <stop offset="100%" stopColor="#B6FF00" />
              </linearGradient>
            </defs>
            <path d="M40 0v28" stroke="url(#clawGrad)" strokeWidth="2" />
            <path d="M30 30 L40 46 L50 30" stroke="url(#clawGrad)" strokeWidth="2" fill="none"/>
            <path d="M34 46 L40 58 L46 46" stroke="url(#clawGrad)" strokeWidth="2" fill="none"/>
          </svg>
        </div>
      </div>

      {/* Event lines container */}
      <div className="absolute inset-0 flex items-center justify-center px-4">
        <div className="w-full max-w-2xl grid grid-cols-1 gap-2 sm:gap-3">
          {items.map((it, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 backdrop-blur-[1px] shadow-[0_0_20px_rgba(0,229,255,0.08)]"
              style={{ animation: `fadeSlide 700ms ease ${idx * 80}ms both` }}
            >
              <div className="min-w-0 flex items-center gap-2 text-sm">
                <span className="opacity-80">{it.icon ?? '📈'}</span>
                <span className="truncate">{it.title}</span>
              </div>
              <span className="ml-3 shrink-0 inline-flex items-center h-6 px-2 rounded-full border border-white/10 bg-white/5 text-white/90 text-xs">
                {it.pct}%
              </span>
            </div>
          ))}
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeSlide { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sweepX { 0% { transform: translateX(-140px); } 50% { transform: translateX(140px); } 100% { transform: translateX(-140px); } }
        @keyframes drop { 0%, 70%, 100% { transform: translateY(0); } 80% { transform: translateY(10px); } 90% { transform: translateY(-2px); } }
        .claw-sweep { animation: sweepX 7s linear infinite, drop 7s ease-in-out infinite; }
      `}</style>
    </div>
  )
}

