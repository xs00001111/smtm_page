import { TradingGrid } from '@/components/trading-grid'
import { Button } from '@/components/ui/button'
import { FeatureCard } from '@/components/feature-card'
import { WaitlistForm } from '@/components/waitlist-form'
import { Footer } from '@/components/footer'
import { MockExperience } from '@/components/mock-experience'
import { ProfileSample } from '@/components/profile-sample'
import { BrainCircuit, TrendingUp, Share2, Send, Bell, Search, Zap, Twitter, MessageSquare } from 'lucide-react'
import { MarketTickerBar } from '@/components/market-ticker-bar'
import { TerminalOverlay } from '@/components/terminal-overlay'

export default function HomePage() {
  return (
    <>
      {/* Ticker inside hero background context (full-bleed) */}
      {/* Global radial glow across the whole page */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(0,229,255,0.08),transparent_60%)]" />

      <main className="relative min-h-screen mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <section id="hero" className="relative min-h-[70vh] md:min-h-[80vh] flex items-center justify-center">
          <TradingGrid />
          {/* Terminal-style animated overlay (market stream) */}
          <TerminalOverlay />
          {/* Full-bleed glow overlay (spans entire viewport width) */}
          <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-screen bg-[radial-gradient(ellipse_at_top,_rgba(0,229,255,0.12),transparent_60%)]" />
          {/* Ticker strip anchored to top, sharing hero background */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-screen">
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
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#00E5FF]/30 bg-[#00E5FF]/10 px-4 py-1.5 mb-4">
              <Zap size={14} className="text-[#00E5FF]" />
              <span className="text-xs tracking-wide text-[#00E5FF] font-medium">AVAILABLE NOW</span>
            </div>
            <h2 className="font-display text-3xl md:text-5xl font-extrabold">Telegram Bot Features</h2>
            <p className="mt-4 text-white/80 max-w-2xl mx-auto">
              Get instant alerts and research tools. Free and open to everyone.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
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
          </div>

          {/* Coming Soon Section */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.05] px-4 py-1.5 mb-4">
              <span className="text-xs tracking-wide text-white/70 font-medium">COMING SOON</span>
            </div>
            <h3 className="font-display text-2xl md:text-3xl font-bold">What's Next</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard
              title="Discord Bot"
              description="Bring alerts and research to your Discord servers. Same features, new platform."
              icon={<MessageSquare size={28} className="text-white/50" />}
            />
            <FeatureCard
              title="Twitter Integration"
              description="Get alerts via DMs and tweet your best predictions with verified receipts."
              icon={<Twitter size={28} className="text-white/50" />}
            />
            <FeatureCard
              title="Trade Execution"
              description="Execute trades directly from alerts. One-tap to enter positions when opportunities arise."
              icon={<Zap size={28} className="text-white/50" />}
            />
          </div>
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

      <section id="waitlist" className="relative py-12 md:py-16">
        <div className="mx-auto max-w-6xl px-6">
          <hr className="mx-auto mb-6 h-px w-40 sm:w-60 border-0 rounded bg-[linear-gradient(90deg,transparent,rgba(0,229,255,0.8),rgba(182,255,0,0.8),transparent)] opacity-70" />
          <h3 className="font-display text-2xl md:text-3xl font-bold">Join the Waitlist for Early Access</h3>
          <p className="text-white/80 mt-2">Get early access to trade execution, Discord/Twitter bots, and exclusive features. Try the Telegram bot now while you wait.</p>

          {/* Feature previews */}
          <div className="mt-5 overflow-x-auto whitespace-nowrap">
            <div className="inline-flex items-center gap-4 text-sm text-white/85">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1">⚡ One-tap trade execution</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1">🎯 Advanced analytics</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1">🏆 Leaderboards & reputation</span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1">📱 Multi-platform support</span>
            </div>
          </div>

          <div className="mt-6 max-w-lg">
            <WaitlistForm />
          </div>

          <div className="mt-6">
            <a
              href="https://t.me/TradeWithSMTM_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-[#229ED9] hover:text-[#00E5FF] transition-colors text-sm font-medium"
            >
              <Send size={16} className="rotate-45" />
              Or start using the Telegram bot now (free, no signup) →
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
    </>
  )
}
