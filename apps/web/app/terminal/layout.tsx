import { TerminalHeader } from '@/components/terminal/TerminalHeader'

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0C0C0C] text-white">
      <TerminalHeader />
      {children}
    </div>
  )
}
