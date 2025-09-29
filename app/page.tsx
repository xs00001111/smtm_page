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
          <div className="relative z-10 text-center w-full flex flex-col items-center pt-20">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight">
              Show Me The Money
            </h1>
            <p className="mt-4 text-lg text-white/80 max-w-[46ch]">
              Win credibility. Earn cash. Roast the pretenders.
            </p>
            <div className="mt-8 flex gap-4">
              <a href="#waitlist" className="w-full sm:w-auto">
                <button className="w-full sm:w-auto bg-gradient-to-r from-[#00E5FF] to-[#B6FF00] text-black font-semibold px-5 py-3 rounded-xl shadow-[0_0_40px_rgba(182,255,0,0.2)]">
                  Join the Waitlist
                </button>
              </a>
              <a href="#learn-more" className="w-full sm:w-auto">
                <button className="w-full sm:w-auto border border-[#00E5FF] text-[#00E5FF] px-5 py-3 rounded-xl">
                  Learn More
                </button>
              </a>
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

      <hr className="my-16 h-px border-0 bg-gradient-to-r from-transparent via-[#00E5FF] to-[#B6FF00] opacity-50" />

      <section id="learn-more" className="relative py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <FeatureCard
              title="AI Portfolio Companion"
              description="News + signals tied to your assets."
              icon={<BrainCircuit size={24} className="text-teal" />}
            />
            <FeatureCard
              title="Stake Predictions"
              description="Put conviction behind your opinions, see who’s right."
              icon={<TrendingUp size={24} className="text-teal" />}
            />
            <FeatureCard
              title="Viral Sharing"
              description="Turn takes into prediction cards, roast bad calls."
              icon={<Share2 size={24} className="text-teal" />}
            />
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

      <section id="waitlist" className="relative py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h3 className="font-display text-2xl md:text-3xl font-bold">Join the Waitlist</h3>
          <p className="text-muted mt-2">Be first to trade on truth. Get early access updates.</p>
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
