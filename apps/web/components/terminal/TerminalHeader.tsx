"use client"

import { Wallet } from 'lucide-react'

export function TerminalHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0C0C0C]/90 backdrop-blur-md">
      <div className="mx-auto max-w-screen-2xl px-4 h-16 flex items-center">
        <a href="/" className="inline-flex items-center gap-2 font-display font-extrabold tracking-tight text-lg">
          <img src="/logo-mark.png" alt="SMTM" className="h-8 w-8" loading="lazy" />
          <span>SMTM Terminal</span>
        </a>

        <nav className="ml-auto flex items-center gap-3">
          <button className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white transition">
            Markets
          </button>
          <button className="rounded-md border border-white/20 bg-white/5 px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 hover:text-white transition">
            Portfolio
          </button>
          <button className="inline-flex items-center gap-2 rounded-md border border-teal/60 bg-teal/10 text-teal px-4 py-1.5 text-sm font-semibold hover:bg-teal/20 transition">
            <Wallet size={16} />
            Connect Wallet
          </button>
        </nav>
      </div>
    </header>
  )
}
