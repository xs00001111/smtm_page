import type { Metadata } from 'next'
import { TradingTerminal } from '@/components/trading-terminal'

export const metadata: Metadata = {
  title: 'Trade · SMTM',
  description: 'Trade prediction markets on SMTM',
}

export default function TradePage() {
  return (
    <main className="relative min-h-screen">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(0,229,255,0.08),transparent_60%)]"
      />
      <TradingTerminal />
    </main>
  )
}
