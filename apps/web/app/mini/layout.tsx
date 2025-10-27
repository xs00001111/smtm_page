import type { Metadata, Viewport } from 'next'
import Script from 'next/script'

export const metadata: Metadata = {
  title: {
    default: 'SMTM Mini App',
    template: '%s · SMTM',
  },
  description: 'SMTM Telegram Mini App',
}

export const viewport: Viewport = {
  themeColor: '#0C0C0C',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function MiniLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Telegram Web App SDK */}
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      {children}
    </>
  )
}
