import TerminalContent from '@/components/terminal/TerminalContent'
import GeoBackground from '@/components/terminal/GeoBackground'

export default function TerminalPage() {
  return (
    <main className="min-h-screen bg-[#0C0C0C] text-white relative overflow-hidden">
      <div aria-hidden className="terminal-bg fixed inset-0 -z-20" />
      <GeoBackground />
      <TerminalContent />
    </main>
  )
}
