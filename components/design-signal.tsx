"use client"
import { ArrowUpRight, ArrowDownRight, BellRing, Bot, Copy, ExternalLink, Flame, Wallet, ArrowLeftRight, BarChart2, Coins, RefreshCw, MessageSquare, Hash, Activity } from 'lucide-react'
import { ExecuteModal, SimulateModal, TradeContext } from '@/components/design-actions'
import { useState } from 'react'

type Direction = 'Long' | 'Short'

type Alert = {
  wallet: string
  market: string
  direction: Direction
  amount: string
  odds: string
  timeAgo: string
  caption?: string
}

function DirBadge({ d }: { d: Direction }) {
  const up = d === 'Long'
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${up ? 'border-teal/60 text-teal' : 'border-red-400/60 text-red-400'}`}>
      {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {d}
    </span>
  )
}

export function SignalAlertCard({ alert }: { alert: Alert }) {
  const { wallet, market, direction, amount, odds, timeAgo, caption } = alert
  const ctx: TradeContext = { market, direction, price: parseFloat(odds), defaultAmount: parseFloat(amount.replace(/[^0-9.]/g, '')) || 1000 }
  const [showSim, setShowSim] = useState(false)
  const [showExec, setShowExec] = useState(false)
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:p-5">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg grid place-items-center border border-white/10 bg-white/10">
          <BellRing className="text-teal" size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white/70">New Bet Alert • {timeAgo}</div>
          <div className="mt-0.5 text-base font-semibold">{market}</div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <DirBadge d={direction} />
            <span className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-0.5">Stake {amount}</span>
            <span className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-0.5">Odds {odds}</span>
            <span className="inline-flex items-center gap-1 text-white/70"><Wallet size={14}/> {wallet}</span>
            <button className="rounded-md border border-white/10 px-2 py-0.5 text-xs text-white/70 hover:bg-white/10" aria-label="Copy wallet"><Copy size={14}/></button>
            <a href="#" className="rounded-md border border-white/10 px-2 py-0.5 text-xs text-white/70 hover:bg-white/10" aria-label="View on explorer"><ExternalLink size={14}/></a>
          </div>

          {caption && (
            <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-sm flex items-start gap-2">
              <Flame className="text-lime" size={16} />
              <div className="text-white/85">{caption}</div>
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <button onClick={()=>setShowSim(true)} className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 hover:bg-white/[0.06]">Simulate</button>
            <button className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 hover:bg-white/[0.06]">Follow</button>
            <button onClick={()=>setShowExec(true)} className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 hover:bg-white/[0.06] hidden sm:block">Execute</button>
          </div>
        </div>
      </div>
      {showSim && <SimulateModal ctx={ctx} onClose={()=>setShowSim(false)} />}
      {showExec && <ExecuteModal ctx={ctx} onClose={()=>setShowExec(false)} />}
    </div>
  )
}

function ConsiderationCard({ title, detail, actions = [] }: { title: string; detail: string; actions?: string[] }) {
  function iconFor(title: string) {
    if (title.toLowerCase().includes('arbitrage')) return <ArrowLeftRight size={16} className="text-teal" />
    if (title.toLowerCase().includes('price gap')) return <BarChart2 size={16} className="text-teal" />
    if (title.toLowerCase().includes('meme coin')) return <Coins size={16} className="text-teal" />
    if (title.toLowerCase().includes('market making')) return <RefreshCw size={16} className="text-teal" />
    return <BarChart2 size={16} className="text-teal" />
  }
  return (
    <div className="rounded-xl border border-white/10 bg-[#0F0F0F] p-3">
      <div className="flex items-start gap-2">
        {iconFor(title)}
        <div className="flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className="mt-1 text-sm text-white/80">{detail}</div>
          {actions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {actions.map((a, i) => (
                <button key={i} className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 hover:bg-white/[0.06]">{a}</button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )}

// Sentiment helpers
function SentimentBar({ score }: { score: number }) {
  const pct = Math.round(((score + 1) / 2) * 100)
  const color = score >= 0 ? 'bg-[linear-gradient(90deg,#00E5FF,#B6FF00)]' : 'bg-[linear-gradient(90deg,#ef4444,#f97316)]'
  return (
    <div className="h-2 rounded bg-white/10 overflow-hidden">
      <div className={`h-2 ${color}`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function SentimentCard({ topic, sentiment, volumeDelta, entities, samples }: { topic: string; sentiment: number; volumeDelta: number; entities?: string[]; samples?: string[] }) {
  const dir = sentiment >= 0 ? 'Bullish' : 'Bearish'
  return (
    <div className="rounded-xl border border-white/10 bg-[#0F0F0F] p-3">
      <div className="flex items-start gap-2">
        <MessageSquare size={16} className="text-teal" />
        <div className="flex-1">
          <div className="text-sm font-semibold">Sentiment • {topic}</div>
          <div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-white/70 text-xs mb-1">Score ({dir})</div>
              <SentimentBar score={sentiment} />
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 flex items-center gap-2">
              <Activity size={14} className="text-teal" /> Vol Δ {(Math.round(volumeDelta*100))}%
            </div>
            {entities && entities.length>0 && (
              <div className="flex items-center gap-2 text-xs text-white/80">
                <Hash size={14} className="text-white/60" /> {entities.join(', ')}
              </div>
            )}
          </div>
          {samples && samples.length>0 && (
            <div className="mt-2 grid gap-1 text-xs text-white/70">
              {samples.slice(0,2).map((s,i)=> (
                <div key={i} className="rounded bg-white/[0.04] px-2 py-1">“{s}”</div>
              ))}
            </div>
          )}
          <div className="mt-2 flex gap-2 text-xs">
            <button className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 hover:bg-white/[0.06]">Watch Keyword</button>
            <button className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 hover:bg-white/[0.06]">Create Alert</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SignalFeed() {
  const items: Array<
    { type: 'system'; text: string; time: string } |
    { type: 'alert'; data: Alert } |
    { type: 'consideration'; title: string; detail: string; actions?: string[] } |
    { type: 'sentiment'; topic: string; sentiment: number; volumeDelta: number; entities?: string[]; samples?: string[] }
  > = [
    { type: 'system', text: "Inflow spike detected: 'US CPI surprise > 0.3%' +14% OI in 12m.", time: '2m' },
    { type: 'alert', data: { wallet: '0x42A1...9fC7', market: 'ETH ETF approval by Q4', direction: 'Long', amount: '$12,000', odds: '0.56', timeAgo: '5m', caption: 'Desk thinks SEC is warming up after staff comments.' } },
    // Sentiment / NLP cards
    { type: 'sentiment', topic: 'ETH ETF', sentiment: 0.62, volumeDelta: 0.34, entities: ['SEC', 'BlackRock'], samples: ['hearing chatter sec ready to move', 'flows picking up again #ETHEtf'] },
    { type: 'sentiment', topic: 'NV turnout > 62%', sentiment: -0.18, volumeDelta: 0.21, entities: ['Nevada', 'Turnout'], samples: ['new canvass suggests softer turnout in Clark', 'odds feel rich here']} ,
    { type: 'consideration', title: 'Arbitrage Across Platforms', detail: 'Check spreads between venues for correlated markets. Route to best price and size efficiently.', actions: ['Simulate Spread', 'Track Pair'] },
    { type: 'consideration', title: 'Event Price Gap: Polymarket vs Kalshi vs Betfair', detail: 'Observed 4–7% gap on “NV turnout > 62%”. Possible hedge opportunity.', actions: ['Create Basket', 'Alert on ≥3%'] },
    { type: 'consideration', title: 'Meme Coin Cross: Pump.fun vs Raydium vs Orca', detail: 'New tickers with CEX rumors pump first on Pump.fun. Mirror liquidity to Raydium/Orca.', actions: ['Watchlist', 'Route Liquidity'] },
    { type: 'consideration', title: 'Micro Market Making', detail: 'Some wallets buy dips and auto-sell at +5%. Configure bot-style rules for small mean-reversion.', actions: ['Set Rule', 'Backtest 30d'] },
    { type: 'system', text: 'Spread tightened on “NV turnout > 62%”. Momentum building.', time: '9m' },
    { type: 'alert', data: { wallet: '0x88B0...2e19', market: 'Trump wins NV by >4%', direction: 'Long', amount: '$8,500', odds: '0.41', timeAgo: '14m' } },
  ]

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
      <div className="text-sm font-semibold mb-1 flex items-center gap-2"><Bot className="text-teal" size={16}/> Signal Feed</div>

      {items.map((it, idx) => {
        if (it.type === 'system') {
          return (
            <div key={idx} className="rounded-lg border border-white/10 bg-[#0F0F0F] p-3 text-sm">
              <div className="flex items-start gap-2 text-white/85">
                <span className="text-white/60 text-xs">[{it.time}]</span>
                <span>{it.text}</span>
              </div>
            </div>
          )
        }
        if (it.type === 'alert') {
          return <SignalAlertCard key={idx} alert={it.data} />
        }
        if (it.type === 'consideration') {
          return <ConsiderationCard key={idx} title={it.title} detail={it.detail} actions={it.actions} />
        }
        // sentiment
        return <SentimentCard key={idx} topic={it.topic} sentiment={it.sentiment} volumeDelta={it.volumeDelta} entities={it.entities} samples={it.samples} />
      })}
    </div>
  )
}
