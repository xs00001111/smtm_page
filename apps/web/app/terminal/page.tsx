import TerminalContent from '@/components/terminal/TerminalContent'

export default function TerminalPage() {
  return (
    <main className="min-h-screen bg-[#0C0C0C] text-white relative">
      <div aria-hidden className="terminal-bg fixed inset-0 -z-20" />
      <TerminalContent />
    </main>
  )
}

