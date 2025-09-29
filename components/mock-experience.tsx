"use client"

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Share2, Shield, Trophy } from 'lucide-react'

type BetSide = 'LONG' | 'SHORT'

export function MockExperience() {
  const [index] = useState(0)
  const [bet, setBet] = useState<BetSide | null>(null)
  const [shared, setShared] = useState(false)
  const [hoverSide, setHoverSide] = useState<BetSide | null>(null)
  const [confidence, setConfidence] = useState<number>(60)
  const [animateBars, setAnimateBars] = useState(false)

  const claim = {
    asset: 'DOGE',
    text: '"$DOGE will double by next month"',
    longPct: 27,
    shortPct: 73,
    influencer: '@CryptoChad',
    influencerMeta: 'VERIFIED • Portfolio Linked',
    record: 'Last 7 bets: 5W / 2L',
  }

  const handleBet = (side: BetSide) => {
    setBet(side)
  }

  const stake = 50 // mock dollars
  const baseReward = 25
  const previewReward = useMemo(() => {
    // Simple proportional preview tied to confidence (0–100%)
    return Math.max(1, Math.round((confidence / 100) * baseReward * 2))
  }, [confidence])

  useEffect(() => {
    const t = setTimeout(() => setAnimateBars(true), 50)
    return () => clearTimeout(t)
  }, [])

  return (
    <div>

      {/* Demo grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Prediction card */}
        <article className="lg:col-span-7 rounded-2xl border border-white/10 bg-black/40 p-6 shadow-lg hover:shadow-[0_0_24px_rgba(0,229,255,0.15)] transition-shadow">

          {/* Claim Card */}
          <div className="rounded-xl border border-white/10 bg-[#0F0F0F]/80 p-5 md:p-6">
            {/* Influencer header + Tip button (social proximity) */}
            <div className="flex items-center gap-3 mb-3">
              <div className="h-9 w-9 rounded-full grid place-items-center text-sm font-semibold border border-white/10" style={avatarStyle('CryptoChad')}>C</div>
              <div className="min-w-0">
                <div className="font-semibold leading-tight">{claim.influencer}</div>
                <div className="text-xs text-muted truncate">{claim.influencerMeta}</div>
              </div>
              <div className="ml-auto">
                <Button variant="outline" size="sm">
                  💸 Tip Creator ($1–5)
                </Button>
              </div>
            </div>
            <div className="text-muted text-xs mb-1">Influencer Claim</div>
            <div className="text-2xl md:text-3xl font-bold leading-snug mb-4">{claim.text}</div>

            {/* Odds Bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-muted mb-1">
                <span>Long {claim.longPct}%</span>
                <span>Short {claim.shortPct}%</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-teal transition-[width] duration-200 ease-out"
                  style={{ width: animateBars ? `${claim.longPct}%` : '0%' }}
                />
                <div
                  className="h-full bg-red-500/80 -mt-2 transition-[width] duration-200 ease-out"
                  style={{ width: animateBars ? `${claim.shortPct}%` : '0%' }}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="mt-5 flex flex-wrap gap-3">
              <Button
                className="bg-teal text-black hover:opacity-90"
                onMouseEnter={() => setHoverSide('LONG')}
                onMouseLeave={() => setHoverSide(null)}
                onClick={() => handleBet('LONG')}
              >
                🔵 Go Long
              </Button>
              <Button
                className="bg-red-500 text-white hover:bg-red-500/90"
                onMouseEnter={() => setHoverSide('SHORT')}
                onMouseLeave={() => setHoverSide(null)}
                onClick={() => handleBet('SHORT')}
              >
                🔴 Go Short
              </Button>
            </div>

            {/* Confidence slider appears after choosing a side */}
            {bet && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-muted mb-2">
                  <span>Confidence</span>
                  <span className="text-foreground font-medium">{confidence}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={confidence}
                  onChange={(e) => setConfidence(Number(e.target.value))}
                  className="w-full accent-teal"
                  aria-label="Confidence slider"
                />
                <div className="mt-1 text-xs text-muted">Stake conviction for this call (0–100%).</div>
              </div>
            )}

            {/* Proof Badge */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                <Shield className="h-4 w-4 text-teal" />
                <span className="text-sm text-muted">{claim.influencerMeta}</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                <Trophy className="h-4 w-4 text-lime" />
                <span className="text-sm text-muted">{claim.record}</span>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Button variant="cta" size="lg" className="px-5 py-3 w-full sm:w-auto" onClick={() => setShared(true)}>
                <Share2 className="h-4 w-4 mr-2" /> Share → Auto Meme Card
              </Button>
            </div>
          </div>

          {/* Brag/Roast Card Preview */}
          {shared && (
            <div className="mt-4 rounded-xl border border-white/10 p-4 bg-gradient-to-br from-white/[0.04] to-white/[0.02]">
              <div className="text-sm text-muted mb-1">Brag/Roast Card</div>
              <div className="font-semibold">@CryptoChad called it right!</div>
              <div className="text-muted">"DOGE didn’t double" ✅</div>
              <div className="mt-2 text-teal">+15 Credibility | +$5 Tips</div>
            </div>
          )}
        </article>

        {/* Right column */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Preview card */}
          <aside className="rounded-2xl border border-white/10 bg-black/40 p-6 hover:shadow-[0_0_24px_rgba(0,229,255,0.15)] transition-shadow">
            <div className="text-sm text-muted mb-4">Prediction Preview</div>
            <div>
              {bet ? (
                <>
                  <div className="text-lg font-semibold">Your bet: {bet} ${claim.asset}</div>
                  <div className="text-muted">Stake: Mock ${stake}</div>
                </>
              ) : (
                <div className="text-muted">Hover or choose a side to preview.</div>
              )}
              <div
                className={
                  `mt-2 rounded-md px-3 py-2 inline-flex items-center gap-2 transition transition-transform hover:-translate-y-0.5 ` +
                  `${hoverSide ? 'bg-white/[0.06] shadow-glow text-lime-300' : 'bg-white/[0.03] text-teal'}`
                }
              >
                <span className="font-medium">Potential Reward:</span>
                <span>+${previewReward}</span>
              </div>
              <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 gap-3 text-sm text-muted">
                <div>Leaderboard Position: #32</div>
                <div>Credibility Score: 68</div>
              </div>
            </div>
          </aside>

          {/* User snapshot */}
          <aside className="rounded-2xl border border-white/10 bg-black/40 p-6 hover:shadow-[0_0_24px_rgba(0,229,255,0.15)] transition-shadow">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-white/10 grid place-items-center text-xl">C</div>
              <div>
                <div className="font-semibold">@CryptoChad</div>
                <div className="text-sm text-muted">Credibility Score: 84</div>
              </div>
              <div className="ml-auto inline-flex items-center gap-1 text-sm text-teal">
                <CheckCircle2 className="h-4 w-4" /> Verified
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <span className="rounded-md border border-white/10 px-2 py-1 text-muted">Portfolio: Linked (Coinbase API)</span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="rounded-lg border border-white/10 p-3 bg-white/[0.02] text-center">
                <div className="text-xs text-muted">Total Predictions</div>
                <div className="text-xl font-bold">52</div>
              </div>
              <div className="rounded-lg border border-white/10 p-3 bg-white/[0.02] text-center">
                <div className="text-xs text-muted">Accuracy</div>
                <div className="text-xl font-bold">72%</div>
              </div>
              <div className="rounded-lg border border-white/10 p-3 bg-white/[0.02] text-center">
                <div className="text-xs text-muted">Tips Earned</div>
                <div className="text-xl font-bold">$87</div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Removed Retention mechanics strip per request */}
    </div>
  )
}

function avatarStyle(seed: string): React.CSSProperties {
    let h = 0
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
    const h2 = (h + 40) % 360
    return {
      background: `linear-gradient(135deg, hsl(${h} 70% 20%), hsl(${h2} 70% 15%))`,
      color: 'white',
    }
  }
