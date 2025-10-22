import { ArrowRight, Bolt, Network, SignalHigh, Siren, UserCircle2 } from 'lucide-react'
import type { Metadata } from 'next'
import { UserProfileCard, WhaleProfileCard, MarketCard } from '@/components/design-cards'
import { SignalAlertCard, SignalFeed } from '@/components/design-signal'
import { DesignInteractive } from '@/components/design-interactive'

function SourceBox({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-sm tracking-wide text-white/70">{subtitle}</div>
      <div className="mt-1 text-lg font-semibold">{title}</div>
    </div>
  )
}

function DetailCard({ title, points }: { title: string; points: string[] }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0F0F0F] p-4">
      <div className="text-sm font-semibold text-teal">{title}</div>
      <ul className="mt-2 space-y-1 text-sm text-white/80 list-disc list-inside">
        {points.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </div>
  )
}

function CommandPill({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm shadow-glow">
      <code className="text-white/90">{label}</code>
    </div>
  )
}

export default function DesignPage() {
  return (
    <main className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10">
      {/* Global backdrop glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(0,229,255,0.08),transparent_60%)]" />

      <header className="mb-8">
        <div className="text-xs tracking-[0.2em] text-white/70 uppercase">Design</div>
        <h1 className="mt-2 text-3xl md:text-4xl font-extrabold tracking-tight">
          Intelligence → Command Layer Mock
        </h1>
        <p className="mt-2 text-white/80 max-w-2xl">
          A lightweight mock of the SMTM product flow based on the sequence graph: sources feed the
          command layer, which powers alerts, mirroring, and execution.
        </p>
        <a href="/design/light" className="mt-3 inline-block rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-sm hover:bg-white/[0.1]">Switch to Light</a>
      </header>

      {/* Hub */}
      <section className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-teal/40 bg-teal/10 px-3 py-1 text-teal">
          <Network size={16} />
          <span className="text-sm font-semibold">Polymarket Intelligence Hub</span>
        </div>
      </section>

      {/* Rows: Source → Detail */}
      <section className="grid grid-cols-1 gap-4">
        {/* Top Predictors */}
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(220px,260px)_36px_minmax(280px,1fr)] items-stretch gap-3">
          <SourceBox title="Top Predictors" subtitle="High Win‑Rate" />
          <div className="hidden sm:grid place-items-center text-teal"><ArrowRight /></div>
          <DetailCard
            title="Creator Profile Card"
            points={[
              'Username / win rate / total bets',
              'Specialization & markets followed',
            ]}
          />
        </div>

        {/* Early Alpha Signals */}
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(220px,260px)_36px_minmax(280px,1fr)] items-stretch gap-3">
          <SourceBox title="Early Alpha Signals" subtitle="Pre‑move Alerts" />
          <div className="hidden sm:grid place-items-center text-teal"><ArrowRight /></div>
          <DetailCard
            title="Sudden Inflow Detector"
            points={['Amount vs price', 'Time before move', 'Result move…']}
          />
        </div>

        {/* Whale Tracker */}
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(220px,260px)_36px_minmax(280px,1fr)] items-stretch gap-3">
          <SourceBox title="Whale Tracker" subtitle="High‑Stake Accounts" />
          <div className="hidden sm:grid place-items-center text-teal"><ArrowRight /></div>
          <DetailCard
            title="Whale Profile Card"
            points={[
              'Wallet id',
              'Capital deployed (30d)',
              'Preferred markets',
            ]}
          />
        </div>

        {/* Signal Feed */}
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(220px,260px)_36px_minmax(280px,1fr)] items-stretch gap-3">
          <SourceBox title="Signal Feed" subtitle="Bot‑style" />
          <div className="hidden sm:grid place-items-center text-teal"><ArrowRight /></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <DetailCard
              title="System Voice"
              points={["Concise terminal‑style messages"]}
            />
            <DetailCard
              title="New Bet Alert"
              points={[
                'Wallet, amount, direction, odds',
              ]}
            />
            <DetailCard title="Ape Mode" points={["Optional meme captions"]} />
          </div>
        </div>
      </section>

      {/* Command Layer */}
      <section className="mt-10">
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 inline-flex items-center gap-2 text-white/90">
            <Bolt className="text-teal" size={18} />
            <span className="text-sm font-semibold tracking-wide">Command Layer</span>
          </div>
          <div className="-mx-2 overflow-x-auto">
            <div className="flex flex-nowrap sm:flex-wrap items-center gap-3 px-2 py-1">
              <CommandPill label="/follow" />
              <CommandPill label="/execute (API)" />
              <CommandPill label="/alert" />
              <CommandPill label="/daily-tip" />
            </div>
          </div>
          <div className="mt-3 rounded-md border border-white/10 bg-white/[0.02] p-3 text-sm text-white/80">
            <div className="font-semibold mb-2">Command Details:</div>
            <div className="space-y-2 text-xs">
              <div><code className="text-teal">/follow</code> — Copy-trade a high win-rate predictor or whale</div>
              <div><code className="text-teal">/execute</code> — Execute trade via API with hedging & protection</div>
              <div><code className="text-teal">/alert</code> — Set alerts with secondary options:
                <div className="ml-4 mt-1 space-y-1">
                  <div>• <code className="text-white/70">/alert market</code> — Alert on market price changes</div>
                  <div>• <code className="text-white/70">/alert whale</code> — Alert when whale places bet</div>
                </div>
              </div>
              <div>
                <code className="text-teal">/daily-tip</code> — Get daily rewards, new markets, and quick profit opportunities
                <div className="ml-4 mt-1 space-y-1 text-white/60">
                  <div>• Auto-pushed daily at 8:00 AM with curated tips</div>
                  <div>• Includes: rebate rewards, trending new markets, almost-ending low-risk bets</div>
                  <div>• Request additional tips anytime: <code className="text-white/70">/daily-tip</code> or <code className="text-white/70">/daily-tip more</code></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footnotes / Legend */}
      <section className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm text-white/80">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex items-center gap-2">
          <UserCircle2 className="text-teal" size={18} />
          Creator and Whale cards power profile pages and leaderboards.
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex items-center gap-2">
          <SignalHigh className="text-teal" size={18} />
          Signals route to feeds and notifications with minimal copy.
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex items-center gap-2">
          <Siren className="text-teal" size={18} />
          Commands trigger in‑app actions, webhooks, or API calls.
        </div>
      </section>

      <DesignInteractive defaultMode="dark" />
    </main>
  )
}

export const metadata: Metadata = {
  title: 'Design · SMTM',
  description: 'Mobile-friendly mocks of the intelligence → command layer, with shareable signal formats compatible with Telegram and Discord.',
  openGraph: {
    title: 'SMTM Design · Intelligence → Command',
    description: 'Mobile-friendly mocks of the intelligence → command layer, with shareable signal formats.',
    type: 'article',
    images: [{ url: '/logo-1024.png', width: 1024, height: 1024 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SMTM Design · Intelligence → Command',
    description: 'Mobile-friendly mocks of the intelligence → command layer, with shareable signal formats.',
    images: ['/logo-1024.png'],
  },
}
