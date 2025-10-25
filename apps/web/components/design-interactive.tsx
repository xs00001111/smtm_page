"use client"
import { useEffect, useState } from 'react'
import type { Mode } from '@/components/design-actions'
import { UserProfileCard, WhaleProfileCard, MarketCard } from '@/components/design-cards'
import { SignalAlertCard, SignalFeed } from '@/components/design-signal'

type Density = 'normal' | 'compact'

export function DesignInteractive({ defaultMode = 'dark' as Mode, defaultDensity = 'normal' as Density }: { defaultMode?: Mode; defaultDensity?: Density }) {
  const [mode, setMode] = useState<Mode>(defaultMode)
  const [density, setDensity] = useState<Density>(defaultDensity)
  useEffect(() => {
    function pick() {
      if (typeof window !== 'undefined') {
        const w = window.innerWidth
        setDensity(w < 420 ? 'compact' : defaultDensity)
      }
    }
    pick()
    window.addEventListener('resize', pick)
    return () => window.removeEventListener('resize', pick)
  }, [defaultDensity])
  return (
    <>
      <div className="mt-2 mb-4 flex flex-wrap gap-2">
        <div className="inline-flex rounded-md border border-white/15 bg-white/[0.06] p-1 text-sm dark:block hidden">
          <button onClick={()=>setMode('dark')} className={`px-3 py-1 rounded ${mode==='dark'?'bg-white text-black':''}`}>Dark</button>
          <button onClick={()=>setMode('light')} className={`px-3 py-1 rounded ${mode==='light'?'bg-white text-black':''}`}>Light</button>
        </div>
        <div className="inline-flex rounded-md border border-neutral-300 bg-white p-1 text-sm dark:hidden">
          <button onClick={()=>setMode('dark')} className={`px-3 py-1 rounded ${mode==='dark'?'bg-black text-white':''}`}>Dark</button>
          <button onClick={()=>setMode('light')} className={`px-3 py-1 rounded ${mode==='light'?'bg-black text-white':''}`}>Light</button>
        </div>
        <div className="inline-flex rounded-md border border-white/15 bg-white/[0.06] p-1 text-sm dark:block hidden">
          <button onClick={()=>setDensity('normal')} className={`px-3 py-1 rounded ${density==='normal'?'bg-white text-black':''}`}>Normal</button>
          <button onClick={()=>setDensity('compact')} className={`px-3 py-1 rounded ${density==='compact'?'bg-white text-black':''}`}>Compact</button>
        </div>
        <div className="inline-flex rounded-md border border-neutral-300 bg-white p-1 text-sm dark:hidden">
          <button onClick={()=>setDensity('normal')} className={`px-3 py-1 rounded ${density==='normal'?'bg-black text-white':''}`}>Normal</button>
          <button onClick={()=>setDensity('compact')} className={`px-3 py-1 rounded ${density==='compact'?'bg-black text-white':''}`}>Compact</button>
        </div>
      </div>

      <section className="mt-2">
        <h2 className="text-2xl font-bold mb-4">Profile Cards</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="max-w-[340px] w-full mx-auto">
            <div className="mb-2 text-sm opacity-70">User Profile Card</div>
            <UserProfileCard mode={mode} density={density} />
          </div>
          <div className="max-w-[340px] w-full mx-auto">
            <div className="mb-2 text-sm opacity-70">Whale Card</div>
            <WhaleProfileCard mode={mode} density={density} />
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-bold mb-4">Signals</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="max-w-[340px] w-full mx-auto">
            <div className="mb-2 text-sm opacity-70">New Bet Alert</div>
            <SignalAlertCard
              mode={mode}
              density={density}
              alert={{
                wallet: '0x42A1...9fC7',
                market: 'ETH ETF approval by Q4',
                direction: 'Long',
                amount: '$12,000',
                odds: '0.56',
                timeAgo: 'just now',
                caption: 'Desk thinks SEC is warming up after staff comments.',
              }}
            />
          </div>
          <div className="max-w-[340px] w-full mx-auto">
            <div className="mb-2 text-sm opacity-70">Feed (bot‑style)</div>
            <SignalFeed mode={mode} density={density} />
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-bold mb-4">Market Cards</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="max-w-[340px] w-full mx-auto">
            <div className="mb-2 text-sm opacity-70">Politics Market</div>
            <MarketCard
              mode={mode}
              density={density}
              market={{
                question: "Will Trump win Pennsylvania by >3%?",
                category: "Politics",
                yesPrice: 0.58,
                noPrice: 0.42,
                volume24h: "$1.2M",
                liquidity: "$450K",
                endDate: "Nov 5, 2024",
                trending: true,
                priceChange: "+0.04"
              }}
            />
          </div>
          <div className="max-w-[340px] w-full mx-auto">
            <div className="mb-2 text-sm opacity-70">Crypto Market</div>
            <MarketCard
              mode={mode}
              density={density}
              market={{
                question: "Will ETH reach $4000 by Dec 31?",
                category: "Crypto",
                yesPrice: 0.67,
                noPrice: 0.33,
                volume24h: "$850K",
                liquidity: "$320K",
                endDate: "Dec 31, 2024",
                trending: false,
                priceChange: "+0.08"
              }}
            />
          </div>
        </div>
      </section>
    </>
  )
}
