import { TradingGrid } from '@/components/trading-grid'
import { Button } from '@/components/ui/button'
import { FeatureCard } from '@/components/feature-card'
import { Footer } from '@/components/footer'
import { MockExperience } from '@/components/mock-experience'
import { ProfileSample } from '@/components/profile-sample'
import { BrainCircuit, TrendingUp, Share2, Send, Bell, Search, Zap, Twitter, MessageSquare } from 'lucide-react'
import { MarketTickerBar } from '@/components/market-ticker-bar'
import { PolymarketEventLines } from '@/components/polymarket-event-lines'

export default function HomePage() {
  return (
    <>
      {/* Global radial glow across the whole page (uniform, no seams) */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(0,229,255,0.12),transparent_60%)]" />

      <main className="relative min-h-screen mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 overflow-x-hidden">
        {/* Hero */}
        <section id="hero" className="relative min-h-[70vh] md:min-h-[80vh] flex items-center justify-center overflow-hidden">
          <TradingGrid />
          {/* Decorative event lines — hide on small screens to reduce clutter */}
          <div className="hidden sm:block">
            <PolymarketEventLines />
          </div>
          {/* Removed hero-only glow to avoid color seam; global fixed glow covers page */}
          {/* Ticker strip anchored to top, sharing hero background */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 min-w-[100%] w-full">
            <MarketTickerBar />
          </div>
          <div className="relative z-10 w-full max-w-3xl mx-auto flex flex-col items-center text-center pt-16 sm:pt-20 md:pt-24">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#00E5FF]/30 bg-[#00E5FF]/10 px-4 py-2 mb-6">
              <span className="h-2 w-2 rounded-full bg-[#00E5FF] animate-pulse" />
              <span className="text-xs sm:text-sm tracking-wide text-[#00E5FF] font-medium">NOW LIVE — Telegram Bot Available</span>
            </div>
            <div className="text-xs sm:text-sm tracking-[0.2em] text-white/70 uppercase mb-3 sm:mb-4">
              Prediction Market Intelligence
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight">
              Follow smart money. Trade first.
            </h1>
            <p className="mt-6 sm:mt-7 text-base sm:text-lg text-white/80 max-w-[50ch] leading-relaxed">
              Instant alerts on big trades and fast‑moving markets from Polymarket.
            </p>
            <div className="mt-10 sm:mt-12 flex flex-col sm:flex-row gap-4 sm:gap-6 items-center">
              <a
                href="https://t.me/TradeWithSMTM_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto"
              >
                <button className="w-full sm:w-auto bg-gradient-to-r from-[#00E5FF] to-[#B6FF00] text-black font-semibold px-8 py-4 sm:px-6 sm:py-3.5 rounded-xl shadow-[0_0_40px_rgba(182,255,0,0.3)] hover:shadow-[0_0_50px_rgba(182,255,0,0.4)] transition-all flex items-center justify-center gap-2 text-base sm:text-sm">
                  <Send size={20} className="rotate-45" />
                  Start Free on Telegram
                </button>
              </a>
              <a href="#features" className="w-full sm:w-auto">
                <button className="w-full sm:w-auto border border-[#00E5FF] text-[#00E5FF] px-8 py-4 sm:px-6 sm:py-3.5 rounded-xl hover:bg-[#00E5FF]/10 transition-colors text-base sm:text-sm">
                  See What's Available
                </button>
              </a>
            </div>
            {/* Social proof + feature highlights */}
            <div className="mt-8 sm:mt-10 flex flex-wrap items-center justify-center gap-4 sm:gap-5 text-sm text-white/80">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#00E5FF]/30 bg-[#00E5FF]/10 px-4 py-1.5">
                <Bell size={14} className="text-[#00E5FF]" />
                Instant trade alerts
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#B6FF00]/30 bg-[#B6FF00]/10 px-4 py-1.5">
                <Search size={14} className="text-[#B6FF00]" />
                Follow top traders
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5">
                <span className="h-2 w-2 rounded-full bg-teal animate-pulse" />
                Connected to Polymarket
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-1.5">
                💰 Free forever
              </span>
            </div>
          </div>
        </section>

  {/* Demo under hero with overlap and spacing */}
  <section id="demo" className="-mt-8 sm:-mt-12 md:-mt-16 relative z-10 pt-12 sm:pt-14 md:pt-20 pb-16 sm:pb-20" style={{ contentVisibility: 'auto' }}>
    <MockExperience />
  </section>

  {/* Sample profile to show full experience */}
  <section className="relative py-16 md:py-24 bg-[#111111]" style={{ contentVisibility: 'auto' }}>
    <ProfileSample />
  </section>

      {/* Divider before features/problem */}
      <hr className="my-16 h-px border-0 bg-gradient-to-r from-transparent via-[#00E5FF] to-[#B6FF00] opacity-50" />

      {/* Available Now: Telegram Bot Features */}
      <section id="features" className="relative py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-8 sm:mb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#00E5FF]/30 bg-[#00E5FF]/10 px-4 py-1.5 mb-4">
              <Zap size={14} className="text-[#00E5FF]" />
              <span className="text-xs tracking-wide text-[#00E5FF] font-medium">AVAILABLE NOW</span>
            </div>
            <h2 className="font-display text-3xl md:text-5xl font-extrabold">Telegram Bot Features</h2>
            <p className="mt-3 sm:mt-4 text-white/80 max-w-xl mx-auto text-sm sm:text-base">
              Instant alerts and research tools. Free for everyone.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-12">
            <FeatureCard
              title="Real-Time Alerts"
              description="Follow markets and whales. Get notified on price changes and large trades instantly."
              icon={<Bell size={28} className="text-teal" />}
            />
            <FeatureCard
              title="Whale Tracking"
              description="Discover top traders by PnL and volume. Follow their moves across all markets or specific ones."
              icon={<Search size={28} className="text-teal" />}
            />
            <FeatureCard
              title="Market Research"
              description="Browse hot markets, search predictions, check live prices and net positions."
              icon={<TrendingUp size={28} className="text-teal" />}
            />
            <FeatureCard
              title="Trade Execution"
              description="Execute directly from alerts. One‑tap when opportunities arise."
              icon={<Zap size={28} className="text-teal" />}
            />
          </div>
          {/* Simplified: 4 key features; removed separate "What's Next" grid */}
        </div>
      </section>

      {/* Divider before problem section */}
      <hr className="my-10 h-px border-0 bg-gradient-to-r from-transparent via-[#00E5FF] to-[#B6FF00] opacity-50" />

      {/* Problem → Agitation → Transformation */}
      <section id="problem" className="relative py-12 md:py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-3xl md:text-5xl font-extrabold mb-8">Stop Chasing Alpha. Start Following It.</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Before card */}
            <article className="rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-6">
              <h3 className="text-xl font-semibold mb-3">The Old Way</h3>
              <ul className="space-y-2 text-white/85">
                <li>❌ <strong>Miss opportunities</strong> — markets move while you sleep.</li>
                <li>❌ <strong>Hard to find edge</strong> — who's actually profitable?</li>
                <li>❌ <strong>Scattered info</strong> — checking multiple sites manually.</li>
                <li>❌ <strong>Late to trends</strong> — see whale moves after they happen.</li>
              </ul>
            </article>

            {/* After card */}
            <article className="rounded-2xl border border-teal/20 bg-teal/[0.06] p-6">
              <h3 className="text-xl font-semibold mb-3">The SMTM Way</h3>
              <ul className="space-y-2 text-white/85">
                <li>✅ <strong>Never miss a move</strong>: instant alerts 24/7.</li>
                <li>✅ <strong>Follow the best</strong>: track top traders by verified PnL.</li>
                <li>✅ <strong>All in one place</strong>: research, alerts, and analysis.</li>
                <li>✅ <strong>Real-time edge</strong>: see whale trades as they happen.</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      {/* Removed stats section per request */}

      <section className="relative py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-3xl md:text-5xl font-extrabold">Start with Alerts. Scale with Execution.</h2>
          <p className="mt-4 text-white/80 max-w-3xl">
            Our Telegram bot gives you the intelligence layer today. Soon, you'll execute trades directly from alerts, turning information into action instantly. From research to execution, all in one place.
          </p>
          <div className="mt-8 flex flex-wrap gap-4 items-center">
            <a
              href="https://t.me/TradeWithSMTM_bot"
              target="_blank"
              rel="noopener noreferrer"
            >
              <button className="bg-[#229ED9] hover:bg-[#1a8fc7] transition-colors text-white font-semibold px-6 py-3 rounded-xl flex items-center gap-2 shadow-lg">
                <Send size={18} className="rotate-45" />
                Try the Bot Now
              </button>
            </a>
            <span className="text-white/60 text-sm">Free • No signup required • Available 24/7</span>
          </div>
        </div>
      </section>

      {/* Waitlist removed (bot is live) */}

      <Footer />

      {/* Back to top button (mobile) */}
      <BackToTopMobile />
    </main>
    </>
  )
}

// Back-to-top helper component (mobile only)
import React from 'react'
function BackToTopMobile() {
  const [show, setShow] = React.useState(false)
  const lastRef = React.useRef(0)
  React.useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0
      const last = lastRef.current
      lastRef.current = y
      if (y > 400 && y < document.body.scrollHeight - window.innerHeight - 20) setShow(true)
      else if (y < 200) setShow(false)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  const vibe = (ms = 10) => { try { (navigator as any)?.vibrate?.(ms) } catch {} }
  if (!show) return null
  return (
    <button
      onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); vibe(8) }}
      className="sm:hidden fixed bottom-20 right-3 z-40 h-10 w-10 rounded-full border border-white/15 bg-white/[0.06] backdrop-blur text-white/80 shadow-[0_0_18px_rgba(0,0,0,0.4)]"
      aria-label="Back to top"
    >
      ↑
    </button>
  )
}
