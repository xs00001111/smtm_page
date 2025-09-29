export function TradingGrid() {
  return (
    <div aria-hidden className="absolute inset-0">
      <div className="trading-grid" />
      <div className="absolute -inset-32 blur-3xl opacity-30" style={{
        background: 'radial-gradient(600px 200px at 20% 20%, rgba(0,229,255,0.35), transparent), radial-gradient(600px 200px at 80% 60%, rgba(182,255,0,0.25), transparent)'
      }} />
    </div>
  )
}

