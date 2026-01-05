import type { Metadata, Viewport } from 'next'
import { ClientProviders } from './client-providers'

export const metadata: Metadata = {
  title: {
    default: 'Link Portal',
    template: '%s · SMTM',
  },
  description: 'Securely link your Telegram account with Polymarket trade credentials (trade-only scope).',
}

export const viewport: Viewport = {
  themeColor: '#0C0C0C',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function LinkLayout({ children }: { children: React.ReactNode }) {
  return <ClientProviders>{children}</ClientProviders>
}
