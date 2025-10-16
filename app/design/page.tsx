import { ArrowRight, Bolt, Network, SignalHigh, Siren, UserCircle2 } from 'lucide-react'
import { UserProfileCard, WhaleProfileCard } from '@/components/design-cards'
import { SignalAlertCard, SignalFeed } from '@/components/design-signal'

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
        <div className="grid grid-cols-[minmax(220px,260px)_36px_minmax(280px,1fr)] items-stretch gap-3">
          <SourceBox title="Top Predictors" subtitle="High Win‑Rate" />
          <div className="grid place-items-center text-teal"><ArrowRight /></div>
          <DetailCard
            title="Creator Profile Card"
            points={[
              'Username / win rate / total bets',
              'Specialization & markets followed',
            ]}
          />
        </div>

        {/* Early Alpha Signals */}
        <div className="grid grid-cols-[minmax(220px,260px)_36px_minmax(280px,1fr)] items-stretch gap-3">
          <SourceBox title="Early Alpha Signals" subtitle="Pre‑move Alerts" />
          <div className="grid place-items-center text-teal"><ArrowRight /></div>
          <DetailCard
            title="Sudden Inflow Detector"
            points={['Amount vs price', 'Time before move', 'Result move…']}
          />
        </div>

        {/* Whale Tracker */}
        <div className="grid grid-cols-[minmax(220px,260px)_36px_minmax(280px,1fr)] items-stretch gap-3">
          <SourceBox title="Whale Tracker" subtitle="High‑Stake Accounts" />
          <div className="grid place-items-center text-teal"><ArrowRight /></div>
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
        <div className="grid grid-cols-[minmax(220px,260px)_36px_minmax(280px,1fr)] items-stretch gap-3">
          <SourceBox title="Signal Feed" subtitle="Bot‑style" />
          <div className="grid place-items-center text-teal"><ArrowRight /></div>
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
          <div className="flex flex-wrap items-center gap-3">
            <CommandPill label="/follow" />
            <CommandPill label="/simulate" />
            <CommandPill label="/execute (API)" />
            <CommandPill label="/alert" />
            <CommandPill label="/alpha-note" />
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

      {/* Profile Cards — concrete mocks */}
      <section className="mt-10">
        <h2 className="text-2xl font-bold mb-4">Profile Cards</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="mb-2 text-sm text-white/70">User Profile Card</div>
            <UserProfileCard />
          </div>
          <div>
            <div className="mb-2 text-sm text-white/70">Whale Card</div>
            <WhaleProfileCard />
          </div>
        </div>
      </section>

      {/* Signals */}
      <section className="mt-12">
        <h2 className="text-2xl font-bold mb-4">Signals</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <div className="mb-2 text-sm text-white/70">New Bet Alert</div>
            <SignalAlertCard
              alert={{
                wallet: '0x42A1...9fC7',
                market: 'ETH ETF approval by Q4',
                direction: 'Long',
                amount: '$12,000',
                odds: '0.56',
                timeAgo: 'just now',
                caption: 'Desk thinks SEC is warming up after staff comments.',
              }}
            />
          </div>
          <div>
            <div className="mb-2 text-sm text-white/70">Feed (bot‑style)</div>
            <SignalFeed />
          </div>
        </div>
      </section>
    </main>
  )
}
