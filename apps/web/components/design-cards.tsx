"use client"
import { Wallet, TrendingUp, TrendingDown, Share2, BarChart3 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
// Backtest/execute temporarily removed from UI

type Mode = 'dark' | 'light'
type Density = 'normal' | 'compact'

function theme(mode: Mode) {
  const isLight = mode === 'light'
  return {
    panel: isLight ? 'rounded-2xl border border-neutral-100 bg-white text-neutral-900' : 'rounded-2xl border border-white/5 bg-white/[0.03]',
    subPanel: isLight ? 'rounded-md border border-neutral-100 bg-neutral-50 text-neutral-900' : 'rounded-md border border-white/5 bg-white/[0.04]',
    chip: isLight ? 'rounded-md border border-neutral-200 bg-white' : 'rounded-md border border-white/10 bg-white/5',
    btn: isLight ? 'rounded-md border border-neutral-200 bg-white hover:bg-neutral-50' : 'rounded-md border border-white/10 bg-white/[0.03] hover:bg-white/[0.06]',
    subtle: isLight ? 'border-neutral-100 bg-neutral-50' : 'border-white/5 bg-white/[0.03]',
    divider: isLight ? 'border-neutral-100' : 'border-white/5',
    textMuted: isLight ? 'text-neutral-600' : 'text-white/70',
    textSoft: isLight ? 'text-neutral-700' : 'text-white/80',
  }
}

type HistoryItem = {
  market: string
  direction: 'Long' | 'Short'
  stake: string
  result: 'Win' | 'Loss'
  pnl: string
}

export function UserProfileCard({ mode = 'dark', density = 'normal' }: { mode?: Mode; density?: Density }) {
  const t = theme(mode)
  const isCompact = density === 'compact'
  // Backtest/execute hidden for now
  const [showShare, setShowShare] = useState(false)
  
  return (
    <div className={`${t.panel} ${isCompact ? 'p-3' : 'p-5 md:p-6'}`}>
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <div className={`${isCompact ? 'text-base' : 'text-lg'} font-semibold`}>AlphaNate</div>
            <span className={`${t.chip} px-2 py-0.5 text-xs`}>@alphanate</span>
          </div>
          <div className={`mt-1 text-sm ${t.textMuted}`}>Macro & AI equities • United States</div>

          {/* Stats - simplified, no boxes */}
          <div className={`mt-3 space-y-2 ${isCompact ? 'text-sm' : 'text-base'}`}>
            <div className="flex items-baseline gap-2">
              <span className={`text-xs ${t.textMuted}`}>Win Rate (SMTM)</span>
              <span className="font-bold text-teal text-xl">68%</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-xs ${t.textMuted}`}>Predictions</span>
              <span className="font-bold text-xl">124</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className={`text-xs ${t.textMuted}`}>7d Streak</span>
              <span className="font-bold text-lime text-xl">+5</span>
            </div>
          </div>
        </div>
        <button className={`ml-auto self-start rounded-md border border-teal/60 text-teal ${isCompact ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'} hover:bg-teal/10`}>Follow</button>
      </div>

      {/* Quick actions */}
      <div className={`mt-4 grid grid-cols-1 gap-2 ${isCompact ? 'text-xs' : 'text-sm'}`}>
        <button onClick={()=>setShowShare(true)} className={`${t.btn} ${isCompact ? 'px-2 py-1' : 'px-3 py-2'}`}>Share</button>
      </div>
      {/* Backtest/Execute temporarily removed */}
      {showShare && <ShareWinModal mode={mode} onClose={()=>setShowShare(false)} username="AlphaNate" handle="@alphanate" winRate={68} streak={5} />}
    </div>
  )
}

function ShareWinModal({ mode='dark', onClose, username, handle, winRate, streak }: { mode?: Mode; onClose: ()=>void; username: string; handle: string; winRate: number; streak: number }) {
  const isLight = mode === 'light'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const W = 640, H = 360
    c.width = W; c.height = H
    const ctx = c.getContext('2d')!
    // background
    const g = ctx.createLinearGradient(0, 0, W, H)
    if (isLight) { g.addColorStop(0, '#F8FBFF'); g.addColorStop(1, '#F6FFF0') } else { g.addColorStop(0, '#06131A'); g.addColorStop(1, '#0F1A06') }
    ctx.fillStyle = g
    ctx.fillRect(0,0,W,H)
    // title
    ctx.fillStyle = isLight ? '#111827' : '#E5E7EB'
    ctx.font = '700 20px system-ui'
    ctx.fillText('SMTM • Share My Win', 20, 34)
    // name
    ctx.fillStyle = isLight ? '#0F172A' : '#FFFFFF'
    ctx.font = '700 28px system-ui'
    ctx.fillText(username, 20, 78)
    ctx.fillStyle = isLight ? '#475569' : '#9CA3AF'
    ctx.font = '16px system-ui'
    ctx.fillText(handle, 20, 104)
    // metrics boxes
    const box = (x:number,y:number,w:number,h:number,label:string,value:string,color='#00E5FF')=>{
      ctx.fillStyle = isLight ? 'rgba(15,23,42,0.04)' : 'rgba(255,255,255,0.06)'
      ctx.strokeStyle = isLight ? '#E5E7EB' : '#1F2937'
      ctx.lineWidth = 1
      roundRect(ctx, x,y,w,h,10,true,true)
      ctx.fillStyle = isLight ? '#4B5563' : '#9CA3AF'
      ctx.font = '600 14px system-ui'
      ctx.fillText(label, x+14, y+28)
      ctx.fillStyle = color
      ctx.font = '700 26px system-ui'
      ctx.fillText(value, x+14, y+60)
    }
    box(20, 130, 180, 80, 'Win Rate', `${winRate}%`, '#00E5FF')
    box(220, 130, 180, 80, '7d Streak', `+${streak}`, '#B6FF00')
    // footer
    ctx.fillStyle = isLight ? '#6B7280' : '#9CA3AF'
    ctx.font = '14px system-ui'
    ctx.fillText('Truth is Profitable. smtm.example.com', 20, H-24)

    function roundRect(ctx2:CanvasRenderingContext2D, x:number, y:number, w:number, h:number, r:number, fill:boolean, stroke:boolean){
      if (w < 2 * r) r = w / 2; if (h < 2 * r) r = h / 2
      ctx2.beginPath()
      ctx2.moveTo(x+r, y)
      ctx2.arcTo(x+w, y, x+w, y+h, r)
      ctx2.arcTo(x+w, y+h, x, y+h, r)
      ctx2.arcTo(x, y+h, x, y, r)
      ctx2.arcTo(x, y, x+w, y, r)
      ctx2.closePath()
      if (fill) ctx2.fill(); if (stroke) ctx2.stroke()
    }
  }, [mode, username, handle, winRate, streak])

  async function copyPng() {
    const c = canvasRef.current; if (!c) return
    const blob: Blob | null = await new Promise(resolve => c.toBlob(b => resolve(b), 'image/png'))
    if (blob && 'clipboard' in navigator && 'ClipboardItem' in window) {
      try {
        // @ts-ignore
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
        window.alert('Share image copied to clipboard')
        return
      } catch {}
    }
    const url = c.toDataURL('image/png'); const a = document.createElement('a'); a.href = url; a.download = 'smtm-win.png'; a.click()
  }

  function copyText() {
    const text = `${username} just won on SMTM! Win rate ${winRate}%, 7d streak +${streak}.` 
    navigator.clipboard.writeText(text).then(()=>window.alert('Share text copied'))
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/70" onClick={onClose} />
      <div className="fixed z-50 inset-0 grid place-items-center p-4">
        <div className={`w-full max-w-[340px] rounded-2xl border ${mode==='light'?'border-neutral-200 bg-white text-neutral-900':'border-white/10 bg-[#0F0F0F]'} shadow-glow max-h-[85vh] overflow-y-auto`}>
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="text-lg font-semibold">Share My Win</div>
              <button onClick={onClose} className={`ml-auto rounded-md border ${mode==='light'?'border-neutral-200 hover:bg-neutral-50':'border-white/10 hover:bg-white/10'} p-1`}>×</button>
            </div>
            <div className="mt-2 rounded-lg overflow-hidden bg-black/5">
              <canvas ref={canvasRef} className="w-full h-auto" />
            </div>
            <div className="mt-3 flex items-center justify-end gap-2 text-sm">
              <button onClick={copyText} className={`rounded-md border ${mode==='light'?'border-neutral-200 bg-white hover:bg-neutral-50':'border-white/10 bg-white/[0.02] hover:bg-white/[0.06]'} px-3 py-2`}>Copy Text</button>
              <button onClick={copyPng} className="rounded-md bg-cta-gradient text-black font-semibold px-4 py-2">Copy PNG</button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export function WhaleProfileCard({ mode = 'dark', density = 'normal' }: { mode?: Mode; density?: Density }) {
  const t = theme(mode)
  const isCompact = density === 'compact'
  const history: HistoryItem[] = [
    { market: 'ETH ETF approval by Q4', direction: 'Long', stake: '$12,000', result: 'Win', pnl: '+$6,240' },
    { market: 'Trump wins NV by >4%', direction: 'Long', stake: '$8,500', result: 'Win', pnl: '+$3,145' },
    { market: 'Rate cut in Nov FOMC', direction: 'Short', stake: '$10,000', result: 'Loss', pnl: '-$2,100' },
  ]

  const totalPnL = '+$7,285'
  const roi = '+18.2% (30d)'

  const [showShare, setShowShare] = useState(false)

  return (
    <div className={`${t.panel} ${isCompact ? 'p-3' : 'p-5 md:p-6'}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className={`${isCompact ? 'text-sm' : ''} font-semibold truncate`}>0x42A1...9fC7</div>
          </div>
          <div className={`mt-1 ${isCompact ? 'text-xs' : 'text-sm'} ${t.textMuted}`}>Capital deployed (30d): $145k • Politics, Crypto</div>
          {/* Inline compact stats */}
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className={`${t.chip} px-2 py-0.5`}>PnL 30d <span className="font-semibold text-teal">{totalPnL}</span></span>
            <span className={`${t.chip} px-2 py-0.5`}>ROI <span className="font-semibold text-teal">{roi}</span></span>
          </div>
        </div>
      </div>

      {/* History (compact, latest only) */}
      <div className={`mt-3 border-t ${t.divider} pt-2`}>
        <div className={`text-xs ${t.textMuted} mb-1`}>Latest Trade</div>
        {history.slice(0,1).map((h, i) => (
          <div key={i} className={`rounded-md border ${t.subtle} p-2 text-xs` }>
            <div className="flex items-center gap-2">
              <span className={`${t.textMuted} shrink-0`}>{h.direction} • {h.stake}</span>
              <span className="truncate" title={h.market}>{h.market}</span>
              <span className={`${h.result === 'Win' ? 'text-teal' : 'text-red-400'} font-semibold flex items-center gap-1 ml-auto`}>
                {h.result === 'Win' ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{h.pnl}
              </span>
            </div>
          </div>
        ))}
        <div className="mt-2">
          <button onClick={()=>setShowShare(true)} className={`${t.btn} inline-flex items-center justify-center gap-1 px-3 py-2 text-sm w-full`}>
            <Share2 size={14}/> Share Whale
          </button>
        </div>
        {showShare && (
          <ShareWhaleModal mode={mode} onClose={()=>setShowShare(false)} walletLabel={'0x42A1...9fC7'} pnl={totalPnL} roi={roi} />
        )}
      </div>
    </div>
  )
}

function ShareWhaleModal({ mode='dark', onClose, walletLabel, pnl, roi }: { mode?: Mode; onClose: ()=>void; walletLabel: string; pnl: string; roi: string }) {
  const isLight = mode === 'light'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const W = 640, H = 360
    c.width = W; c.height = H
    const ctx = c.getContext('2d')!
    const g = ctx.createLinearGradient(0, 0, W, H)
    if (isLight) { g.addColorStop(0, '#F8FBFF'); g.addColorStop(1, '#F6FFF0') } else { g.addColorStop(0, '#06131A'); g.addColorStop(1, '#0F1A06') }
    ctx.fillStyle = g
    ctx.fillRect(0,0,W,H)
    // header
    ctx.fillStyle = isLight ? '#111827' : '#E5E7EB'
    ctx.font = '700 20px system-ui'
    ctx.fillText('SMTM • Whale Snapshot', 20, 34)
    ctx.fillStyle = isLight ? '#0F172A' : '#FFFFFF'
    ctx.font = '700 24px system-ui'
    ctx.fillText(walletLabel, 20, 72)
    // metrics boxes
    const box = (x:number,y:number,w:number,h:number,label:string,value:string,color='#00E5FF')=>{
      ctx.fillStyle = isLight ? 'rgba(15,23,42,0.04)' : 'rgba(255,255,255,0.06)'
      ctx.strokeStyle = isLight ? '#E5E7EB' : '#1F2937'
      ctx.lineWidth = 1
      roundRect(ctx, x,y,w,h,10,true,true)
      ctx.fillStyle = isLight ? '#4B5563' : '#9CA3AF'
      ctx.font = '600 14px system-ui'
      ctx.fillText(label, x+14, y+28)
      ctx.fillStyle = color
      ctx.font = '700 26px system-ui'
      ctx.fillText(value, x+14, y+60)
    }
    box(20, 110, 220, 84, '30d PnL', pnl, pnl.startsWith('+') ? '#00E5FF' : '#ef4444')
    box(260, 110, 220, 84, 'ROI (30d)', roi, '#00E5FF')
    // footer
    ctx.fillStyle = isLight ? '#6B7280' : '#9CA3AF'
    ctx.font = '14px system-ui'
    ctx.fillText('Share to discuss whether to follow.', 20, H-48)
    ctx.fillText('smtm.example.com', 20, H-24)

    function roundRect(ctx2:CanvasRenderingContext2D, x:number, y:number, w:number, h:number, r:number, fill:boolean, stroke:boolean){
      if (w < 2 * r) r = w / 2; if (h < 2 * r) r = h / 2
      ctx2.beginPath()
      ctx2.moveTo(x+r, y)
      ctx2.arcTo(x+w, y, x+w, y+h, r)
      ctx2.arcTo(x+w, y+h, x, y+h, r)
      ctx2.arcTo(x, y+h, x, y, r)
      ctx2.arcTo(x, y, x+w, y, r)
      ctx2.closePath()
      if (fill) ctx2.fill(); if (stroke) ctx2.stroke()
    }
  }, [mode, walletLabel, pnl, roi])

  async function copyPng() {
    const c = canvasRef.current; if (!c) return
    const blob: Blob | null = await new Promise(resolve => c.toBlob(b => resolve(b), 'image/png'))
    if (blob && 'clipboard' in navigator && 'ClipboardItem' in window) {
      try {
        // @ts-ignore
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
        window.alert('Share image copied to clipboard')
        return
      } catch {}
    }
    const url = c.toDataURL('image/png'); const a = document.createElement('a'); a.href = url; a.download = 'smtm-whale.png'; a.click()
  }

  function copyText() {
    const text = `Whale ${walletLabel} • 30d PnL ${pnl}, ROI ${roi}.`
    navigator.clipboard.writeText(text).then(()=>window.alert('Share text copied'))
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/70" onClick={onClose} />
      <div className="fixed z-50 inset-0 grid place-items-center p-4">
        <div className={`w-full max-w-[340px] rounded-2xl border ${mode==='light'?'border-neutral-200 bg-white text-neutral-900':'border-white/10 bg-[#0F0F0F]'} shadow-glow max-h-[85vh] overflow-y-auto`}>
          <div className="p-4">
            <div className="flex items-start gap-3">
              <div className="text-lg font-semibold">Share Whale</div>
              <button onClick={onClose} className={`ml-auto rounded-md border ${mode==='light'?'border-neutral-200 hover:bg-neutral-50':'border-white/10 hover:bg-white/10'} p-1`}>×</button>
            </div>
            <div className="mt-2 rounded-lg overflow-hidden bg-black/5">
              <canvas ref={canvasRef} className="w-full h-auto" />
            </div>
            <div className="mt-3 flex items-center justify-end gap-2 text-sm">
              <button onClick={copyText} className={`rounded-md border ${mode==='light'?'border-neutral-200 bg-white hover:bg-neutral-50':'border-white/10 bg-white/[0.02] hover:bg-white/[0.06]'} px-3 py-2`}>Copy Text</button>
              <button onClick={copyPng} className="rounded-md bg-cta-gradient text-black font-semibold px-4 py-2">Copy PNG</button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

type MarketData = {
  question: string
  category: string
  yesPrice: number
  noPrice: number
  volume24h: string
  liquidity: string
  endDate: string
  trending?: boolean
  priceChange?: string
}

export function MarketCard({ mode = 'dark', density = 'normal', market: marketProp }: { mode?: Mode; density?: Density; market?: MarketData }) {
  const t = theme(mode)
  const isCompact = density === 'compact'

  // Sample market data with fallback
  const market = marketProp || {
    question: "Will Trump win Pennsylvania by >3%?",
    category: "Politics",
    yesPrice: 0.58,
    noPrice: 0.42,
    volume24h: "$1.2M",
    liquidity: "$450K",
    endDate: "Nov 5, 2024",
    trending: true,
    priceChange: "+0.04"
  }

  const priceChange = market.priceChange || "+0.04"
  const isUp = priceChange.startsWith('+')

  return (
    <div className={`${t.panel} ${isCompact ? 'p-3' : 'p-4 md:p-5'}`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {/* Category and trending badge */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`${t.chip} px-2 py-0.5 text-xs`}>{market.category}</span>
            {market.trending && (
              <span className="inline-flex items-center gap-1 rounded-md border border-lime/60 bg-lime/10 px-2 py-0.5 text-xs text-lime">
                <TrendingUp size={12} /> Trending
              </span>
            )}
          </div>

          {/* Question */}
          <div className={`${isCompact ? 'text-sm' : 'text-base'} font-semibold mb-3`}>
            {market.question}
          </div>

          {/* Price display - Polymarket style */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className={`${mode==='light'?'rounded-lg border border-teal/30 bg-teal/5':'rounded-lg border border-teal/20 bg-teal/5'} ${isCompact ? 'p-2' : 'p-3'}`}>
              <div className={`text-xs ${t.textMuted} mb-1`}>Yes</div>
              <div className="flex items-baseline gap-2">
                <div className={`${isCompact ? 'text-xl' : 'text-2xl'} font-bold text-teal`}>
                  {Math.round(market.yesPrice * 100)}¢
                </div>
                <span className={`text-xs ${isUp ? 'text-teal' : 'text-red-400'} flex items-center gap-0.5`}>
                  {isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {priceChange}
                </span>
              </div>
            </div>
            <div className={`${mode==='light'?'rounded-lg border border-neutral-200 bg-neutral-50':'rounded-lg border border-white/10 bg-white/5'} ${isCompact ? 'p-2' : 'p-3'}`}>
              <div className={`text-xs ${t.textMuted} mb-1`}>No</div>
              <div className={`${isCompact ? 'text-xl' : 'text-2xl'} font-bold`}>
                {Math.round(market.noPrice * 100)}¢
              </div>
            </div>
          </div>

          {/* Market stats */}
          <div className="flex items-center gap-3 text-xs mb-3">
            <span className={t.textMuted}>Vol 24h: <span className="font-semibold">{market.volume24h}</span></span>
            <span className={t.textMuted}>Liquidity: <span className="font-semibold">{market.liquidity}</span></span>
          </div>

          <div className={`text-xs ${t.textMuted}`}>
            Closes {market.endDate}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className={`mt-3 grid grid-cols-2 gap-2 ${isCompact ? 'text-xs' : 'text-sm'}`}>
        <button className={`rounded-md bg-teal/20 border border-teal/40 text-teal hover:bg-teal/30 ${isCompact ? 'px-2 py-1' : 'px-3 py-2'} font-semibold`}>
          Trade
        </button>
        <button className={`${t.btn} ${isCompact ? 'px-2 py-1' : 'px-3 py-2'}`}>
          View Chart
        </button>
      </div>
    </div>
  )
}
