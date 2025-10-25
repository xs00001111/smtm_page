import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Header } from '@/components/header'


export const metadata: Metadata = {
  metadataBase: new URL('https://smtm.example.com'),
  title: {
    default: 'SMTM — Show Me The Money',
    template: '%s · SMTM',
  },
  description: 'Truth is Profitable. Lies are Costly. The conviction-driven trading platform where your opinions have value.',
  openGraph: {
    title: 'SMTM — Truth is Profitable',
    description: 'The conviction-driven trading platform where your opinions have value.',
    type: 'website',
    url: 'https://smtm.example.com',
    siteName: 'SMTM',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'SMTM – Truth is Profitable' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SMTM — Truth is Profitable',
    description: 'The conviction-driven trading platform where your opinions have value.',
    images: ['/opengraph-image'],
  },
  icons: {
    icon: '/favicon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#0C0C0C',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`font-sans bg-background text-foreground`}
      >
        <Header />
        {children}
      </body>
    </html>
  )
}
