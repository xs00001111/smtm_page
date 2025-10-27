"use client"

import { useCallback, useMemo, useState } from 'react'
import { CheckCircle2, Link2, Shield, Share2 } from 'lucide-react'

interface ProfileCardProps {
  userId?: string | null
}

export function ProfileCard({ userId }: ProfileCardProps) {
  // Hardcoded profile data for now - will be replaced with API call based on userId
  const profile = {
    name: 'Crypto Chad',
    handle: 'cryptochad',
    credibility: 84,
    verified: true,
    portfolioLinked: true,
    stats: {
      predictions: 52,
      accuracy: 72,
      tips: 87,
      followers: 1248,
      following: 93,
      openPositions: 2,
      resolved: 1,
    },
    badges: ['🏅 Top 10% Accuracy', '🎲 High Roller', '💸 Most Tipped'],
  }

  const [copied, setCopied] = useState(false)
  const [followerCount] = useState(profile.stats.followers)

  const onShare = useCallback(async () => {
    try {
      const shareUrl = `${window.location.origin}/mini/profile${userId ? `?user=${userId}` : ''}`
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback for browsers that don't support clipboard API
    }
  }, [userId])

  const accuracySeries = useMemo(() => [62, 65, 61, 68, 70, 72, 71, 74, 73, 75], [])

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border-2 border-white/20 p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex items-center gap-4">
            <div
              className="w-[72px] h-[72px] rounded-xl grid place-items-center text-2xl md:text-3xl font-bold border border-white/10"
              style={avatarStyle(profile.handle)}
            >
              {profile.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-2xl md:text-3xl font-extrabold leading-tight">
                  {profile.name}
                </h2>
                {profile.verified && (
                  <span className="inline-flex items-center gap-1 text-teal text-sm">
                    <CheckCircle2 className="h-4 w-4" /> Verified
                  </span>
                )}
                <span className="inline-flex items-center rounded-full bg-white/5 text-white/80 text-xs px-2 py-0.5 border border-white/10">
                  Credibility {profile.credibility}
                </span>
              </div>
              <div className="text-muted">@{profile.handle}</div>
            </div>
          </div>

          <div className="md:ml-auto inline-flex items-center gap-2 w-full md:w-auto">
            <button
              onClick={onShare}
              className="h-10 px-4 rounded-md border border-white/10 bg-white/[0.03] text-sm font-semibold hover:bg-white/[0.06] transition inline-flex items-center gap-2"
            >
              <Share2 className="h-4 w-4" />
              {copied ? 'Copied!' : 'Share'}
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          <Stat label="Predictions" value={`${profile.stats.predictions}`} />
          <AccuracyCard value={`${profile.stats.accuracy}%`} series={accuracySeries} />
          <Stat label="Tips Earned" value={`$${profile.stats.tips}`} />
        </div>

        <div className="mt-6 pt-4 border-t border-white/10 flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-white/80">
            <Shield className="h-4 w-4 text-teal" />
            Trust Layer: Reputation-first
          </span>
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-white/80">
            <Link2 className="h-4 w-4 text-teal" />
            Portfolio: {profile.portfolioLinked ? 'Linked (Coinbase API)' : 'Not Linked'}
          </span>
          {/* Badges */}
          {profile.badges.map((badge, i) => (
            <span key={i} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-white/80">
              {badge}
            </span>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Strip label="Followers" value={followerCount.toLocaleString()} />
          <Strip label="Following" value={profile.stats.following.toLocaleString()} />
          <Strip label="Open Positions" value={profile.stats.openPositions.toString()} />
          <Strip label="Resolved" value={profile.stats.resolved.toString()} />
        </div>

        <div className="mt-6 pt-4 border-t border-white/10 text-center text-sm text-muted">
          Track predictions and whales with{' '}
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
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 p-4 text-center bg-white/5 hover:bg-white/[0.08] transition-shadow hover:shadow-glow-soft grid grid-rows-[auto_auto_24px] items-center justify-items-center min-h-[140px]">
      <div className="text-xs text-white/60">{label}</div>
      <div className="text-2xl font-extrabold text-white/90">{value}</div>
      <div className="h-6" aria-hidden />
    </div>
  )
}

function AccuracyCard({ value, series }: { value: string; series: number[] }) {
  const path = useMemo(() => sparklinePath(series, 80, 24), [series])
  const last = series[series.length - 1]
  const xLast = series.length > 1 ? ((series.length - 1) / (series.length - 1)) * 80 : 0
  const yLast = 24 - (last / 100) * 24

  return (
    <div className="rounded-xl border border-white/10 p-4 text-center bg-white/5 transition-shadow hover:bg-white/[0.08] hover:shadow-glow-soft grid grid-rows-[auto_auto_24px] items-center justify-items-center min-h-[140px]">
      <div className="text-xs text-white/60">Accuracy</div>
      <div className="text-2xl font-extrabold text-white/90">{value}</div>
      <svg width="80" height="24" viewBox="0 0 80 24" className="mx-auto">
        <path d={path} fill="none" stroke="#00E5FF" strokeWidth="2" />
        <circle cx={xLast} cy={yLast} r="2" fill="#B6FF00" />
      </svg>
    </div>
  )
}

function sparklinePath(data: number[], width: number, height: number) {
  if (data.length === 0) return ''
  const step = width / (data.length - 1 || 1)
  return data
    .map((v, i) => {
      const x = i * step
      const y = height - (v / 100) * height
      return `${i === 0 ? 'M' : 'L'}${x},${y}`
    })
    .join(' ')
}

function Strip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}

function avatarStyle(seed: string): React.CSSProperties {
  // Simple deterministic HSL gradient based on seed hash
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  const h2 = (h + 40) % 360
  return {
    background: `linear-gradient(135deg, hsl(${h} 70% 20%), hsl(${h2} 70% 15%))`,
    color: 'white',
  }
}
