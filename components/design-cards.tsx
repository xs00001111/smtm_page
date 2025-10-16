"use client"
import { Wallet, TrendingUp, TrendingDown, Trophy, Copy, ExternalLink, Crown, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { ExecuteModal, SimulateModal, TradeContext, FollowSimulateModal, FollowContext } from '@/components/design-actions'

type HistoryItem = {
  market: string
  direction: 'Long' | 'Short'
  stake: string
  result: 'Win' | 'Loss'
  pnl: string
}

export function UserProfileCard() {
  const [showSim, setShowSim] = useState(false)
  const [showExec, setShowExec] = useState(false)
  const [showFollow, setShowFollow] = useState(false)
  const ctx: TradeContext = {
    market: 'ETH ETF approval by Q4',
    direction: 'Long',
    price: 0.56,
    defaultAmount: 1000,
  }
  const followCtx: FollowContext = { id: 'alphanate', name: 'AlphaNate', periodLabel: '30d' }
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="h-14 w-14 md:h-16 md:w-16 rounded-xl grid place-items-center text-xl font-bold border border-white/10 bg-[linear-gradient(135deg,#00E5FF_0%,#B6FF00_100%)] text-black">A</div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className="text-lg font-semibold">AlphaNate</div>
            <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs">@alphanate</span>
          </div>
          <div className="mt-1 text-sm text-white/70">Macro & AI equities • United States</div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <div className="text-xs text-white/70">Win Rate (SMTM)</div>
              <div className="mt-1 text-xl font-bold text-teal">68%</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <div className="text-xs text-white/70">Predictions</div>
              <div className="mt-1 text-xl font-bold">124</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
              <div className="text-xs text-white/70">7d Streak</div>
              <div className="mt-1 text-xl font-bold text-lime">+5</div>
            </div>
          </div>
        </div>
        <button className="ml-auto rounded-md border border-teal/60 text-teal px-3 py-1.5 hover:bg-teal/10 text-sm">Follow</button>
      </div>

      {/* Quick actions */}
      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <button onClick={()=>setShowFollow(true)} className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 hover:bg-white/[0.06]">Simulate Follow</button>
        <button className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 hover:bg-white/[0.06]">Alert</button>
        <button onClick={()=>setShowExec(true)} className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 hover:bg-white/[0.06]">Execute</button>
      </div>
      {showSim && <SimulateModal ctx={ctx} onClose={()=>setShowSim(false)} />}
      {showFollow && <FollowSimulateModal ctx={followCtx} onClose={()=>setShowFollow(false)} />}
      {showExec && <ExecuteModal ctx={ctx} onClose={()=>setShowExec(false)} />}
    </div>
  )
}

export function WhaleProfileCard() {
  const history: HistoryItem[] = [
    { market: 'ETH ETF approval by Q4', direction: 'Long', stake: '$12,000', result: 'Win', pnl: '+$6,240' },
    { market: 'Trump wins NV by >4%', direction: 'Long', stake: '$8,500', result: 'Win', pnl: '+$3,145' },
    { market: 'Rate cut in Nov FOMC', direction: 'Short', stake: '$10,000', result: 'Loss', pnl: '-$2,100' },
  ]

  const totalPnL = '+$7,285'
  const roi = '+18.2% (30d)'

  const [showFollow, setShowFollow] = useState(false)
  const followCtx: FollowContext = { id: '0x42a1', name: '0x42A1...9fC7', periodLabel: '30d' }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
      <div className="flex items-start gap-4">
        <div className="h-14 w-14 md:h-16 md:w-16 rounded-xl grid place-items-center border border-white/10 bg-white/10">
          <Wallet className="text-teal" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-semibold">0x42A1...9fC7</div>
            <button className="rounded-md border border-white/10 px-2 py-0.5 text-xs text-white/70 hover:bg-white/10" aria-label="Copy wallet">
              <Copy size={14} />
            </button>
            <a href="#" className="rounded-md border border-white/10 px-2 py-0.5 text-xs text-white/70 hover:bg-white/10" aria-label="View on explorer">
              <ExternalLink size={14} />
            </a>
          </div>
          <div className="mt-1 text-sm text-white/70">Capital deployed (30d): $145,300 • Preferred: Politics, Crypto</div>

          {/* Smart money rationale moved under Recent History for alignment */}
        </div>
        <div className="text-right">
          <div className="text-xs text-white/70">30d PnL</div>
          <div className="text-lg font-bold text-teal">{totalPnL}</div>
          <div className="mt-1 inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 text-xs">
            <TrendingUp size={14} className="text-teal" /> {roi}
          </div>
        </div>
      </div>

      {/* History */}
      <div className="mt-4 border-t border-white/10 pt-3">
        <div className="text-sm font-semibold mb-2">Recent History</div>
        {/* Why Smart Money: align with history rows */}
        <div className="space-y-2 mb-3">
          <div className="text-[11px] tracking-wide uppercase text-white/60">Why Smart Money</div>
          <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Trophy size={16} className="text-white/70" /> Consistent Profitability
            </div>
            <div className="mt-1 text-white/80 text-sm">8/10 last bets profitable</div>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Crown size={16} className="text-white/70" /> Early Entry
            </div>
            <div className="mt-1 text-white/80 text-sm">Avg entry 22h before moves</div>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles size={16} className="text-white/70" /> Market Selection
            </div>
            <div className="mt-1 text-white/80 text-sm">Focus on high‑liquidity markets</div>
          </div>
        </div>
        <div className="space-y-2">
          {history.map((h, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto_auto] gap-2 sm:items-center rounded-md border border-white/10 bg-white/[0.02] p-2">
              <div className="text-sm">{h.market}</div>
              <div className="text-xs text-white/70">{h.direction}</div>
              <div className="text-xs text-white/70">Stake {h.stake}</div>
              <div className={`text-xs ${h.result === 'Win' ? 'text-teal' : 'text-red-400'} flex items-center gap-1`}>
                {h.result === 'Win' ? <TrendingUp size={14} /> : <TrendingDown size={14} />} {h.result}
              </div>
              <div className={`text-sm font-semibold ${h.pnl.startsWith('+') ? 'text-teal' : 'text-red-400'}`}>{h.pnl}</div>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <button onClick={()=>setShowFollow(true)} className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-sm hover:bg-white/[0.06]">
            Simulate Follow
          </button>
        </div>
        {showFollow && <FollowSimulateModal ctx={followCtx} onClose={()=>setShowFollow(false)} />}
      </div>
    </div>
  )
}
