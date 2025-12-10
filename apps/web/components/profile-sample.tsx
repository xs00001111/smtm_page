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
  const [activeTab, setActiveTab] = useState<'predictions' | 'feed' | 'leaderboard' | 'badges' | 'about'>(
    'predictions'
  )

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
    setReactions((prev) => {
      const current = prev[id] ?? { fire: 0, skull: 0, rocket: 0 }
      const next = { ...current, [kind]: current[kind] + 1 }
      return { ...prev, [id]: next }
    })
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
    <div id="sample-profile" className="mx-auto max-w-4xl px-6">

      <div className="rounded-xl border border-white/20 p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-14 h-14 md:w-16 md:h-16 rounded-lg grid place-items-center text-xl md:text-2xl font-bold border border-white/10"
              style={avatarStyle(profile.handle)}
            >
              {profile.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-xl md:text-2xl font-extrabold leading-tight">
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
            <button onClick={onFollow} className="h-10 sm:h-9 px-4 sm:px-3 rounded-md bg-teal text-black text-sm font-semibold hover:opacity-90 transition w-full md:w-auto">
              {isFollowing ? 'Following' : 'Follow'}
            </button>
            <GhostButton className="h-10 sm:h-9 px-4 sm:px-3 text-sm">⚔️ Challenge</GhostButton>
            <GhostButton className="h-10 sm:h-9 px-4 sm:px-3 text-sm" onClick={onShare} icon={<Share2 className="h-4 w-4" />}>{copied ? 'Copied!' : 'Share'}</GhostButton>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <Stat label="Predictions" value={`${profile.stats.predictions}`} />
          <AccuracyCard value={`${profile.stats.accuracy}%`} series={accuracySeries} />
          <Stat label="Tips Earned" value={`$${profile.stats.tips}`} />
        </div>

        <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center gap-2 text-xs md:text-sm">
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-white/80">
            <Shield className="h-3 w-3 text-teal" />
            Reputation-first
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-white/80">
            <Link2 className="h-3 w-3 text-teal" />
            Portfolio Linked
          </span>
          {/* Badges */}
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-white/80">🏅 Top 10%</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-white/80">🎲 High Roller</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-white/80">💸 Most Tipped</span>
        </div>


      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Strip label="Followers" value={followerCount.toLocaleString()} />
        <Strip label="Following" value={profile.stats.following.toLocaleString()} />
        <Strip label="Open Positions" value={predictions.filter(p=>p.status==='Open').length.toString()} />
        <Strip label="Resolved" value={predictions.filter(p=>p.status==='Resolved').length.toString()} />
      </div>

      <nav className="mt-6 flex items-center gap-3 text-sm" role="tablist" aria-label="Profile sections">
        <button
          role="tab"
          aria-selected={activeTab === 'predictions'}
          onClick={() => setActiveTab('predictions')}
          className={`pb-1 -mb-px border-b-2 transition ${activeTab === 'predictions' ? 'text-foreground border-teal' : 'text-muted border-transparent hover:text-foreground'}`}
        >
          Predictions
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'feed'}
          onClick={() => setActiveTab('feed')}
          className={`pb-1 -mb-px border-b-2 transition ${activeTab === 'feed' ? 'text-foreground border-teal' : 'text-muted border-transparent hover:text-foreground'}`}
        >
          Feed
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'leaderboard'}
          onClick={() => setActiveTab('leaderboard')}
          className={`pb-1 -mb-px border-b-2 transition ${activeTab === 'leaderboard' ? 'text-foreground border-teal' : 'text-muted border-transparent hover:text-foreground'}`}
        >
          Leaderboard
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'badges'}
          onClick={() => setActiveTab('badges')}
          className={`pb-1 -mb-px border-b-2 transition ${activeTab === 'badges' ? 'text-foreground border-teal' : 'text-muted border-transparent hover:text-foreground'}`}
        >
          Badges
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'about'}
          onClick={() => setActiveTab('about')}
          className={`pb-1 -mb-px border-b-2 transition ${activeTab === 'about' ? 'text-foreground border-teal' : 'text-muted border-transparent hover:text-foreground'}`}
        >
          About
        </button>
      </nav>

      {/* Weekly Challenge */}
      <div className="mt-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div className="flex items-start gap-2.5">
          <div className="h-7 w-7 rounded-full bg-[linear-gradient(90deg,#00E5FF_0%,#B6FF00_100%)] grid place-items-center text-black font-bold text-sm">W</div>
          <div className="flex-1">
            <div className="font-semibold text-sm">Weekly Challenge</div>
            <div className="text-xs text-muted">Make 3 predictions to unlock "On a Streak" badge.</div>
            <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full bg-teal" style={{ width: '33%' }} />
            </div>
            <div className="mt-1 text-xs text-muted">1/3 completed</div>
          </div>
          <button className="ml-auto rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs hover:bg-white/[0.06]">Start</button>
        </div>
      </div>

      {activeTab === 'predictions' && (
        <div id="predictions" className="mt-3 space-y-2">
          {predictions.map((p) => (
            <div key={p.id} className={`rounded-lg border border-white/10 bg-white/[0.02] p-3`}>
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-md bg-white/10 grid place-items-center shrink-0">
                  {assetTypeIcon(p.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm">{p.statement}</h3>
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
                    <button onClick={() => react(p.id, 'fire')} className="text-sm rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 sm:px-2 sm:py-1 hover:bg-white/[0.06] min-h-[40px] sm:min-h-0">🔥 {(reactions[p.id]?.fire)||0}</button>
                    <button onClick={() => react(p.id, 'rocket')} className="text-sm rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 sm:px-2 sm:py-1 hover:bg-white/[0.06] min-h-[40px] sm:min-h-0">🚀 {(reactions[p.id]?.rocket)||0}</button>
                    <button onClick={() => react(p.id, 'skull')} className="text-sm rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 sm:px-2 sm:py-1 hover:bg-white/[0.06] min-h-[40px] sm:min-h-0">💀 {(reactions[p.id]?.skull)||0}</button>
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
      )}

      {/* Feed */}
      {activeTab === 'feed' && (
        <div id="feed" className="mt-6 space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/80">
            You followed <span className="text-foreground font-medium">@AlphaWolf</span>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/80">
            <span className="text-foreground font-medium">@CryptoChad</span> posted a new prediction: <em>“NVDA beats by &gt;10%”</em>
          </div>
        </div>
      )}

      {/* Leaderboard */}
      {activeTab === 'leaderboard' && (
      <div id="leaderboard" className="mt-8">
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
      )}

      {/* Badges */}
      {activeTab === 'badges' && (
        <div id="badges" className="mt-6 flex flex-wrap gap-3 text-sm">
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-white/80">🏅 Top 10% Accuracy</span>
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-white/80">🎲 High Roller</span>
          <span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-white/80">💸 Most Tipped</span>
        </div>
      )}

      {/* About */}
      {activeTab === 'about' && (
        <div id="about" className="mt-6 space-y-3 text-sm text-white/80">
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">Joined: Jan 2024 • Location: Internet</div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 inline-flex items-center gap-2">
            <Shield className="h-4 w-4 text-teal" /> Trust Layer: Reputation-first
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 inline-flex items-center gap-2">
            <Link2 className="h-4 w-4 text-teal" /> Portfolio: {profile.portfolioLinked ? 'Linked (Coinbase API)' : 'Not Linked'}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border border-white/10 p-3 text-center transition-shadow ${highlight ? 'bg-white/5 shadow-glow' : 'bg-white/5 hover:bg-white/[0.08]'} hover:shadow-glow-soft`}>
      <div className="text-xs text-white/60">{label}</div>
      <div className="text-xl md:text-2xl font-extrabold text-white/90 mt-1">{value}</div>
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
    <div className="rounded-lg border border-white/10 p-3 text-center bg-white/5 transition-shadow hover:bg-white/[0.08] hover:shadow-glow-soft">
      <div className="text-xs text-white/60">Accuracy</div>
      <div className="text-xl md:text-2xl font-extrabold text-white/90 mt-1">{value}</div>
      <svg width="80" height="24" viewBox="0 0 80 24" className="mx-auto mt-2">
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

function assetTypeIcon(_type: 'crypto' | 'stock' | 'macro') {
  const common = 'h-4 w-4 text-teal'
  return <LineChart className={common} />
}

function Strip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-base md:text-lg font-semibold">{value}</div>
    </div>
  )
}

function GhostButton({ icon, children, onClick, className }: { icon?: React.ReactNode; children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.01] px-3 py-1.5 text-sm hover:bg-white/[0.06] hover:shadow-glow transition ${className ?? ''}`}>
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

 
