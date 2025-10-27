import type { Metadata } from 'next'
import { ProfileCard } from '@/components/profile-card'

export const metadata: Metadata = {
  title: 'Profile · SMTM',
  description: 'View your SMTM profile card',
}

export default async function MiniProfilePage({
  searchParams
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  // Extract user ID from searchParams if provided
  const userId = typeof searchParams?.user === 'string' ? searchParams.user : null

  return (
    <main className="relative min-h-screen px-4 py-6">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(0,229,255,0.08),transparent_60%)]"
      />
      <ProfileCard userId={userId} />
    </main>
  )
}
