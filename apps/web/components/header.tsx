"use client"

import { usePathname } from 'next/navigation'

export function Header() {
  const pathname = usePathname()
  const borderClass = pathname === '/' ? 'border-transparent' : 'border-white/10'
  return (
    <header className={`sticky top-0 z-40 border-b ${borderClass} bg-[#0C0C0C]/70 backdrop-blur`}>
      <div className="mx-auto max-w-6xl px-6 h-14 flex items-center">
        <a href="/" className="inline-flex items-center gap-2 font-display font-extrabold tracking-tight">
          <img src="/logo-mark.png" alt="SMTM" className="h-8 w-8" loading="lazy" />
          <span>SMTM</span>
        </a>
        <nav className="ml-auto hidden md:flex items-center gap-2 text-sm">
          <a href="https://t.me/TradeWithSMTM_bot" target="_blank" rel="noopener noreferrer" className="rounded-md border border-teal/60 text-teal px-3 py-1.5 hover:bg-teal/10 transition">Open Bot</a>
        </nav>
      </div>
    </header>
  )
}
