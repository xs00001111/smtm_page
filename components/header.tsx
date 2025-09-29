export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0C0C0C]/70 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 h-14 flex items-center">
        <a href="/" className="group inline-flex items-center gap-2 font-display font-extrabold tracking-tight">
          <img
            src="/favicon.svg"
            alt="SMTM"
            className="h-6 w-6 transition-all duration-300 [filter:drop-shadow(0_0_8px_rgba(0,229,255,0.25))] group-hover:[filter:drop-shadow(0_0_14px_rgba(0,229,255,0.45))] group-hover:scale-105"
          />
          <span>SMTM</span>
        </a>
        <nav className="ml-auto flex items-center gap-2 text-sm">
          <a href="/about" className="rounded-md px-3 py-1.5 text-muted hover:text-foreground transition">About</a>
          <a href="/blog" className="rounded-md px-3 py-1.5 text-muted hover:text-foreground transition">Blog</a>
          <a href="/#waitlist" className="rounded-md border border-teal/60 text-teal px-3 py-1.5 hover:bg-teal/10 transition">Join</a>
        </nav>
      </div>
    </header>
  )
}
