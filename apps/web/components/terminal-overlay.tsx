"use client"

import { useEffect, useMemo, useRef, useState } from 'react'

type Line = {
  t: string
  s: string
  a: 'BUY' | 'SELL'
  p: number
  q: number
}

const SYMBOLS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'AMZN', 'SPY', 'TLT', 'GLD', 'BTC', 'ETH']

function makeLine(): Line {
  const s = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
  const a = Math.random() > 0.5 ? 'BUY' : 'SELL'
  const p = +(10 + Math.random() * 990).toFixed(2)
  const q = +(1 + Math.random() * 499).toFixed(0)
  const now = new Date()
  const t = now.toTimeString().slice(0, 8)
  return { t, s, a, p, q }
}

export function TerminalOverlay() {
  const [lines, setLines] = useState<Line[]>(() => Array.from({ length: 10 }, makeLine))
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    timerRef.current = window.setInterval(() => {
      setLines((prev) => {
        const next = [...prev.slice(-18), makeLine()]
        return next
      })
    }, 900)
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current)
    }
  }, [])

  const rows = useMemo(() => lines.slice(-14), [lines])

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,transparent,black_15%,black_85%,transparent)]"
    >
      {/* Subtle scanline background */}
      <div className="absolute inset-0 opacity-[0.06]"
        style={{
          background:
            'repeating-linear-gradient(to bottom, rgba(255,255,255,0.8) 0, rgba(255,255,255,0.8) 1px, transparent 1px, transparent 8px)'
        }}
      />
      {/* Moving sweep highlight */}
      <div className="absolute -inset-10 animate-[sweep_6s_linear_infinite] opacity-20"
        style={{
          background:
            'radial-gradient(60% 20% at 50% 0%, rgba(0,229,255,0.25), transparent 70%)'
        }}
      />

      <div className="absolute inset-0 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="w-full max-w-4xl rounded-xl border border-white/10 bg-black/30 backdrop-blur-[1px] overflow-hidden">
          <div className="h-8 bg-white/[0.03] border-b border-white/10 flex items-center gap-2 px-3">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-300/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
            <span className="ml-3 text-xs text-white/60 tracking-wide">SMTM Terminal — Market Stream</span>
          </div>
          <div className="h-40 sm:h-44 md:h-48 font-mono text-[11px] sm:text-xs leading-relaxed text-white/85 p-3">
            {rows.map((r, i) => (
              <div key={i} className="flex gap-4 whitespace-nowrap">
                <span className="text-white/40 w-14">{r.t}</span>
                <span className="w-16 text-white/80">{r.s}</span>
                <span className={r.a === 'BUY' ? 'text-teal w-12' : 'text-red-400 w-12'}>{r.a}</span>
                <span className="w-20">${r.p.toFixed(2)}</span>
                <span className="w-12 text-white/60">{r.q}</span>
                <span className="flex-1 text-white/30">OK</span>
              </div>
            ))}
            {/* Blinking cursor */}
            <div className="mt-1 h-4 w-2 bg-white/80 animate-pulse" />
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes sweep { from { transform: translateY(-20%); } to { transform: translateY(60%); } }
      `}</style>
    </div>
  )
}

