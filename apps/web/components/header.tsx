export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0C0C0C]/70 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 h-14 flex items-center">
        <a href="/" className="inline-flex items-center gap-2 font-display font-extrabold tracking-tight">
          <img src="/logo-mark.png" alt="SMTM" className="h-8 w-8" loading="lazy" />
          <span>SMTM</span>
        </a>
        <nav className="ml-auto hidden md:flex items-center gap-2 text-sm">
          <a href="/#waitlist" className="rounded-md border border-teal/60 text-teal px-3 py-1.5 hover:bg-teal/10 transition">Join</a>
        </nav>
      </div>
    </header>
  )
}
