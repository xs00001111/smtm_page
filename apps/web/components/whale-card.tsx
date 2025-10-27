"use client"

import { useCallback, useState } from 'react'
import { Share2, TrendingUp, TrendingDown, Activity } from 'lucide-react'

interface WhaleCardProps {
  address: string
  marketId?: string
}

export function WhaleCard({ address, marketId }: WhaleCardProps) {
  // Hardcoded whale data for now - will be replaced with API call based on address
  const whale = {
    name: 'GigaWhale',
    address: address,
    rank: 3,
    pnl: 127450,
    volume: 2400000,
    winRate: 74,
    activePositions: 12,
    recentActivity: {
      trades: 32,
      volume: 450000,
      wins: 8,
      losses: 3,
    },
    topMarkets: [
      {
        name: 'Trump 2024 Election',
        profit: 45000,
        volume: 120000,
        trend: 'up' as const,
      },
      {
        name: 'Bitcoin hits $100K',
        profit: 28000,
        volume: 85000,
        trend: 'up' as const,
      },
      {
        name: 'Fed Rate Decision',
        profit: -12000,
        volume: 65000,
        trend: 'down' as const,
      },
    ],
  }

  const [copied, setCopied] = useState(false)

  const onShare = useCallback(async () => {
    try {
      const shareUrl = `${window.location.origin}/mini/whale/${address}${marketId ? `?market=${marketId}` : ''}`
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback
    }
  }, [address, marketId])

  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border-2 border-white/20 p-6 md:p-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="text-4xl">🐋</div>
              <div>
                <h1 className="text-2xl md:text-3xl font-extrabold">{whale.name || 'Whale Trader'}</h1>
                <div className="text-muted text-sm">Rank #{whale.rank}</div>
              </div>
            </div>
            <div className="text-sm text-white/80 font-mono bg-white/5 border border-white/10 rounded px-3 py-1 inline-block">
              {shortAddress}
            </div>
          </div>

          <button
            onClick={onShare}
            className="h-10 px-4 rounded-md border border-white/10 bg-white/[0.03] text-sm font-semibold hover:bg-white/[0.06] transition inline-flex items-center gap-2"
          >
            <Share2 className="h-4 w-4" />
            {copied ? 'Copied!' : 'Share'}
          </button>
        </div>

        {/* Performance Section */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-white/60 mb-3 flex items-center gap-2">
            💰 PERFORMANCE
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <MetricBox
              label="P&L"
              value={formatCurrency(whale.pnl)}
              trend={whale.pnl > 0 ? 'up' : 'down'}
            />
            <MetricBox
              label="Volume"
              value={formatCurrency(whale.volume)}
            />
            <MetricBox
              label="Win Rate"
              value={`${whale.winRate}%`}
              trend="up"
            />
            <MetricBox
              label="Active Positions"
              value={whale.activePositions.toString()}
            />
          </div>
        </div>

        {/* Recent Activity */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-white/60 mb-3 flex items-center gap-2">
            📊 RECENT ACTIVITY (7D)
          </h2>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xs text-muted mb-1">Trades</div>
                <div className="text-xl font-bold">{whale.recentActivity.trades}</div>
              </div>
              <div>
                <div className="text-xs text-muted mb-1">Volume</div>
                <div className="text-xl font-bold">{formatCurrency(whale.recentActivity.volume)}</div>
              </div>
              <div>
                <div className="text-xs text-muted mb-1">W/L</div>
                <div className="text-xl font-bold">
                  {whale.recentActivity.wins}W / {whale.recentActivity.losses}L
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Markets */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-white/60 mb-3 flex items-center gap-2">
            🏆 TOP MARKETS
          </h2>
          <div className="space-y-2">
            {whale.topMarkets.map((market, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm mb-1">{market.name}</div>
                    <div className="text-xs text-muted">
                      {formatCurrency(market.volume)} volume
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold text-sm flex items-center gap-1 justify-end ${market.trend === 'up' ? 'text-teal' : 'text-red-400'}`}>
                      {market.trend === 'up' ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                      {market.profit > 0 ? '+' : ''}{formatCurrency(market.profit)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer CTA */}
        <div className="mt-6 pt-4 border-t border-white/10">
          <div className="text-center">
            <div className="text-sm text-muted mb-2">Follow this whale's trades</div>
            <code className="text-xs bg-white/5 border border-white/10 rounded px-3 py-2 inline-block">
              /follow {shortAddress}
            </code>
            <div className="mt-3 text-xs text-muted">
              Track whales with{' '}
              <a
                href="https://t.me/smtmbot"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal hover:underline"
              >
                @SMTMBot
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricBox({
  label,
  value,
  trend,
}: {
  label: string
  value: string
  trend?: 'up' | 'down'
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <div className="text-xs text-muted mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <div className="text-xl font-bold">{value}</div>
        {trend && (
          <div className={trend === 'up' ? 'text-teal' : 'text-red-400'}>
            {trend === 'up' ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          </div>
        )}
      </div>
    </div>
  )
}

function formatCurrency(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''

  if (abs >= 1_000_000) {
    return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  }
  if (abs >= 1_000) {
    return `${sign}$${(abs / 1_000).toFixed(1)}K`
  }
  return `${sign}$${abs.toFixed(0)}`
}
