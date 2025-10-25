'use client'

import { TrendingUp, TrendingDown, Copy, Share2 } from 'lucide-react'

export interface TradeCardProps {
  // Market info
  question: string
  marketSlug?: string

  // Position
  outcome: 'YES' | 'NO'
  side: 'BUY' | 'SELL'

  // Numbers
  odds: number // 0-100 percentage
  size: number // Dollar amount
  avgPrice?: number // Average price in cents
  toWin: number // Potential profit

  // User/Source
  username?: string
  userImage?: string
  source?: 'polymarket' | 'smtm'

  // Timestamps
  timestamp?: string

  // Style variant
  variant?: 'gradient' | 'dark' | 'light'
}

export function TradeCard({
  question,
  marketSlug,
  outcome,
  side,
  odds,
  size,
  avgPrice,
  toWin,
  username,
  userImage,
  source = 'smtm',
  timestamp,
  variant = 'gradient',
}: TradeCardProps) {
  const isYes = outcome === 'YES'
  const isBuy = side === 'BUY'

  // Color scheme based on outcome
  const outcomeColor = isYes ? 'text-emerald-400' : 'text-red-400'
  const outcomeGlow = isYes ? 'text-emerald-300' : 'text-red-300'
  const profitColor = 'text-green-400'

  // Background gradients
  const backgrounds = {
    gradient: 'bg-gradient-to-br from-blue-600 via-purple-600 to-purple-800',
    dark: 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900',
    light: 'bg-gradient-to-br from-white to-gray-50',
  }

  const textColor = variant === 'light' ? 'text-gray-900' : 'text-white'
  const subTextColor = variant === 'light' ? 'text-gray-600' : 'text-white/70'

  return (
    <div className={`relative overflow-hidden rounded-2xl ${backgrounds[variant]} p-6 shadow-2xl max-w-md`}>
      {/* Background decorative elements */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

      <div className="relative z-10">
        {/* Header - Source branding */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {source === 'polymarket' ? (
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-white/20 backdrop-blur rounded flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-white rotate-45" />
                </div>
                <span className={`text-sm font-semibold ${textColor}`}>Polymarket</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="text-xs tracking-[0.2em] uppercase font-bold text-teal">SMTM</div>
              </div>
            )}
          </div>

          {timestamp && (
            <span className={`text-xs ${subTextColor}`}>{timestamp}</span>
          )}
        </div>

        {/* User info if provided */}
        {username && (
          <div className="flex items-center gap-2 mb-4">
            {userImage ? (
              <img src={userImage} alt={username} className="w-10 h-10 rounded-full border-2 border-white/20" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur border border-white/20" />
            )}
            <span className={`text-sm font-medium ${textColor}`}>{username}</span>
          </div>
        )}

        {/* Market question */}
        <h3 className={`text-lg font-bold ${textColor} mb-6 leading-snug`}>
          {question}
        </h3>

        {/* Outcome badge */}
        <div className="mb-6">
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-black/20 backdrop-blur border ${isYes ? 'border-emerald-500/30' : 'border-red-500/30'}`}>
            {isBuy ? <TrendingUp size={18} className={outcomeColor} /> : <TrendingDown size={18} className={outcomeColor} />}
            <span className={`text-2xl font-black ${outcomeColor}`}>{outcome}</span>
            {avgPrice && (
              <span className={`text-sm ${subTextColor}`}>Avg {avgPrice}¢</span>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {/* Odds */}
          <div className="rounded-xl bg-white/5 backdrop-blur border border-white/10 p-3">
            <div className={`text-xs ${subTextColor} uppercase tracking-wider mb-1`}>Odds</div>
            <div className={`text-2xl font-black ${textColor}`}>{odds}%</div>
          </div>

          {/* Size */}
          <div className="rounded-xl bg-white/5 backdrop-blur border border-white/10 p-3">
            <div className={`text-xs ${subTextColor} uppercase tracking-wider mb-1`}>Size</div>
            <div className={`text-2xl font-black ${textColor}`}>${size}</div>
          </div>

          {/* To Win */}
          <div className="rounded-xl bg-white/5 backdrop-blur border border-white/10 p-3">
            <div className={`text-xs ${subTextColor} uppercase tracking-wider mb-1`}>To Win</div>
            <div className={`text-2xl font-black ${profitColor}`}>${toWin.toFixed(2)}</div>
          </div>
        </div>

        {/* Potential profit calculation */}
        <div className={`text-center text-sm ${subTextColor} mb-6`}>
          Potential profit: <span className={profitColor}>+${(toWin - size).toFixed(2)}</span> ({((toWin - size) / size * 100).toFixed(1)}%)
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white/10 backdrop-blur border border-white/20 hover:bg-white/20 transition-colors">
            <Copy size={18} />
            <span className="font-semibold">Copy</span>
          </button>
          <button className="flex items-center justify-center gap-2 py-3 rounded-xl bg-white text-gray-900 hover:bg-white/90 transition-colors">
            <Share2 size={18} />
            <span className="font-semibold">Share</span>
          </button>
        </div>

        {/* Market link */}
        {marketSlug && (
          <div className="mt-4 text-center">
            <a
              href={`https://polymarket.com/event/${marketSlug}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-xs ${subTextColor} hover:text-teal transition-colors`}
            >
              View on Polymarket →
            </a>
          </div>
        )}

        {/* Watermark */}
        <div className="mt-4 pt-4 border-t border-white/10 text-center">
          <div className={`text-xs ${subTextColor}`}>
            Shared via <span className="font-semibold text-teal">SMTM</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Compact version for feeds/lists
export function TradeCardCompact({
  question,
  outcome,
  odds,
  size,
  toWin,
  username,
}: Omit<TradeCardProps, 'variant' | 'side' | 'avgPrice'>) {
  const isYes = outcome === 'YES'
  const outcomeColor = isYes ? 'text-emerald-400' : 'text-red-400'

  return (
    <div className="rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 p-4 hover:border-white/20 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {username && (
            <div className="text-xs text-white/60 mb-1">@{username}</div>
          )}
          <h4 className="text-sm font-semibold text-white mb-2 line-clamp-2">{question}</h4>
          <div className="flex items-center gap-3 text-xs">
            <span className={`font-bold ${outcomeColor}`}>{outcome} {odds}%</span>
            <span className="text-white/60">Size: ${size}</span>
            <span className="text-green-400">Win: ${toWin}</span>
          </div>
        </div>

        <div className={`px-2 py-1 rounded text-xs font-bold ${isYes ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
          {outcome}
        </div>
      </div>
    </div>
  )
}
