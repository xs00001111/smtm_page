import { Button } from '@/components/ui/button'
import { Twitter, MessageCircle, Newspaper } from 'lucide-react'

export function Footer() {
  return (
    <footer className="relative bg-[#121212]">
      {/* Neon top border with transparent ends (no hard edges) */}
      <div className="absolute inset-x-0 top-0 h-px pointer-events-none bg-[linear-gradient(90deg,transparent,rgba(0,229,255,0.7)_25%,rgba(182,255,0,0.6)_75%,transparent)]" />
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 items-start">
          {/* Brand */}
          <div>
            <div className="inline-flex items-center gap-2">
              <img src="/logo-mark.svg" alt="SMTM" className="h-6 w-6" />
              <span className="font-display text-xl font-bold">SMTM</span>
            </div>
            <p className="text-white/70 mt-2 max-w-xs">Truth over hype. Trade on conviction.</p>
            <div className="mt-4">
              <a href="#waitlist">
                <Button variant="cta" size="sm">Join the Waitlist</Button>
              </a>
            </div>
          </div>

          {/* Navigation */}
          <div>
            <div className="text-white/80 font-semibold mb-3">Navigate</div>
            <ul className="space-y-2 text-white/70">
              <li><a className="hover:text-white transition" href="/about">About</a></li>
              <li><a className="hover:text-white transition" href="/blog">Blog</a></li>
              <li><a className="hover:text-white transition" href="/terms">Terms</a></li>
              <li><a className="hover:text-white transition" href="/privacy">Privacy</a></li>
            </ul>
          </div>

          {/* Community */}
          <div>
            <div className="text-white/80 font-semibold mb-3">Community</div>
            <ul className="space-y-3 text-white/70">
              <li>
                <a className="inline-flex items-center gap-2 hover:text-teal transition [filter:drop-shadow(0_0_0_rgba(0,0,0,0))] hover:[filter:drop-shadow(0_0_12px_rgba(0,229,255,0.35))]" href="https://twitter.com" target="_blank" rel="noreferrer">
                  <Twitter className="h-4 w-4" /> Twitter
                </a>
              </li>
              <li>
                <a className="inline-flex items-center gap-2 hover:text-teal transition [filter:drop-shadow(0_0_0_rgba(0,0,0,0))] hover:[filter:drop-shadow(0_0_12px_rgba(0,229,255,0.35))]" href="https://discord.com" target="_blank" rel="noreferrer">
                  <MessageCircle className="h-4 w-4" /> Discord
                </a>
              </li>
              <li>
                <a className="inline-flex items-center gap-2 hover:text-teal transition [filter:drop-shadow(0_0_0_rgba(0,0,0,0))] hover:[filter:drop-shadow(0_0_12px_rgba(0,229,255,0.35))]" href="/blog">
                  <Newspaper className="h-4 w-4" /> Blog
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  )
}
