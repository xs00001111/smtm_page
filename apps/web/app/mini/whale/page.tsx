import type { Metadata } from 'next'
import { WhaleCard } from '@/components/whale-card'

export const metadata: Metadata = {
  title: 'Whale Profile · SMTM',
  description: 'View whale trader profile and performance',
}

export default function MiniWhalePage() {
  // Sample whale address for design preview
  const sampleAddress = '0x5afb91c12c6e91c71451c4511f78b65d85d9f4c2'

  return (
    <main className="relative min-h-screen px-4 py-6">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(0,229,255,0.08),transparent_60%)]"
      />
      <WhaleCard address={sampleAddress} />
    </main>
  )
}

