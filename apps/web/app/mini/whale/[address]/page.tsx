import type { Metadata } from 'next'
import { WhaleCard } from '@/components/whale-card'

export const metadata: Metadata = {
  title: 'Whale Profile · SMTM',
  description: 'View whale trader profile and performance',
}

interface PageProps {
  params: {
    address: string
  }
  searchParams?: {
    [key: string]: string | string[] | undefined
  }
}

export default async function WhaleProfilePage({ params, searchParams }: PageProps) {
  const { address } = params
  const marketId = typeof searchParams?.market === 'string' ? searchParams.market : undefined

  return (
    <main className="relative min-h-screen px-4 py-6">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(0,229,255,0.08),transparent_60%)]"
      />
      <WhaleCard address={address} marketId={marketId} />
    </main>
  )
}
