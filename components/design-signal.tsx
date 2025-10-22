"use client"
import { ArrowUpRight, ArrowDownRight, BellRing, Bot, Copy, ExternalLink, Flame, Wallet, ArrowLeftRight, BarChart2, Coins, RefreshCw, MessageSquare, Hash, Activity } from 'lucide-react'
import { ExecuteModal, SimulateModal, TradeContext } from '@/components/design-actions'
import { useState } from 'react'

type Direction = 'Long' | 'Short'

type Mode = 'dark' | 'light'
type Density = 'normal' | 'compact'

function theme(mode: Mode) {
  const isLight = mode === 'light'
  return {
    panel: isLight ? 'rounded-2xl border border-neutral-100 bg-white text-neutral-900' : 'rounded-2xl border border-white/5 bg-white/[0.03]',
    subPanel: isLight ? 'rounded-md border border-neutral-100 bg-neutral-50 text-neutral-900' : 'rounded-md border border-white/5 bg-white/[0.04]',
    deepPanel: isLight ? 'rounded-md border border-neutral-100 bg-neutral-50' : 'rounded-md border border-white/5 bg-[#0F0F0F]',
    textMuted: isLight ? 'text-neutral-600' : 'text-white/70',
    textSoft: isLight ? 'text-neutral-700' : 'text-white/80',
    btn: isLight ? 'rounded-md border border-neutral-200 bg-white hover:bg-neutral-50' : 'rounded-md border border-white/10 bg-white/[0.02] hover:bg-white/[0.06]',
    chip: isLight ? 'rounded-md border border-neutral-200 bg-neutral-50' : 'rounded-md border border-white/10 bg-white/[0.02]'
  }
}

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

export function SignalAlertCard({ alert: alertData, mode = 'dark', density = 'normal' }: { alert: Alert; mode?: Mode; density?: Density }) {
  const { wallet, market, direction, amount, odds, timeAgo, caption } = alertData
  const ctx: TradeContext = { market, direction, price: parseFloat(odds), defaultAmount: parseFloat(amount.replace(/[^0-9.]/g, '')) || 1000 }
  const [showSim, setShowSim] = useState(false)
  const [showExec, setShowExec] = useState(false)
  const t = theme(mode)
  const isCompact = density === 'compact'

  function formatPlainAlert(a: Alert) {
    const dir = a.direction
    return [
      `New Bet Alert · ${a.timeAgo}`,
      `${a.market}`,
      `Direction: ${dir} | Stake: ${a.amount} | Odds: ${a.odds}`,
      `Wallet: ${a.wallet}`,
      a.caption ? `${a.caption}` : undefined,
    ].filter(Boolean).join('\n')
  }

  async function copyTelegram() {
    const text = formatPlainAlert(alertData)
    try { await navigator.clipboard.writeText(text); window.alert('Copied for Telegram'); } catch {}
  }

  async function copyDiscord() {
    const text = formatPlainAlert(alertData)
    try { await navigator.clipboard.writeText(text); window.alert('Copied for Discord'); } catch {}
  }
  return (
    <div className={`${t.panel} ${isCompact ? 'p-3' : 'p-4 md:p-5'}`}>
      <div className="flex items-start gap-3">
        <div className={`${isCompact ? 'h-8 w-8' : 'h-10 w-10'} rounded-lg grid place-items-center border ${mode==='light'?'border-neutral-200 bg-neutral-50':'border-white/10 bg-white/10'}`}>
          <BellRing className="text-teal" size={isCompact ? 14 : 18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={`${isCompact ? 'text-xs' : 'text-sm'} ${t.textMuted}`}>New Bet Alert • {timeAgo}</div>
          <div className={`mt-0.5 ${isCompact ? 'text-sm' : 'text-base'} font-semibold`}>{market}</div>
          <div className={`mt-2 grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 ${isCompact ? 'text-xs' : 'text-sm'}`}>
            <DirBadge d={direction} />
            <span className={`${t.chip} px-2 py-0.5`}>Stake {amount}</span>
            <span className={`${t.chip} px-2 py-0.5`}>Odds {odds}</span>
            <span className={`inline-flex items-center gap-1 ${t.textMuted}`}><Wallet size={14}/> {wallet}</span>
            <button className={`${t.btn} px-2 py-0.5 text-xs`} aria-label="Copy wallet"><Copy size={14}/></button>
            <a href="#" className={`${t.btn} px-2 py-0.5 text-xs`} aria-label="View on explorer"><ExternalLink size={14}/></a>
          </div>

          {caption && (
            <div className={`mt-3 ${t.subPanel} ${isCompact ? 'p-2 text-xs' : 'p-3 text-sm'} flex items-start gap-2`}>
              <Flame className="text-lime" size={isCompact ? 14 : 16} />
              <div className={`${t.textSoft}`}>{caption}</div>
            </div>
          )}

          <div className={`mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 ${isCompact ? 'text-xs' : 'text-sm'}`}>
            <button onClick={()=>setShowSim(true)} className={`${t.btn} ${isCompact ? 'px-2 py-1' : 'px-3 py-2'}`}>Sim</button>
            <button className={`${t.btn} ${isCompact ? 'px-2 py-1' : 'px-3 py-2'}`}>Follow</button>
            <button onClick={()=>setShowExec(true)} className={`${t.btn} ${isCompact ? 'px-2 py-1' : 'px-3 py-2'} hidden sm:block`}>Execute</button>
          </div>
          <div className={`mt-2 flex flex-wrap items-center gap-2 ${isCompact ? 'text-[11px]' : 'text-xs'} ${t.textMuted}`}>
            <span className="opacity-80">Copy as:</span>
            <button onClick={copyTelegram} className={`${t.btn} px-2 py-1`}>Telegram</button>
            <button onClick={copyDiscord} className={`${t.btn} px-2 py-1`}>Discord</button>
          </div>
        </div>
      </div>
      {showSim && <SimulateModal mode={mode} ctx={ctx} onClose={()=>setShowSim(false)} />}
      {showExec && <ExecuteModal mode={mode} ctx={ctx} onClose={()=>setShowExec(false)} />}
    </div>
  )
}

function ConsiderationCard({ title, detail, actions = [], mode='dark' }: { title: string; detail: string; actions?: string[]; mode?: Mode }) {
  const t = theme(mode)
  function iconFor(title: string) {
    if (title.toLowerCase().includes('arbitrage')) return <ArrowLeftRight size={16} className="text-teal" />
    if (title.toLowerCase().includes('price gap')) return <BarChart2 size={16} className="text-teal" />
    if (title.toLowerCase().includes('meme coin')) return <Coins size={16} className="text-teal" />
    if (title.toLowerCase().includes('market making')) return <RefreshCw size={16} className="text-teal" />
    return <BarChart2 size={16} className="text-teal" />
  }
  return (
    <div className={`${mode==='light'?'rounded-xl border border-neutral-200 bg-white':'rounded-xl border border-white/10 bg-[#0F0F0F]'} p-3`}>
      <div className="flex items-start gap-2">
        {iconFor(title)}
        <div className="flex-1">
          <div className="text-sm font-semibold">{title}</div>
          <div className={`mt-1 text-sm ${t.textSoft}`}>{detail}</div>
          {actions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {actions.map((a, i) => (
                <button key={i} className={`${t.btn} px-2 py-1`}>{a}</button>
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

function SentimentCard({ topic, sentiment, volumeDelta, entities, samples, mode='dark' }: { topic: string; sentiment: number; volumeDelta: number; entities?: string[]; samples?: string[]; mode?: Mode }) {
  const dir = sentiment >= 0 ? 'Bullish' : 'Bearish'
  return (
    <div className={`${mode==='light'?'rounded-xl border border-neutral-200 bg-neutral-50':'rounded-xl border border-white/10 bg-[#0F0F0F]'} p-3`}>
      <div className="flex items-start gap-2">
        <MessageSquare size={16} className="text-teal" />
        <div className="flex-1">
          <div className="text-sm font-semibold">Sentiment • {topic}</div>
          <div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <div className={`${mode==='light'?'text-neutral-600':'text-white/70'} text-xs mb-1`}>Score ({dir})</div>
              <SentimentBar score={sentiment} />
            </div>
            <div className={`${mode==='light'?'rounded-md border border-neutral-200 bg-white':'rounded-md border border-white/10 bg-white/[0.02]'} px-2 py-1 flex items-center gap-2`}>
              <Activity size={14} className="text-teal" /> Vol Δ {(Math.round(volumeDelta*100))}%
            </div>
            {entities && entities.length>0 && (
              <div className={`flex items-center gap-2 text-xs ${mode==='light'?'text-neutral-700':'text-white/80'}`}>
                <Hash size={14} className={`${mode==='light'?'text-neutral-500':'text-white/60'}`} /> {entities.join(', ')}
              </div>
            )}
          </div>
          {samples && samples.length>0 && (
            <div className={`${mode==='light'?'text-neutral-600':'text-white/70'} mt-2 grid gap-1 text-xs`}>
              {samples.slice(0,2).map((s,i)=> (
                <div key={i} className={`${mode==='light'?'bg-neutral-100':'bg-white/[0.04]'} rounded px-2 py-1`}>“{s}”</div>
              ))}
            </div>
          )}
          <div className="mt-2 flex gap-2 text-xs">
            <button className={`${mode==='light'?'rounded-md border border-neutral-200 bg-white hover:bg-neutral-50':'rounded-md border border-white/10 bg-white/[0.02] hover:bg-white/[0.06]'} px-2 py-1`}>Watch Keyword</button>
            <button className={`${mode==='light'?'rounded-md border border-neutral-200 bg-white hover:bg-neutral-50':'rounded-md border border-white/10 bg-white/[0.02] hover:bg-white/[0.06]'} px-2 py-1`}>Create Alert</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SignalFeed({ mode = 'dark', density = 'normal' }: { mode?: Mode; density?: Density }) {
  // Simplified daily bot pushes: rebate rewards, new bets, and almost-ending low-risk bets
  const items: Array<
    { type: 'engagement'; variant: 'rebate' | 'interesting' | 'almost'; title: string; detail: string; cta?: string; time?: string }
  > = [
    { type: 'engagement', variant: 'rebate', title: 'Daily Rebate Reward', detail: 'You earned $18.40 in trading rebates today. Claim before midnight.', cta: 'Claim', time: '8:00 AM' },
    { type: 'engagement', variant: 'interesting', title: 'New Bet Alert', detail: 'Politics • "Trump wins PA by >3%" — High win-rate trader @AlphaNate just placed $15k Long at 0.58 odds.', cta: 'View', time: '2h ago' },
    { type: 'engagement', variant: 'almost', title: 'Almost Ending — Quick Profit', detail: 'Crypto • "ETH above $3800 by Nov 15" closes in 6h. Currently 0.89 odds, low risk for small gain.', cta: 'Review', time: '4h ago' },
    { type: 'engagement', variant: 'interesting', title: 'New Bet Alert', detail: 'Crypto • "BTC ETF inflows >$500M this week" — Whale wallet 0x42A1...9fC7 placed $22k Long at 0.63.', cta: 'View', time: '6h ago' },
    { type: 'engagement', variant: 'almost', title: 'Almost Ending — Quick Profit', detail: 'Sports • "Lakers win vs Warriors" closes in 3h. Currently 0.78 odds, momentum building.', cta: 'Review', time: 'Yesterday' },
  ]

  const isCompact = density === 'compact'
  return (
    <div className={`${mode==='light'?'rounded-2xl border border-neutral-200 bg-white text-neutral-900':'rounded-2xl border border-white/10 bg-white/[0.02]'} ${isCompact ? 'p-3 space-y-2' : 'p-4 space-y-3'}`}>
      <div className="text-sm font-semibold mb-1 flex items-center gap-2"><Bot className="text-teal" size={16}/> Daily Bot Signals</div>

      {items.map((it, idx) => (
        <EngagementCard key={idx} variant={it.variant} title={it.title} detail={it.detail} cta={it.cta} time={it.time} mode={mode} density={density} />
      ))}
    </div>
  )
}

function EngagementCard({ variant, title, detail, cta, time, mode='dark', density='normal' }: { variant: 'rebate'|'interesting'|'almost'; title: string; detail: string; cta?: string; time?: string; mode?: Mode; density?: Density }) {
  const t = theme(mode)
  const isCompact = density === 'compact'
  function icon() {
    if (variant === 'rebate') return <Coins size={16} className="text-teal" />
    if (variant === 'interesting') return <Flame size={16} className="text-lime" />
    return <Activity size={16} className="text-teal" />
  }
  return (
    <div className={`${t.subPanel} ${isCompact ? 'p-2 text-xs' : 'p-3 text-sm'}`}>
      <div className="flex items-start gap-2">
        {icon()}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="font-semibold">{title}</div>
            {time && <span className={`text-xs ${t.textMuted}`}>• {time}</span>}
          </div>
          <div className={`mt-1 ${t.textSoft}`}>{detail}</div>
        </div>
        {cta && (
          <button className={`${t.btn} ${isCompact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} shrink-0`}>{cta}</button>
        )}
      </div>
    </div>
  )
}
