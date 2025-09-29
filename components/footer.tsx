export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black/40">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="font-display text-xl font-bold">SMTM</div>
            <p className="text-muted mt-1">Truth over hype. Trade on conviction.</p>
          </div>
          <div className="flex items-center gap-3">
            <a className="text-muted hover:text-foreground" href="#waitlist">Join the Waitlist</a>
            <span className="text-white/20">•</span>
            <a className="text-muted hover:text-foreground" href="/about">About</a>
            <span className="text-white/20">•</span>
            <a className="text-muted hover:text-foreground" href="https://twitter.com" target="_blank" rel="noreferrer">Twitter</a>
            <span className="text-white/20">•</span>
            <a className="text-muted hover:text-foreground" href="https://discord.com" target="_blank" rel="noreferrer">Discord</a>
            <span className="text-white/20">•</span>
            <a className="text-muted hover:text-foreground" href="/terms">Terms</a>
            <span className="text-white/20">•</span>
            <a className="text-muted hover:text-foreground" href="/privacy">Privacy</a>
          </div>
        </div>
      </div>
    </footer>
  )
}

