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
    <main className="relative min-h-screen overflow-hidden">
      <section className="relative isolate min-h-[90vh]">
        <TradingGrid />
        <MarketTickerBar />
        <div className="relative mx-auto max-w-6xl px-6 mt-20 md:mt-24 flex flex-col items-center justify-center md:justify-start text-center">
          <div aria-hidden className="pointer-events-none absolute -z-10 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[radial-gradient(circle_at_center,rgba(0,229,255,0.16),rgba(182,255,0,0.10)_40%,transparent_70%)] blur-2xl" />

          <h1 className="font-display font-extrabold tracking-tight leading-tight text-[clamp(42px,6vw,72px)]">
            Show Me The Money
          </h1>
          <p className="mt-4 text-[18px] md:text-[20px] text-muted max-w-2xl">
            Stake your predictions, build credibility, and get tipped for being right.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-5 justify-center">
            <a href="#waitlist">
              <Button variant="cta">Join the Waitlist</Button>
            </a>
            <a href="#learn-more">
              <Button variant="outline">Learn More</Button>
            </a>
          </div>
        </div>
      </section>

  {/* Mock experience directly under hero */}
  <section className="relative py-16 md:py-24 bg-[#111111]">
    <MockExperience />
  </section>

  {/* Sample profile to show full experience */}
  <section className="relative py-16 md:py-24 bg-[#111111]">
    <ProfileSample />
  </section>

      <section id="learn-more" className="relative py-16 md:py-24 bg-[#111111]">
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
        <div className="mx-auto max-w-3xl px-6">
          <div className="rounded-xl border border-white/10 p-8 bg-white/[0.02] backdrop-blur">
            <h3 className="font-display text-2xl md:text-3xl font-bold">Join the Waitlist</h3>
            <p className="text-muted mt-2">Be first to trade on truth. Get early access updates.</p>
            <div className="mt-6">
              <WaitlistForm />
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}
