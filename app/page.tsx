import { TradingGrid } from '@/components/trading-grid'
import { Button } from '@/components/ui/button'
import { FeatureCard } from '@/components/feature-card'
import { WaitlistForm } from '@/components/waitlist-form'
import { Footer } from '@/components/footer'
import { MockExperience } from '@/components/mock-experience'
import { ProfileSample } from '@/components/profile-sample'
import { BrainCircuit, TrendingUp, Share2 } from 'lucide-react'
import { MarketTickerBar } from '@/components/market-ticker-bar'

export default function HomePage() {
  return (
    <>
      {/* Ticker inside hero background context (full-bleed) */}
      {/* Global radial glow across the whole page */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(0,229,255,0.08),transparent_60%)]" />

      <main className="relative min-h-screen mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <section id="hero" className="relative min-h-[70vh] md:min-h-[80vh] flex items-center">
          <TradingGrid />
          {/* Full-bleed glow overlay (spans entire viewport width) */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-screen bg-[radial-gradient(ellipse_at_top,_rgba(0,229,255,0.12),transparent_60%)]" />
          {/* Ticker strip anchored to top, sharing hero background */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-screen">
            <MarketTickerBar />
          </div>
          <div className="relative z-10 text-center w-full flex flex-col items-center pt-24">
            <div className="text-xs sm:text-sm tracking-[0.2em] text-white/70 uppercase mb-3 sm:mb-4">
              Show Me The Money
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight">
              Earn when you’re right. Lose nothing to lies.
            </h1>
            <p className="mt-6 sm:mt-7 text-lg text-white/80 max-w-[46ch]">
              SMTM makes conviction profitable and hype worthless.
            </p>
            <div className="mt-10 sm:mt-12 flex gap-6">
              <a href="#waitlist" className="w-full sm:w-auto">
                <button className="w-full sm:w-auto bg-gradient-to-r from-[#00E5FF] to-[#B6FF00] text-black font-semibold px-5 py-3 rounded-xl shadow-[0_0_40px_rgba(182,255,0,0.2)]">
                  Join the Waitlist
                </button>
              </a>
              <a href="#demo" className="w-full sm:w-auto">
                <button className="w-full sm:w-auto border border-[#00E5FF] text-[#00E5FF] px-5 py-3 rounded-xl">
                  Try the Demo
                </button>
              </a>
            </div>
            {/* FOMO + engagement baits */}
            <div className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-4 sm:gap-5 text-sm text-white/80">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5">
                🔓 Founding Member Badge
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5">
                ⚡ Limited early spots
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5">
                📛 Claim your @handle
              </span>
              <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5">
                <span className="h-2 w-2 rounded-full bg-teal animate-pulse" />
                12,482 joined • 89 today
              </span>
            </div>
          </div>
        </section>

  {/* Demo under hero with overlap and spacing */}
  <section id="demo" className="-mt-12 md:-mt-16 relative z-10 pt-14 md:pt-20 pb-20">
    <MockExperience />
  </section>

  {/* Sample profile to show full experience */}
  <section className="relative py-16 md:py-24 bg-[#111111]">
    <ProfileSample />
  </section>

      {/* Divider before features/problem */}
      <hr className="my-16 h-px border-0 bg-gradient-to-r from-transparent via-[#00E5FF] to-[#B6FF00] opacity-50" />

      {/* Feature grid (no cards) */}
      <section id="learn-more" className="relative py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard
              title="AI Portfolio Companion"
              description="News + signals tied to your assets."
              icon={<BrainCircuit size={28} className="text-teal" />}
            />
            <FeatureCard
              title="Stake Predictions"
              description="Put conviction behind your opinions, see who’s right."
              icon={<TrendingUp size={28} className="text-teal" />}
            />
            <FeatureCard
              title="Viral Sharing"
              description="Turn takes into meme cards, roast bad calls."
              icon={<Share2 size={28} className="text-teal" />}
            />
          </div>
        </div>
      </section>

      {/* Divider before problem section */}
      <hr className="my-10 h-px border-0 bg-gradient-to-r from-transparent via-[#00E5FF] to-[#B6FF00] opacity-50" />

      {/* Problem → Agitation → Transformation */}
      <section id="problem" className="relative py-12 md:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-3xl md:text-5xl font-extrabold mb-8">From Clout to Credibility</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Before card */}
            <article className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-6">
              <h3 className="text-xl font-semibold mb-3">Before — The Problem</h3>
              <ul className="space-y-2 text-white/85">
                <li>❌ <strong>Hot takes</strong> win attention, not accuracy.</li>
                <li>❌ <strong>No skin in the game</strong> — zero accountability.</li>
                <li>❌ <strong>Signal is buried</strong> — hard to know who to trust.</li>
                <li>❌ <strong>No upside</strong> for being right, only clout.</li>
              </ul>
            </article>

            {/* After card */}
            <article className="rounded-2xl border border-teal/20 bg-teal/[0.06] p-6">
              <h3 className="text-xl font-semibold mb-3">After — The Transformation</h3>
              <ul className="space-y-2 text-white/85">
                <li>✅ <strong>Stake conviction</strong>: Long/Short + confidence.</li>
                <li>✅ <strong>Earn credibility</strong>: transparent records, leaderboards.</li>
                <li>✅ <strong>Get paid</strong>: tips and viral meme cards.</li>
                <li>✅ <strong>Trust at a glance</strong>: verified portfolios, badges.</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      {/* Removed stats section per request */}

      <section className="relative py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-3xl md:text-5xl font-extrabold">Financialize Everything.</h2>
          <p className="mt-4 text-muted max-w-3xl">
            From memes to markets, SMTM lets users back conviction with real stakes. Unlike social media that rewards outrage, SMTM rewards accuracy.
          </p>
        </div>
      </section>

      <section id="waitlist" className="relative py-12 md:py-16">
        <div className="mx-auto max-w-6xl px-6">
          <hr className="mx-auto mb-6 h-px w-40 sm:w-60 border-0 rounded bg-[linear-gradient(90deg,transparent,rgba(0,229,255,0.8),rgba(182,255,0,0.8),transparent)] opacity-70" />
          <h3 className="font-display text-2xl md:text-3xl font-bold">Join the Waitlist</h3>
          <p className="text-white/80 mt-2">Be first to profit from conviction. Join early, shape the market.</p>

          {/* Mini leaderboard / ticker */}
          <div className="mt-5 overflow-x-auto whitespace-nowrap">
            <div className="inline-flex items-center gap-4 text-sm text-white/85">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1">✅ NVDA beat EPS +12% <span className="text-teal">+25 cred</span></span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1">✅ BTC &gt; $70k pre-halving <span className="text-teal">+18 cred</span></span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1">❌ DOGE to $2 <span className="text-red-400">-7 cred</span></span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1">✅ ETH ETF approved <span className="text-teal">+22 cred</span></span>
            </div>
          </div>

          <div className="mt-6 max-w-lg">
            <WaitlistForm />
          </div>
        </div>
      </section>

      <Footer />
    </main>
    </>
  )
}
