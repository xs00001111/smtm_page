import type { Metadata } from 'next'
import { UserProfileCard, WhaleProfileCard } from '@/components/design-cards'
import { SignalAlertCard, SignalFeed } from '@/components/design-signal'
import { DesignInteractive } from '@/components/design-interactive'

export const metadata: Metadata = {
  title: 'Design · Light Preview',
  description: 'Light-mode preview of the SMTM design page (Telegram-friendly).',
}

export default function DesignLightPage() {
  return (
    <main className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10">
      <header className="mb-6">
        <div className="text-xs tracking-[0.2em] text-neutral-600 uppercase">Design (Light)</div>
        <h1 className="mt-2 text-3xl md:text-4xl font-extrabold tracking-tight text-neutral-900">Intelligence → Command Layer Mock</h1>
        <p className="mt-2 text-neutral-700 max-w-2xl">Light-mode preview to match Telegram’s default theme.</p>
        <a href="/design" className="mt-3 inline-block rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-800 hover:bg-neutral-50">Switch to Dark</a>
      </header>

      <DesignInteractive defaultMode="light" defaultDensity="compact" />
    </main>
  )
}
