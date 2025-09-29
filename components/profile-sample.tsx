"use client"

import { useCallback, useMemo, useState } from 'react'
import { CheckCircle2, Coins, Globe, LineChart, Link2, MessageSquare, Share2, Shield, TrendingUp, Trophy, UserPlus } from 'lucide-react'

export function ProfileSample() {
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
    },
  }

  const predictions = [
    {
      id: '1',
      asset: 'DOGE',
      statement: 'DOGE will double by next month',
      type: 'crypto' as 'crypto' | 'stock' | 'macro',
      side: 'SHORT',
      stake: 50,
      status: 'Resolved',
      outcome: 'WIN' as 'WIN' | 'LOSE',
      reward: 25,
    },
    {
      id: '2',
      asset: 'NVDA',
      statement: 'NVDA will beat earnings by >10%',
      type: 'stock' as 'crypto' | 'stock' | 'macro',
      side: 'LONG',
      stake: 40,
      status: 'Open',
      outcome: null as null | 'WIN' | 'LOSE',
      reward: null as null | number,
    },
    {
      id: '3',
      asset: 'BTC',
      statement: 'BTC hits $80k before year-end',
      type: 'macro' as 'crypto' | 'stock' | 'macro',
      side: 'LONG',
      stake: 100,
      status: 'Open',
      outcome: null as null | 'WIN' | 'LOSE',
      reward: null as null | number,
    },
  ]

  const [isFollowing, setIsFollowing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [followerCount, setFollowerCount] = useState(profile.stats.followers)
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [reactions, setReactions] = useState<Record<string, { fire: number; skull: number; rocket: number }>>({})

  const onFollow = useCallback(() => {
    setIsFollowing((prev) => {
      const next = !prev
      setFollowerCount((c) => (next ? c + 1 : Math.max(0, c - 1)))
      return next
    })
  }, [])

  const onShare = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href + '#sample-profile')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }, [])

  const react = useCallback((id: string, kind: 'fire' | 'skull' | 'rocket') => {
    setReactions((prev) => ({
      ...prev,
      [id]: { fire: 0, skull: 0, rocket: 0, ...(prev[id] || {}) , [kind]: ((prev[id]?.[kind] || 0) + 1) },
    }))
  }, [])

  const onCommentChange = useCallback((id: string, text: string) => {
    setCommentDrafts((prev) => ({ ...prev, [id]: text }))
  }, [])

  const onSubmitComment = useCallback((id: string) => {
    // Mock submit; clear draft
    setCommentDrafts((prev) => ({ ...prev, [id]: '' }))
  }, [])

  const accuracySeries = useMemo(() => [62, 65, 61, 68, 70, 72, 71, 74, 73, 75], [])

  return (
    <div id="sample-profile" className="mx-auto max-w-6xl px-6">
      <div className="h-1 w-full rounded bg-[linear-gradient(90deg,#00E5FF_0%,#B6FF00_100%)] mb-6" />

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-8">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex items-center gap-4">
            <div
              className="h-16 w-16 md:h-20 md:w-20 rounded-xl grid place-items-center text-2xl md:text-3xl font-bold border border-white/10"
              style={avatarStyle(profile.handle)}
            >
              {profile.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-2xl md:text-3xl font-extrabold leading-tight">
                  {profile.name}
                </h2>
                {profile.verified && (
                  <span className="inline-flex items-center gap-1 text-teal text-sm">
                    <CheckCircle2 className="h-4 w-4" /> Verified
                  </span>
                )}
              </div>
              <div className="text-muted">@{profile.handle}</div>
            </div>
          </div>

          <div className="md:ml-auto grid grid-cols-3 gap-3 w-full md:w-auto">
            <CredibilityCard value={profile.credibility} />
            <Stat label="Predictions" value={`${profile.stats.predictions}`} />
            <AccuracyCard value={`${profile.stats.accuracy}%`} series={accuracySeries} />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5">
            <Shield className="h-4 w-4 text-teal" />
            Trust Layer: Reputation-first
          </span>
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5">
            <Link2 className="h-4 w-4 text-lime" />
            Portfolio: {profile.portfolioLinked ? 'Linked (Coinbase API)' : 'Not Linked'}
          </span>
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5">
            <Trophy className="h-4 w-4 text-yellow-300" />
            Tips Earned: ${profile.stats.tips}
          </span>

          {/* Badges */}
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5">🏅 Top 10% Accuracy</span>
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5">🎲 High Roller</span>
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5">💸 Most Tipped</span>

          <div className="ml-auto inline-flex items-center gap-2">
            <GhostButton onClick={onFollow} icon={<UserPlus className="h-4 w-4" />}>{isFollowing ? 'Following' : 'Follow'}</GhostButton>
            <GhostButton>⚔️ Challenge</GhostButton>
            <GhostButton onClick={onShare} icon={<Share2 className="h-4 w-4" />}>{copied ? 'Copied!' : 'Share Prediction'}</GhostButton>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Strip label="Followers" value={followerCount.toLocaleString()} />
        <Strip label="Following" value={profile.stats.following.toLocaleString()} />
        <Strip label="Open Positions" value={predictions.filter(p=>p.status==='Open').length.toString()} />
        <Strip label="Resolved" value={predictions.filter(p=>p.status==='Resolved').length.toString()} />
      </div>

      <div className="mt-8 flex items-center gap-4 text-sm">
        <span className="text-foreground font-semibold">Predictions</span>
        <span className="text-muted">Feed</span>
        <span className="text-muted">Leaderboard</span>
        <span className="text-muted">Badges</span>
        <span className="text-muted">About</span>
      </div>

      {/* Weekly Challenge */}
      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-[linear-gradient(90deg,#00E5FF_0%,#B6FF00_100%)] grid place-items-center text-black font-bold">W</div>
          <div className="flex-1">
            <div className="font-semibold">Weekly Challenge</div>
            <div className="text-sm text-muted">Make 3 predictions this week to unlock the “On a Streak” badge.</div>
            <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-teal" style={{ width: '33%' }} />
            </div>
            <div className="mt-1 text-xs text-muted">1/3 completed</div>
          </div>
          <button className="ml-auto rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm hover:bg-white/[0.06]">Start</button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {predictions.map((p) => (
          <div key={p.id} className={`rounded-xl border border-white/10 bg-white/[0.02] p-4 ${p.status==='Resolved' ? (p.outcome==='WIN' ? 'animate-winPulse' : 'animate-losePulse') : ''}`}>
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-white/10 grid place-items-center">
                {assetTypeIcon(p.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold">{p.statement}</h3>
                  <span className="text-xs rounded-md border border-white/10 px-2 py-0.5 text-muted inline-flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-teal" /> {p.side}
                  </span>
                  <span className="text-xs rounded-md border border-white/10 px-2 py-0.5 text-muted">Stake: ${p.stake}</span>
                  <span className="text-xs rounded-md border border-white/10 px-2 py-0.5 text-muted">Status: {p.status}</span>
                  {p.status === 'Resolved' && (
                    <span className={`text-xs rounded-md px-2 py-0.5 ${p.outcome === 'WIN' ? 'bg-teal/10 text-teal' : 'bg-red-500/10 text-red-400'}`}>
                      {p.outcome}
                    </span>
                  )}
                  {p.reward && (
                    <span className="text-xs rounded-md bg-teal/10 text-teal px-2 py-0.5">+${p.reward} Reward</span>
                  )}
                </div>
                <div className="text-xs text-muted mt-1">Posted 3d ago • #{p.id}</div>

                {/* Reactions + Comments */}
                <div className="mt-3 flex items-center gap-2">
                  <button onClick={() => react(p.id, 'fire')} className="text-sm rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 hover:bg-white/[0.06]">🔥 {(reactions[p.id]?.fire)||0}</button>
                  <button onClick={() => react(p.id, 'rocket')} className="text-sm rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 hover:bg-white/[0.06]">🚀 {(reactions[p.id]?.rocket)||0}</button>
                  <button onClick={() => react(p.id, 'skull')} className="text-sm rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 hover:bg-white/[0.06]">💀 {(reactions[p.id]?.skull)||0}</button>
                  <div className="ml-auto inline-flex items-center text-muted text-sm"><MessageSquare className="h-4 w-4 mr-1" /> Comment</div>
                </div>
                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={commentDrafts[p.id] || ''}
                      onChange={(e)=>onCommentChange(p.id, e.target.value)}
                      placeholder="Add a comment..."
                      className="flex-1 rounded-md border border-white/10 bg-white/[0.02] px-3 py-1.5 text-sm placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-teal/60"
                    />
                    <button onClick={()=>onSubmitComment(p.id)} className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm hover:bg-white/[0.06]">Post</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Leaderboard */}
      <div className="mt-8">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-foreground font-semibold">Leaderboard</span>
          <span className="text-muted text-sm">This week</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-sm text-muted mb-2">Top Predictors</div>
            <ol className="space-y-2 text-sm">
              <li className="flex items-center justify-between"><span>@AlphaWolf</span><span className="text-teal">78% acc</span></li>
              <li className="flex items-center justify-between"><span>@CryptoChad</span><span className="text-teal">75% acc</span></li>
              <li className="flex items-center justify-between"><span>@MarketMaven</span><span className="text-teal">72% acc</span></li>
            </ol>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-sm text-muted mb-2">Most Tipped</div>
            <ol className="space-y-2 text-sm">
              <li className="flex items-center justify-between"><span>@TipMagnet</span><span className="text-lime">$124</span></li>
              <li className="flex items-center justify-between"><span>@CryptoChad</span><span className="text-lime">$87</span></li>
              <li className="flex items-center justify-between"><span>@DeepValue</span><span className="text-lime">$73</span></li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border border-white/10 p-4 text-center transition-shadow ${highlight ? 'bg-white/[0.04] shadow-glow' : 'bg-white/[0.02] hover:bg-white/[0.04]'} dark:hover:shadow-glow hover:shadow-glow-soft`}>
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-extrabold">{value}</div>
    </div>
  )
}

function CredibilityCard({ value }: { value: number }) {
  return (
    <div className="rounded-xl border border-white/10 p-4 text-center bg-white/[0.04] shadow-glow transition-shadow dark:hover:shadow-glow hover:shadow-glow-soft">
      <div className="text-xs text-muted">Credibility</div>
      <div className="mt-2 inline-grid place-items-center">
        <div className="w-16 h-16 rounded-full bg-[linear-gradient(90deg,#00E5FF_0%,#B6FF00_100%)] p-[2px] shadow-glow">
          <div className="w-full h-full rounded-full bg-[#0C0C0C] grid place-items-center">
            <span className="text-2xl font-extrabold">{value}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function AccuracyCard({ value, series }: { value: string; series: number[] }) {
  const path = useMemo(() => sparklinePath(series, 80, 24), [series])
  const last = series[series.length - 1]
  const xLast = series.length > 1 ? ((series.length - 1) / (series.length - 1)) * 80 : 0
  const yLast = 24 - (last / 100) * 24
  return (
    <div className="rounded-xl border border-white/10 p-4 text-center bg-white/[0.02] transition-shadow hover:bg-white/[0.04] dark:hover:shadow-glow hover:shadow-glow-soft">
      <div className="text-xs text-muted">Accuracy</div>
      <div className="text-2xl font-extrabold">{value}</div>
      <svg width="80" height="24" viewBox="0 0 80 24" className="mx-auto mt-1">
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

function assetTypeIcon(type: 'crypto' | 'stock' | 'macro') {
  const common = 'h-5 w-5'
  if (type === 'crypto') return <Coins className={`${common} text-teal`} />
  if (type === 'stock') return <LineChart className={`${common} text-lime`} />
  return <Globe className={`${common} text-yellow-300`} />
}

function Strip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}

function GhostButton({ icon, children, onClick }: { icon?: React.ReactNode; children: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.01] px-3 py-1.5 text-sm hover:bg-white/[0.06] hover:shadow-glow transition">
      {icon}
      {children}
    </button>
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

 
