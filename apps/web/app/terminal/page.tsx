"use client"

import { useState, useMemo } from 'react'

// Pure helpers used by the terminal chart
function prng(seed: number) {
  let s = seed >>> 0
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32
}

function catmullRomPath(values: number[], width = 800, height = 320) {
  if (values.length === 0) return ''
  const stepX = width / (values.length - 1)
  const pts = values.map((v, i) => [i * stepX, height - (v / 100) * height]) as [number, number][]
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2[0]} ${p2[1]}`
  }
  return d
}

function spark(values: number[], w = 60, h = 18) {
  if (!values.length) return ''
  const step = w / (values.length - 1)
  const ys = values.map(v => h - (v / 100) * h)
  let d = `M 0 ${ys[0]}`
  for (let i = 1; i < ys.length; i++) d += ` L ${i * step} ${ys[i]}`
  return d
}
import { TrendingUp, TrendingDown, Activity, Users, DollarSign, AlertCircle, Sliders } from 'lucide-react'

export default function TerminalPage() {
  const [selectedOutcome, setSelectedOutcome] = useState<'YES' | 'NO'>('YES')
  const [betAmount, setBetAmount] = useState('')
  // Advanced order states (concept)
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT' | 'BRACKET' | 'TWAP'>('LIMIT')
  const [slippagePct, setSlippagePct] = useState(0.5)
  const [tpEnabled, setTpEnabled] = useState(false)
  const [tpPrice, setTpPrice] = useState('0.85')
  const [slEnabled, setSlEnabled] = useState(false)
  const [slPrice, setSlPrice] = useState('0.55')

  // Mock market data
  const market = {
    question: "Will Bitcoin hit $100k before January 2026?",
    yesPrice: 0.67,
    noPrice: 0.33,
    volume24h: 487250,
    liquidity: 1250000,
    alpha: 78,
    direction: 'YES' as const,
    skew: 0.82,
  }

// helpers moved below component

  // Mock whale activity
  const whaleActivity = [
    { wallet: '0x742d...3f8a', side: 'YES', amount: 50000, score: 92, time: '2m ago' },
    { wallet: '0x8b91...4c2e', side: 'YES', amount: 35000, score: 87, time: '5m ago' },
    { wallet: '0x3a44...7d91', side: 'NO', amount: 25000, score: 81, time: '12m ago' },
  ]

  // Mock orderbook
  const orderbook = {
    yes: [
      { price: 0.67, size: 12500 },
      { price: 0.66, size: 8750 },
      { price: 0.65, size: 15200 },
      { price: 0.64, size: 9800 },
      { price: 0.63, size: 11200 },
    ],
    no: [
      { price: 0.33, size: 11200 },
      { price: 0.34, size: 9800 },
      { price: 0.35, size: 15200 },
      { price: 0.36, size: 8750 },
      { price: 0.37, size: 12500 },
    ],
  }

  // Mock recent trades
  const recentTrades = [
    { side: 'YES', price: 0.67, amount: 5000, time: '09:43:12' },
    { side: 'YES', price: 0.67, amount: 2500, time: '09:42:58' },
    { side: 'NO', price: 0.33, amount: 3200, time: '09:42:45' },
    { side: 'YES', price: 0.66, amount: 8500, time: '09:41:33' },
    { side: 'YES', price: 0.67, amount: 1500, time: '09:41:12' },
  ]

  const maxPayout = betAmount ? (parseFloat(betAmount) / (selectedOutcome === 'YES' ? market.yesPrice : market.noPrice)).toFixed(2) : '0.00'
  const potentialProfit = betAmount ? (parseFloat(maxPayout) - parseFloat(betAmount)).toFixed(2) : '0.00'
  const impact = useMemo(() => {
    const amt = Number(betAmount || 0)
    if (!amt) return 0
    const depth = 80000 // toy depth
    return Math.min(3, (amt / depth) * 100)
  }, [betAmount])

  // Controls (tunable by user)
  const [volatility, setVolatility] = useState(2)
  const [jumpProb, setJumpProb] = useState(0.04)
  const [strokeWidth, setStrokeWidth] = useState(2)
  const [strokeOpacity, setStrokeOpacity] = useState(0.95)
  const [markerSize, setMarkerSize] = useState(6)
  const [showTuning, setShowTuning] = useState(false)

  // helpers are defined top-level

  // Build chart series: flat early, cross close to resolution, sharper late
  const { YES_SERIES, NO_SERIES } = useMemo(() => {
    const n = 40
    const crossAt = Math.floor(n * 0.85)
    let yes = 44
    let no = 56
    const ys: number[] = []
    const ns: number[] = []
    for (let i = 0; i < n; i++) {
      const isLate = i >= crossAt
      const t = i / (n - 1)
      const noiseAmp = (0.3 + t * t * 2) * volatility // very low early, higher near end
      const driftYes = isLate ? (67 - yes) * 0.18 : (50 - yes) * 0.02
      const driftNo = isLate ? (33 - no) * 0.18 : (50 - no) * 0.02
      if (!isLate && Math.abs(yes - no) < 2) {
        // keep them apart early for clarity
        yes -= 0.2
        no += 0.2
      }
      const ry = prng(1000 + i)(); const rn = prng(2000 + i)()
      yes += driftYes + (ry - 0.5) * noiseAmp
      no += driftNo + (rn - 0.5) * noiseAmp
      if (prng(3000 + i)() < jumpProb && isLate) yes += (prng(4000 + i)() - 0.5) * 5
      if (prng(5000 + i)() < jumpProb && isLate) no += (prng(6000 + i)() - 0.5) * 5
      yes = Math.min(95, Math.max(5, yes))
      no = Math.min(95, Math.max(5, no))
      ys.push(yes)
      ns.push(no)
    }
    // Force a single cross around crossAt by blending a bit
    const m = Math.floor(crossAt)
    ys[m] = ns[m]
    return { YES_SERIES: ys, NO_SERIES: ns }
  }, [volatility, jumpProb])

  // Deterministic volumes
  const volRnd = prng(98765)
  const VOLUMES = Array.from({ length: 10 }, () => 10 + Math.floor(volRnd() * 40))

  // spark helper is defined at top level

  return (
    <div className="min-h-screen bg-[#0C0C0C] text-white relative">
      <div aria-hidden className="terminal-bg fixed inset-0 -z-20" />
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0C0C0C]/70 backdrop-blur-xl sticky top-0 z-50">
        <div className="mx-auto w-full max-w-screen-2xl px-4 py-4">
          <div className="flex items-center justify-between">
            <a href="/" className="text-xl font-bold bg-gradient-to-r from-[#00E5FF] to-[#B6FF00] bg-clip-text text-transparent">
              SMTM Terminal
            </a>
            <div className="flex items-center gap-4">
              <span className="text-sm text-white/60">Demo Mode</span>
              <button className="px-4 py-2 rounded-lg bg-gradient-to-r from-[#00E5FF] to-[#B6FF00] text-black font-semibold text-sm">
                Connect Wallet
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-screen-2xl px-4 py-6">
        {/* Market Header */}
        <div className="mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold mb-2">{market.question}</h1>
              <div className="flex items-center gap-4 text-sm text-white/60">
                <span>24h Volume: ${(market.volume24h / 1000).toFixed(0)}K</span>
                <span>•</span>
                <span>Liquidity: ${(market.liquidity / 1000).toFixed(0)}K</span>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="text-right">
                <div className="text-xs text-white/60 mb-1">YES</div>
                <div className="text-2xl font-bold text-teal">{(market.yesPrice * 100).toFixed(0)}%</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-white/60 mb-1">NO</div>
                <div className="text-2xl font-bold text-red-400">{(market.noPrice * 100).toFixed(0)}%</div>
              </div>
            </div>
          </div>
        </div>

        {/* Top layout: Featured + Chart left; Odds/Movers/Depth right */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div className="lg:col-span-2 space-y-4">
            <FeaturedMarkets />
            {/* Chart Card */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 glass-card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Price Chart</h2>
                <div className="flex gap-2 items-center">
                  <button onClick={()=>setShowTuning(v=>!v)} className="inline-flex items-center gap-1 text-xs rounded-md border border-white/10 bg-white/5 px-2 py-1 hover:bg-white/10">
                    <Sliders className="h-3.5 w-3.5" /> Tuning
                  </button>
                  {['1H', '1D', '1W', '1M', 'ALL'].map((period) => (
                    <button
                      key={period}
                      className="px-3 py-1 text-xs rounded-md bg-white/5 hover:bg-white/10 transition"
                    >
                      {period}
                    </button>
                  ))}
                </div>
              </div>
              <AlphaChips />
              {showTuning && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3 text-xs text-white/70 mt-3">
                <label className="block">
                  <div>Volatility {volatility.toFixed(1)}</div>
                  <input type="range" min={0.5} max={6} step={0.1} value={volatility} onChange={(e)=>setVolatility(parseFloat(e.target.value))} className="w-full" />
                </label>
                <label className="block">
                  <div>Jump prob {(jumpProb*100).toFixed(1)}%</div>
                  <input type="range" min={0} max={0.12} step={0.005} value={jumpProb} onChange={(e)=>setJumpProb(parseFloat(e.target.value))} className="w-full" />
                </label>
                <label className="block">
                  <div>Stroke {strokeWidth.toFixed(1)}px</div>
                  <input type="range" min={1} max={4} step={0.5} value={strokeWidth} onChange={(e)=>setStrokeWidth(parseFloat(e.target.value))} className="w-full" />
                </label>
                <label className="block">
                  <div>Opacity {Math.round(strokeOpacity*100)}%</div>
                  <input type="range" min={0.3} max={1} step={0.05} value={strokeOpacity} onChange={(e)=>setStrokeOpacity(parseFloat(e.target.value))} className="w-full" />
                </label>
                <label className="block">
                  <div>Marker {markerSize}px</div>
                  <input type="range" min={4} max={10} step={1} value={markerSize} onChange={(e)=>setMarkerSize(parseInt(e.target.value))} className="w-full" />
                </label>
              </div>
              )}
              {/* Chart */}
              <div className="relative h-80 bg-gradient-to-b from-teal/5 to-transparent rounded-lg border border-white/5">
                <svg className="w-full h-full" viewBox="0 0 800 320" preserveAspectRatio="none">
                  <defs>
                    <filter id="yesGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="2.2" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="noGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="2.2" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  {[0, 25, 50, 75, 100].map((y) => (
                    <line key={y} x1="0" y1={320 - (y * 3.2)} x2="800" y2={320 - (y * 3.2)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                  ))}
                  <path d={catmullRomPath(YES_SERIES)} fill="none" stroke="#00E5FF" strokeOpacity={strokeOpacity} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" filter="url(#yesGlow)" />
                  <path d={catmullRomPath(NO_SERIES)} fill="none" stroke="#EF4444" strokeOpacity={strokeOpacity} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" filter="url(#noGlow)" />
                  {[50, 120, 200, 280, 350, 420, 500, 580, 650, 720].map((x, i) => (
                    <rect key={i} x={x} y={320 - (VOLUMES[i % VOLUMES.length] + 10)} width="40" height={VOLUMES[i % VOLUMES.length]} fill="rgba(0,229,255,0.18)" />
                  ))}
                  <circle cx="800" cy={320 - (YES_SERIES[YES_SERIES.length-1]/100)*320} r={markerSize} stroke="#00E5FF" strokeWidth={Math.max(1, markerSize/3)} fill="#0C0C0C" />
                  <circle cx="800" cy={320 - (YES_SERIES[YES_SERIES.length-1]/100)*320} r={Math.max(1, Math.round(markerSize/3))} fill="#FFFFFF" />
                  <circle cx="800" cy={320 - (NO_SERIES[NO_SERIES.length-1]/100)*320} r={markerSize} stroke="#EF4444" strokeWidth={Math.max(1, markerSize/3)} fill="#0C0C0C" />
                  <circle cx="800" cy={320 - (NO_SERIES[NO_SERIES.length-1]/100)*320} r={Math.max(1, Math.round(markerSize/3))} fill="#FFFFFF" />
                </svg>
                {/* axis labels minimal to save space */}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <OddsGauge percent={Math.round(YES_SERIES[YES_SERIES.length-1])} />
            <PriceMovers />
            <DepthHeatmapCard />
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left Column - Chart & Orderbook */}
          <div className="lg:col-span-2 space-y-4">
            {/* Chart Section */}
              {false && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 glass-card">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold">Price Chart</h2>
                <div className="flex gap-2 items-center">
                  <button onClick={()=>setShowTuning(v=>!v)} className="inline-flex items-center gap-1 text-xs rounded-md border border-white/10 bg-white/5 px-2 py-1 hover:bg-white/10">
                    <Sliders className="h-3.5 w-3.5" /> Tuning
                  </button>
                  {['1H', '1D', '1W', '1M', 'ALL'].map((period) => (
                    <button
                      key={period}
                      className="px-3 py-1 text-xs rounded-md bg-white/5 hover:bg-white/10 transition"
                    >
                      {period}
                    </button>
                  ))}
                </div>
              </div>
              )}
              {/* Alpha signal chips */}
              <AlphaChips />
              {/* Tuning controls */}
              {showTuning && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3 text-xs text-white/70 mt-3">
                <label className="block">
                  <div>Volatility {volatility.toFixed(1)}</div>
                  <input type="range" min={0.5} max={6} step={0.1} value={volatility} onChange={(e)=>setVolatility(parseFloat(e.target.value))} className="w-full" />
                </label>
                <label className="block">
                  <div>Jump prob {(jumpProb*100).toFixed(1)}%</div>
                  <input type="range" min={0} max={0.12} step={0.005} value={jumpProb} onChange={(e)=>setJumpProb(parseFloat(e.target.value))} className="w-full" />
                </label>
                <label className="block">
                  <div>Stroke {strokeWidth.toFixed(1)}px</div>
                  <input type="range" min={1} max={4} step={0.5} value={strokeWidth} onChange={(e)=>setStrokeWidth(parseFloat(e.target.value))} className="w-full" />
                </label>
                <label className="block">
                  <div>Opacity {Math.round(strokeOpacity*100)}%</div>
                  <input type="range" min={0.3} max={1} step={0.05} value={strokeOpacity} onChange={(e)=>setStrokeOpacity(parseFloat(e.target.value))} className="w-full" />
                </label>
                <label className="block">
                  <div>Marker {markerSize}px</div>
                  <input type="range" min={4} max={10} step={1} value={markerSize} onChange={(e)=>setMarkerSize(parseInt(e.target.value))} className="w-full" />
                </label>
              </div>
              )}
              {/* Mock Chart Area */}
              <div className="relative h-80 bg-gradient-to-b from-teal/5 to-transparent rounded-lg border border-white/5">
                <svg className="w-full h-full" viewBox="0 0 800 320" preserveAspectRatio="none">
                  <defs>
                    {/* Smooth strokes and subtle glow toward the right (resolution) */}
                    <linearGradient id="yesGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#00E5FF" stopOpacity="0.6" />
                      <stop offset="80%" stopColor="#00E5FF" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#B6FF00" stopOpacity="1" />
                    </linearGradient>
                    <linearGradient id="noGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#EF4444" stopOpacity="0.6" />
                      <stop offset="80%" stopColor="#EF4444" stopOpacity="0.9" />
                      <stop offset="100%" stopColor="#FFA3A3" stopOpacity="1" />
                    </linearGradient>
                    <filter id="yesGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="2.2" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="noGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="2.2" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  {/* Grid lines */}
                  {[0, 25, 50, 75, 100].map((y) => (
                    <line
                      key={y}
                      x1="0"
                      y1={320 - (y * 3.2)}
                      x2="800"
                      y2={320 - (y * 3.2)}
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth="1"
                    />
                  ))}

                  {/* YES line (teal) - trending up */}
                  <path
                    d={catmullRomPath(YES_SERIES)}
                    fill="none"
                    stroke="#00E5FF"
                    strokeOpacity={strokeOpacity}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#yesGlow)"
                  />

                  {/* NO line (red) - trending down */}
                  <path
                    d={catmullRomPath(NO_SERIES)}
                    fill="none"
                    stroke="#EF4444"
                    strokeOpacity={strokeOpacity}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#noGlow)"
                  />

                  {/* Volume bars at bottom (deterministic) */}
                  {[50, 120, 200, 280, 350, 420, 500, 580, 650, 720].map((x, i) => (
                    <rect
                      key={i}
                      x={x}
                      y={320 - (VOLUMES[i % VOLUMES.length] + 10)}
                      width="40"
                      height={VOLUMES[i % VOLUMES.length]}
                      fill="rgba(0,229,255,0.18)"
                    />
                  ))}

                  {/* Current price marker for YES */}
                  <circle cx="800" cy={320 - (YES_SERIES[YES_SERIES.length-1]/100)*320} r={markerSize} stroke="#00E5FF" strokeWidth={Math.max(1, markerSize/3)} fill="#0C0C0C" />
                  <circle cx="800" cy={320 - (YES_SERIES[YES_SERIES.length-1]/100)*320} r={Math.max(1, Math.round(markerSize/3))} fill="#FFFFFF" />

                  {/* Current price marker for NO */}
                  <circle cx="800" cy={320 - (NO_SERIES[NO_SERIES.length-1]/100)*320} r={markerSize} stroke="#EF4444" strokeWidth={Math.max(1, markerSize/3)} fill="#0C0C0C" />
                  <circle cx="800" cy={320 - (NO_SERIES[NO_SERIES.length-1]/100)*320} r={Math.max(1, Math.round(markerSize/3))} fill="#FFFFFF" />
                </svg>

                {/* Price labels on the right */}
                <div className="absolute right-4 top-[30%] flex items-center gap-2 bg-[#0C0C0C] px-2 py-1 rounded border border-teal/30">
                  <div className="w-2 h-2 rounded-full bg-teal"></div>
                  <span className="text-sm font-semibold text-teal">YES 67%</span>
                </div>
                <div className="absolute right-4 bottom-[30%] flex items-center gap-2 bg-[#0C0C0C] px-2 py-1 rounded border border-red-400/30">
                  <div className="w-2 h-2 rounded-full bg-red-400"></div>
                  <span className="text-sm font-semibold text-red-400">NO 33%</span>
                </div>

                {/* Y-axis labels */}
                <div className="absolute right-2 top-0 text-xs text-white/40">100%</div>
                <div className="absolute right-2 top-1/4 text-xs text-white/40">75%</div>
                <div className="absolute right-2 top-1/2 text-xs text-white/40">50%</div>
                <div className="absolute right-2 top-3/4 text-xs text-white/40">25%</div>
                <div className="absolute right-2 bottom-0 text-xs text-white/40">0%</div>

                {/* X-axis labels */}
                <div className="absolute bottom-2 left-4 text-xs text-white/40">Dec 4</div>
                <div className="absolute bottom-2 left-1/4 text-xs text-white/40">Dec 5</div>
                <div className="absolute bottom-2 left-1/2 text-xs text-white/40">Dec 6</div>
                <div className="absolute bottom-2 right-1/4 text-xs text-white/40">Dec 7</div>
                <div className="absolute bottom-2 right-20 text-xs text-white/40">Dec 8</div>
            </div>
          </div>

          {/* Strategy Builder */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 glass-card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Strategy Builder</h2>
              <div className="text-xs text-white/60">Smart routing: <span className="text-teal">CLOB</span></div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                { label: 'Momentum YES', side: 'YES' as const },
                { label: 'Mean Revert NO', side: 'NO' as const },
                { label: 'Breakout', side: 'YES' as const },
                { label: 'Hedge Tail', side: 'NO' as const },
              ].map((s, i) => (
                <button key={i}
                  onClick={()=>setSelectedOutcome(s.side)}
                  className={`px-3 py-2 rounded-md border text-xs transition ${selectedOutcome===s.side? 'border-teal/50 bg-teal/10 text-teal':'border-white/10 bg-white/5 hover:bg-white/10'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

            {/* Orderbook */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 glass-card">
              <h2 className="text-lg font-semibold mb-4">Order Book</h2>
              <div className="grid grid-cols-2 gap-4">
                {/* YES Orders */}
                <div>
                  <div className="text-xs text-white/60 mb-2 flex justify-between px-2">
                    <span>Price</span>
                    <span>Size</span>
                  </div>
                  {orderbook.yes.map((order, i) => (
                    <div key={i} className="relative mb-1">
                      <div
                        className="absolute inset-0 bg-teal/10 rounded"
                        style={{ width: `${(order.size / 20000) * 100}%` }}
                      />
                      <div className="relative flex justify-between px-2 py-1 text-sm">
                        <span className="text-teal font-medium">{(order.price * 100).toFixed(0)}¢</span>
                        <span className="text-white/60">${(order.size / 1000).toFixed(1)}K</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* NO Orders */}
                <div>
                  <div className="text-xs text-white/60 mb-2 flex justify-between px-2">
                    <span>Price</span>
                    <span>Size</span>
                  </div>
                  {orderbook.no.map((order, i) => (
                    <div key={i} className="relative mb-1">
                      <div
                        className="absolute inset-0 bg-red-500/10 rounded"
                        style={{ width: `${(order.size / 20000) * 100}%` }}
                      />
                      <div className="relative flex justify-between px-2 py-1 text-sm">
                        <span className="text-red-400 font-medium">{(order.price * 100).toFixed(0)}¢</span>
                        <span className="text-white/60">${(order.size / 1000).toFixed(1)}K</span>
                      </div>
                    </div>
                  ))}
                </div>
            </div>
          </div>

          {/* Recent Trades */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 glass-card">
              <h2 className="text-lg font-semibold mb-4">Recent Trades</h2>
              <div className="space-y-2">
                <div className="text-xs text-white/60 flex justify-between px-2">
                  <span>Time</span>
                  <span>Side</span>
                  <span>Price</span>
                  <span>Amount</span>
                </div>
                {recentTrades.map((trade, i) => (
                  <div key={i} className="flex justify-between px-2 py-1.5 text-sm hover:bg-white/5 rounded">
                    <span className="text-white/60">{trade.time}</span>
                    <span className={trade.side === 'YES' ? 'text-teal font-medium' : 'text-red-400 font-medium'}>
                      {trade.side}
                    </span>
                    <span className="text-white/80">{(trade.price * 100).toFixed(0)}¢</span>
                    <span className="text-white/60">${(trade.amount / 1000).toFixed(1)}K</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Depth heatmap moved to right column above */}

          {/* Right Column - Signals & Trade */}
          <div className="space-y-6">
            {/* Alpha Signal */}
            <div className="rounded-xl border border-teal/30 bg-gradient-to-br from-teal/10 to-transparent p-6 glass-card">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Smart Money Signal</h2>
                <AlertCircle size={20} className="text-teal" />
              </div>
              <div className="text-center mb-4">
                <div className="text-6xl font-bold bg-gradient-to-r from-teal to-lime bg-clip-text text-transparent">
                  {market.alpha}
                </div>
                <div className="text-sm text-white/60 mt-1">Alpha Score</div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <span className="text-sm text-white/80">Direction</span>
                  <div className="flex items-center gap-2">
                    <TrendingUp size={16} className="text-teal" />
                    <span className="font-semibold text-teal">{market.direction}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/5">
                  <span className="text-sm text-white/80">Skew</span>
                  <span className="font-semibold">{(market.skew * 100).toFixed(0)}% {market.direction}</span>
                </div>
                <div className="p-3 rounded-lg bg-teal/10 border border-teal/30">
                  <div className="text-xs text-teal mb-1">Signal</div>
                  <div className="text-sm font-medium">Strong Buy - Smart money heavily favors YES</div>
                </div>
                {/* Heatmap under the score */}
                <SignalHeatmap />
              </div>
            </div>

            {/* Whale Activity */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Whale Activity</h2>
                <Users size={20} className="text-white/60" />
              </div>
              <div className="space-y-3">
                {whaleActivity.map((whale, i) => (
                  <div key={i} className="p-3 rounded-lg bg-white/5 hover:bg-white/10 transition">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-mono text-white/60">{whale.wallet}</span>
                      <span className={`text-xs font-semibold ${whale.side === 'YES' ? 'text-teal' : 'text-red-400'}`}>
                        {whale.side}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">${(whale.amount / 1000).toFixed(0)}K</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-white/60">Score: {whale.score}</span>
                        <span className="text-xs text-white/40">{whale.time}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Trade Panel */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <h2 className="text-lg font-semibold mb-2">Place Order</h2>
              {/* Best bid/ask + spread */}
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                {(() => {
                  const bestBid = Math.max(...orderbook.yes.map(o=>o.price))
                  const bestAsk = Math.min(bestBid + 0.01, 0.99)
                  const spread = (bestAsk - bestBid) * 100
                  return (
                    <>
                      <span className="rounded-md border border-teal/40 bg-teal/10 text-teal px-2 py-1">Bid {Math.round(bestBid*100)}¢</span>
                      <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">Ask {Math.round(bestAsk*100)}¢</span>
                      <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">Spread ~{spread.toFixed(1)}¢</span>
                    </>
                  )
                })()}
              </div>

              {/* Outcome Toggle */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <button
                  onClick={() => setSelectedOutcome('YES')}
                  className={`py-3 rounded-lg font-semibold transition ${
                    selectedOutcome === 'YES'
                      ? 'bg-teal text-black'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  YES {(market.yesPrice * 100).toFixed(0)}¢
                </button>
                <button
                  onClick={() => setSelectedOutcome('NO')}
                  className={`py-3 rounded-lg font-semibold transition ${
                    selectedOutcome === 'NO'
                      ? 'bg-red-500 text-white'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  NO {(market.noPrice * 100).toFixed(0)}¢
                </button>
              </div>

            {/* Amount Input */}
            <div className="mb-4">
              <label className="text-xs text-white/60 mb-2 block">Amount (USD)</label>
              <input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 focus:border-teal focus:outline-none text-lg"
              />
              <div className="flex gap-2 mt-2">
                {['25', '50', '100', '500'].map((amount) => (
                  <button
                    key={amount}
                    onClick={() => setBetAmount(amount)}
                    className="flex-1 py-1.5 text-xs rounded bg-white/5 hover:bg-white/10 transition"
                  >
                    ${amount}
                  </button>
                ))}
              </div>
            </div>

              {/* Mini ladder */}
              <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                <div className="rounded-md border border-white/10 p-2">
                  <div className="text-white/60 mb-1">Top YES</div>
                  {orderbook.yes.slice(0,3).map((o,i)=>(
                    <div key={i} className="flex justify-between">
                      <span className="text-teal">{Math.round(o.price*100)}¢</span>
                      <span className="text-white/60">{(o.size/1000).toFixed(1)}K</span>
                    </div>
                  ))}
                </div>
                <div className="rounded-md border border-white/10 p-2">
                  <div className="text-white/60 mb-1">Top NO</div>
                  {orderbook.no.slice(0,3).map((o,i)=>(
                    <div key={i} className="flex justify-between">
                      <span className="text-red-400">{Math.round(o.price*100)}¢</span>
                      <span className="text-white/60">{(o.size/1000).toFixed(1)}K</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Advanced options */}
            <div className="mb-4">
              <div className="text-xs text-white/60 mb-2">Order Type</div>
              <div className="flex flex-wrap gap-2 mb-3 text-xs">
                {(['MARKET','LIMIT','BRACKET','TWAP'] as const).map(t => (
                  <button key={t} onClick={()=>setOrderType(t)} className={`px-2.5 py-1 rounded border ${orderType===t? 'border-teal/50 bg-teal/10 text-teal':'border-white/10 bg-white/5 hover:bg-white/10'}`}>{t}</button>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <label className="block">Slippage {slippagePct}%
                  <input type="range" min={0} max={2} step={0.1} value={slippagePct} onChange={(e)=>setSlippagePct(parseFloat(e.target.value))} className="w-full" />
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={tpEnabled} onChange={(e)=>setTpEnabled(e.target.checked)} />
                  Take Profit
                  <input type="number" value={tpPrice} onChange={(e)=>setTpPrice(e.target.value)} className="ml-2 w-24 rounded-md border border-white/10 bg-white/5 px-2 py-1" />
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={slEnabled} onChange={(e)=>setSlEnabled(e.target.checked)} />
                  Stop Loss
                  <input type="number" value={slPrice} onChange={(e)=>setSlPrice(e.target.value)} className="ml-2 w-24 rounded-md border border-white/10 bg-white/5 px-2 py-1" />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">Est. impact <span className="text-teal">{impact.toFixed(2)}%</span></span>
                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">Route <span className="text-white/70">CLOB</span></span>
                <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">Fees <span className="text-white/70">0.20%</span></span>
              </div>
            </div>

              {/* Position Info */}
              <div className="space-y-2 mb-4 p-3 rounded-lg bg-white/5">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Max Payout</span>
                  <span className="font-semibold">${maxPayout}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Potential Profit</span>
                  <span className={`font-semibold ${parseFloat(potentialProfit) > 0 ? 'text-teal' : ''}`}>
                    ${potentialProfit}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Avg Price</span>
                  <span className="font-semibold">
                    {selectedOutcome === 'YES' ? (market.yesPrice * 100).toFixed(0) : (market.noPrice * 100).toFixed(0)}¢
                  </span>
                </div>
              </div>

              {/* Trade Button */}
              <button
                className={`w-full py-4 rounded-lg font-semibold text-lg transition ${
                  selectedOutcome === 'YES'
                    ? 'bg-gradient-to-r from-teal to-lime text-black hover:opacity-90'
                    : 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:opacity-90'
                }`}
              >
                Buy {selectedOutcome} ${betAmount || '0.00'}
              </button>

              <div className="mt-4 text-xs text-center text-white/40">
                Demo mode - No real transactions
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ----- Helper components (outside main client component) -----
function AlphaChips() {
  const momentum = [55,56,57,58,57,59,61,63,62,64]
  const whales = [48,50,53,52,54,57,59,58,60,62]
  const crowd = [42,41,43,45,44,46,47,49,48,50]
  const items = [
    { label: 'Momentum', color: '#00E5FF', data: momentum },
    { label: 'Whale Flow', color: '#B6FF00', data: whales },
    { label: 'Crowd Sentiment', color: '#ffffff', data: crowd },
  ]
  return (
    <div className="flex flex-wrap gap-2 mb-1">
      {items.map((it,i)=> (
        <div key={i} className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs">
          <span className="text-white/80">{it.label}</span>
          <svg width="60" height="18" viewBox="0 0 60 18">
            <path d={(() => {
              const h=18; const w=60;
              const step=w/(it.data.length-1);
              const ys=it.data.map(v=> h - (v/100)*h);
              let d=`M 0 ${ys[0]}`; for(let j=1;j<ys.length;j++) d+=` L ${j*step} ${ys[j]}`; return d;
            })()} fill="none" stroke={it.color} strokeWidth="1.5" />
          </svg>
        </div>
      ))}
    </div>
  )
}

function FeaturedMarkets() {
  const items = [
    { title: 'Bitcoin above $100k by year end?', tag: 'Bitcoin', pct: 65 },
    { title: 'ETH spot ETF approved by Q4?', tag: 'Ethereum', pct: 61 },
    { title: 'Solana flips BNB market cap?', tag: 'Solana', pct: 42 },
  ]
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 glass-card">
      <div className="text-sm font-semibold text-white/80 mb-3">Featured Questions</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {items.map((it,i)=> (
          <div key={i} className="rounded-lg border border-white/10 bg-[#0F0F0F]/70 p-3">
            <div className="text-xs text-white/50 mb-1">{it.tag}</div>
            <div className="font-semibold text-white/90 line-clamp-2">{it.title}</div>
            <div className="mt-3 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-teal" style={{width:`${it.pct}%`}} />
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-white/60">YES {it.pct}%</span>
              <button className="px-2 py-1 rounded-md border border-teal/40 bg-teal/10 text-teal">View</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function OddsGauge({ percent }: { percent: number }) {
  const p = Math.min(99, Math.max(1, percent))
  const r = 48
  const c = 2 * Math.PI * r
  const offset = c * (1 - p / 100)
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 glass-card">
      <div className="text-sm font-semibold text-white/80 mb-3">Market Odds & Probabilities</div>
      <div className="flex items-center justify-center">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r={r} stroke="rgba(255,255,255,0.1)" strokeWidth="10" fill="none" />
          <circle cx="70" cy="70" r={r} stroke="#00E5FF" strokeWidth="10" fill="none" strokeDasharray={c} strokeDashoffset={offset} transform="rotate(-90 70 70)" />
          <text x="70" y="75" textAnchor="middle" className="fill-white" fontSize="20" fontWeight="700">{p}%</text>
        </svg>
      </div>
      <div className="mt-3 text-center text-xs text-white/60">YES probability</div>
    </div>
  )
}

function PriceMovers() {
  const movers = [
    { name: 'BTC Dominance', ch: +0.9 },
    { name: 'ETH ETF', ch: +1.1 },
    { name: 'SOL Upgrade', ch: +0.6 },
    { name: 'DeFi TVL', ch: -0.5 },
    { name: 'Stablecoin Supply', ch: +0.3 },
  ]
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 glass-card">
      <div className="text-sm font-semibold text-white/80 mb-3">Real‑Time Price Movements</div>
      <div className="space-y-2 text-sm">
        {movers.map((m,i)=>(
          <div key={i} className="flex items-center justify-between">
            <span className="text-white/80">{m.name}</span>
            <span className={m.ch>=0? 'text-teal':'text-red-400'}>{m.ch>=0? '+':''}{m.ch.toFixed(2)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function DepthHeatmapCard() {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 glass-card">
      <div className="text-sm font-semibold text-white/80 mb-3">Depth Heatmap</div>
      <div className="grid grid-cols-12 gap-[2px]">
        {Array.from({length: 12}).map((_,i)=> (
          <div key={i} className="h-6 bg-teal/10" style={{opacity: 0.4 + i/20}} />
        ))}
      </div>
      <div className="grid grid-cols-12 gap-[2px] mt-[2px]">
        {Array.from({length: 12}).map((_,i)=> (
          <div key={i} className="h-6 bg-red-500/10" style={{opacity: 1 - i/20}} />
        ))}
      </div>
      <div className="mt-2 text-xs text-white/60">Top: YES depth • Bottom: NO depth</div>
    </div>
  )
}

function SignalHeatmap() {
  const yesVals = Array.from({length:12}, (_,i)=> Math.round(40 + i*4 + Math.sin(i)*3))
  const noVals = yesVals.map(v=> 100 - v - 5)
  const row = (vals: number[], color: string, label: string) => (
    <div className="mb-1">
      <div className="flex items-center justify-between text-xs text-white/60 mb-1">
        <span>{label}</span>
        <span className="text-white/50">avg {(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(0)}%</span>
      </div>
      <div className="grid grid-cols-12 gap-[2px]">
        {vals.map((v,i)=> (
          <div key={i} className="relative h-7 rounded-sm" style={{ backgroundColor: color, opacity: Math.max(0.25, v/100) }}>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] text-white/90">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
  return (
    <div className="mt-2 p-3 rounded-md bg-white/5 border border-white/10">
      <div className="text-xs text-white/70 mb-2">Signal Heatmap</div>
      {row(yesVals, 'rgba(0,229,255,0.5)', 'YES')}
      {row(noVals, 'rgba(239,68,68,0.5)', 'NO')}
    </div>
  )
}
