"use client"
import { useMemo, useState, useEffect, useRef } from 'react'
import { ArrowDownRight, ArrowUpRight, Check, Plug, X } from 'lucide-react'

type Direction = 'Long' | 'Short'

export type TradeContext = {
  market: string
  direction: Direction
  price: number // 0..1 odds-like price
  defaultAmount?: number
}

function Backdrop({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 bg-black/70" onClick={onClose} />
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed z-50 inset-0 grid place-items-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0F0F0F] shadow-glow">
        {children}
      </div>
    </div>
  )
}

function DirChip({ d }: { d: Direction }) {
  const up = d === 'Long'
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs ${up ? 'border-teal/60 text-teal' : 'border-red-400/60 text-red-400'}`}>
      {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {d}
    </span>
  )
}

function CurrencyInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="mt-3">
      <label className="text-xs text-white/70">Amount (USD)</label>
      <input
        type="number"
        min={0}
        step="50"
        className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 outline-none focus:ring-2 focus:ring-teal/40"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value || '0'))}
      />
    </div>
  )
}

export function SimulateModal({ ctx, onClose }: { ctx: TradeContext; onClose: () => void }) {
  const [amount, setAmount] = useState<number>(ctx.defaultAmount ?? 1000)
  const estPayout = useMemo(() => (ctx.price > 0 ? amount * (1 / ctx.price) : 0), [amount, ctx.price])

  // --- Bayes-y bot evidence controls (mock) ---
  const [zSent, setZSent] = useState(0) // standardized surprise
  const [kSent, setKSent] = useState(0.15) // sensitivity
  const [decay, setDecay] = useState(0.8) // e^{-lambda dt} proxy 0..1
  const [qStar, setQStar] = useState(Math.max(0.01, Math.min(0.99, ctx.price + 0.05))) // other venue price
  const [wVenue, setWVenue] = useState(0.35) // trust weight
  const [dPoll, setDPoll] = useState(0) // shift in sigma units
  const [kPoll, setKPoll] = useState(0.12)
  const [eps, setEps] = useState(0.02) // trade threshold
  const [applyDag, setApplyDag] = useState(true)
  const [applyConstraint, setApplyConstraint] = useState(true)

  const logit = (p: number) => Math.log(Math.max(1e-6, p) / Math.max(1e-6, 1 - p))
  const invlogit = (l: number) => 1 / (1 + Math.exp(-l))
  const ell0 = useMemo(() => logit(ctx.price), [ctx.price])

  const ellSent = kSent * zSent * decay
  const ellCross = wVenue * (logit(qStar) - ell0)
  const ellPoll = kPoll * dPoll
  const ellDag = applyDag ? 0.05 : 0
  const ellCons = applyConstraint ? 0.03 : 0

  const ellPosterior = ell0 + ellSent + ellCross + ellPoll + ellDag + ellCons
  const pPosterior = invlogit(ellPosterior)
  const act = pPosterior - ctx.price
  const action = act > eps ? 'Buy (Long)' : act < -eps ? 'Sell/Short' : 'No trade'
  const edge = pPosterior - ctx.price
  const ev = amount * edge

  function SummaryCard() {
    return (
      <div className="rounded-xl border border-white/10 bg-[#0F0F0F] p-4">
        <div className="text-sm font-semibold mb-2">Summary</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div className="text-white/70 text-xs">Event</div>
            <div className="mt-1 text-white/90">{ctx.market}</div>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div className="text-white/70 text-xs">Base vs Posterior</div>
            <div className="mt-1">q {ctx.price.toFixed(3)} → p {pPosterior.toFixed(3)}</div>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div className="text-white/70 text-xs">Decision</div>
            <div className="mt-1 font-semibold text-teal">{action}</div>
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
            <div className="text-white/70 text-xs">Edge & EV</div>
            <div className="mt-1">Edge {(edge*100).toFixed(1)}% • EV ${ev.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
          </div>
        </div>
      </div>
    )
  }

  // Share Card canvas drawing and actions
  function ShareCard() {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    useEffect(() => {
      const c = canvasRef.current
      if (!c) return
      const ctx2 = c.getContext('2d')!
      const W = 640, H = 360
      c.width = W; c.height = H
      const g = ctx2.createLinearGradient(0, 0, W, H)
      g.addColorStop(0, '#06131A')
      g.addColorStop(1, '#0F1A06')
      ctx2.fillStyle = g
      ctx2.fillRect(0, 0, W, H)
      // Title
      ctx2.fillStyle = '#00E5FF'
      ctx2.font = 'bold 16px system-ui'
      ctx2.fillText('SMTM • Bayes‑y Sim Snapshot', 20, 28)
      // Event
      ctx2.fillStyle = '#FFFFFF'
      ctx2.font = 'bold 22px system-ui'
      wrapText(ctx2, ctx.market, 20, 64, W - 40, 26)
      // Metrics
      ctx2.font = '14px system-ui'
      ctx2.fillStyle = '#B3E5FF'
      ctx2.fillText(`Base q ${ctx.price.toFixed(3)}  →  Posterior p ${pPosterior.toFixed(3)}`, 20, 110)
      ctx2.fillText(`Decision: ${action} • Edge ${(edge * 100).toFixed(1)}% • EV $${ev.toFixed(0)}`, 20, 132)
      // Footer
      ctx2.fillStyle = '#9CA3AF'
      ctx2.font = '12px system-ui'
      ctx2.fillText('Evidence: sentiment • cross‑venue • polls • DAG • constraints', 20, H - 20)

      function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
        const words = text.split(' ')
        let line = ''
        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' '
          const metrics = ctx.measureText(testLine)
          if (metrics.width > maxWidth && n > 0) {
            ctx.fillText(line, x, y)
            line = words[n] + ' '
            y += lineHeight
          } else {
            line = testLine
          }
        }
        ctx.fillText(line, x, y)
      }
    }, [ctx.market, ctx.price, pPosterior, action, edge, ev])

    async function copyPng() {
      const c = canvasRef.current
      if (!c) return
      const blob: Blob | null = await new Promise(resolve => c.toBlob(b => resolve(b), 'image/png'))
      if (blob && 'clipboard' in navigator && 'ClipboardItem' in window) {
        try {
          // @ts-ignore
          await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
          alert('Share card copied to clipboard')
          return
        } catch {}
      }
      const url = c.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = url; a.download = 'smtm-share.png'; a.click()
    }

    function publishPosterior() {
      window.dispatchEvent(new CustomEvent('smtm:posterior', { detail: { posterior: pPosterior, base: ctx.price, edge } }))
      alert('Posterior sent. Open Simulate Follow to preview impact.')
    }

    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Share Card</div>
          <div className="flex gap-2 text-xs">
            <button onClick={publishPosterior} className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 hover:bg-white/[0.06]">Use posterior in Follow Sim</button>
            <button onClick={copyPng} className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 hover:bg-white/[0.06]">Copy PNG</button>
          </div>
        </div>
        <div className="mt-2 bg-black/30 rounded-lg overflow-hidden">
          <canvas ref={canvasRef} className="w-full h-auto" />
        </div>
      </div>
    )
  }

  return (
    <>
      <Backdrop onClose={onClose} />
      <Panel>
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="text-lg font-semibold">Simulate</div>
            <button className="ml-auto rounded-md border border-white/10 p-1 hover:bg-white/10" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <div className="mt-2 text-sm text-white/80">{ctx.market}</div>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <DirChip d={ctx.direction} />
            <span className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-0.5">Price {ctx.price.toFixed(2)}</span>
          </div>

          <CurrencyInput value={amount} onChange={setAmount} />

          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
              <div className="text-white/70 text-xs">Est. Payout if correct</div>
              <div className="mt-1 text-white font-semibold">${estPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
              <div className="text-white/70 text-xs">Max Loss</div>
              <div className="mt-1 text-white font-semibold">${amount.toLocaleString()}</div>
            </div>
          </div>

          {/* Bayes-y bot evidence section (mock UX) */}
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
            <div className="text-sm font-semibold">Bayes‑y Bot (Off‑exchange Alpha)</div>
            <div className="mt-1 text-xs text-white/70">Base prob from market price; add evidence as Bayes factors in log‑odds space.</div>

            {/* A) Sentiment / news */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                <div className="text-xs text-white/70 mb-1">Sentiment surprise z</div>
                <input type="range" min={-3} max={3} step={0.1} value={zSent} onChange={e=>setZSent(parseFloat(e.target.value))} className="w-full" />
                <div className="flex justify-between text-xs text-white/60"><span>-3</span><span>{zSent.toFixed(1)}</span><span>+3</span></div>
              </div>
              <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                <div className="text-xs text-white/70 mb-1">Sensitivity k</div>
                <input type="range" min={0} max={0.5} step={0.01} value={kSent} onChange={e=>setKSent(parseFloat(e.target.value))} className="w-full" />
                <div className="text-right text-xs text-white/60">{kSent.toFixed(2)}</div>
              </div>
              <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                <div className="text-xs text-white/70 mb-1">Decay exp(-λΔt)</div>
                <input type="range" min={0} max={1} step={0.01} value={decay} onChange={e=>setDecay(parseFloat(e.target.value))} className="w-full" />
                <div className="text-right text-xs text-white/60">{decay.toFixed(2)}</div>
              </div>
            </div>

            {/* B) Cross‑market */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                <div className="text-xs text-white/70">Other venue price q*</div>
                <input type="number" min={0.01} max={0.99} step={0.01} value={qStar} onChange={e=>setQStar(Math.max(0.01, Math.min(0.99, parseFloat(e.target.value||'0'))))} className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.02] px-2 py-1" />
              </div>
              <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                <div className="text-xs text-white/70 mb-1">Trust weight w</div>
                <input type="range" min={0} max={1} step={0.01} value={wVenue} onChange={e=>setWVenue(parseFloat(e.target.value))} className="w-full" />
                <div className="text-right text-xs text-white/60">{wVenue.toFixed(2)}</div>
              </div>
              <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                <div className="text-xs text-white/70">Spread s = logit(q*) − logit(q)</div>
                <div className="mt-1 text-white font-semibold">{(logit(qStar) - ell0).toFixed(2)}</div>
              </div>
            </div>

            {/* C) Polls / quant */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                <div className="text-xs text-white/70 mb-1">Poll shift Δ (σ units)</div>
                <input type="range" min={-3} max={3} step={0.1} value={dPoll} onChange={e=>setDPoll(parseFloat(e.target.value))} className="w-full" />
                <div className="text-right text-xs text-white/60">{dPoll.toFixed(1)}</div>
              </div>
              <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                <div className="text-xs text-white/70 mb-1">Sensitivity k_poll</div>
                <input type="range" min={0} max={0.5} step={0.01} value={kPoll} onChange={e=>setKPoll(parseFloat(e.target.value))} className="w-full" />
                <div className="text-right text-xs text-white/60">{kPoll.toFixed(2)}</div>
              </div>
            </div>

            {/* DAG and constraints */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <label className="rounded-md border border-white/10 bg-white/[0.02] p-3 inline-flex items-center gap-2">
                <input type="checkbox" className="accent-teal" checked={applyDag} onChange={e=>setApplyDag(e.target.checked)} />
                Apply DAG nudge (Topic → Mention)
              </label>
              <label className="rounded-md border border-white/10 bg-white/[0.02] p-3 inline-flex items-center gap-2">
                <input type="checkbox" className="accent-teal" checked={applyConstraint} onChange={e=>setApplyConstraint(e.target.checked)} />
                Implied-prob constraints across related markets
              </label>
            </div>

            {/* Posterior and action */}
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                <div className="text-xs text-white/70">Posterior p</div>
                <div className="mt-1 text-white font-semibold">{pPosterior.toFixed(3)}</div>
              </div>
              <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                <div className="text-xs text-white/70 mb-1">Trade threshold ε</div>
                <input type="range" min={0} max={0.1} step={0.005} value={eps} onChange={e=>setEps(parseFloat(e.target.value))} className="w-full" />
                <div className="text-right text-xs text-white/60">{eps.toFixed(3)}</div>
              </div>
              <div className="rounded-md border border-white/10 bg-white/[0.02] p-3 grid place-items-center font-semibold">
                <div className="text-sm">Decision: <span className="text-teal">{action}</span></div>
              </div>
            </div>

            {/* Log lines */}
            <div className="mt-3 rounded-md border border-white/10 bg-white/[0.02] p-3 text-xs text-white/80">
              <div>ℓ₀ = logit(q) = {ell0.toFixed(3)}</div>
              <div>+ Sentiment: k·z·decay = {ellSent.toFixed(3)}</div>
              <div>+ Cross‑market: w[logit(q*)−ℓ₀] = {ellCross.toFixed(3)}</div>
              <div>+ Polls: k_poll·Δ = {ellPoll.toFixed(3)}</div>
              <div>+ DAG/Constraints ≈ {(ellDag + ellCons).toFixed(3)}</div>
              <div className="font-semibold">ℓₜ = {ellPosterior.toFixed(3)} → pₜ = {pPosterior.toFixed(3)}</div>
            </div>

            {/* Compact shareable summary */}
            <div className="mt-3">
              <SummaryCard />
            </div>
            <div className="mt-3">
              <ShareCard />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button onClick={onClose} className="rounded-md border border-white/10 px-3 py-2 text-sm hover:bg-white/[0.06]">Close</button>
            <button onClick={onClose} className="rounded-md bg-cta-gradient text-black font-semibold px-4 py-2 text-sm shadow-glow">
              Simulate Order
            </button>
          </div>
        </div>
      </Panel>
    </>
  )
}

export function ExecuteModal({ ctx, onClose }: { ctx: TradeContext; onClose: () => void }) {
  const [connected, setConnected] = useState(false)
  const [amount, setAmount] = useState<number>(ctx.defaultAmount ?? 1000)
  const [slippage, setSlippage] = useState<number>(0.5)
  const [step, setStep] = useState<'review' | 'confirm' | 'done'>('review')

  const feeRate = 0.02 // 2% platform/route fee (mock)
  const fee = Math.max(0, amount * feeRate)
  const estFillPrice = ctx.price // mock: 1:1
  const estShares = amount > 0 && estFillPrice > 0 ? amount / estFillPrice : 0

  function placeOrder() {
    // No network; just simulate transitions
    setStep('confirm')
    setTimeout(() => setStep('done'), 600)
  }

  return (
    <>
      <Backdrop onClose={onClose} />
      <Panel>
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="text-lg font-semibold">Execute</div>
            <button className="ml-auto rounded-md border border-white/10 p-1 hover:bg-white/10" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <div className="mt-1 text-sm text-white/80">{ctx.market}</div>
          <div className="mt-2 flex items-center gap-2 text-sm">
            <DirChip d={ctx.direction} />
            <span className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-0.5">Price {ctx.price.toFixed(2)}</span>
          </div>

          {step === 'review' && (
            <>
              {/* Connection state */}
              <div className={`mt-3 rounded-md border p-3 text-sm ${connected ? 'border-teal/50 bg-teal/10 text-teal' : 'border-white/10 bg-white/[0.02] text-white/80'}`}>
                <div className="flex items-center gap-2">
                  <Plug size={16} />
                  {connected ? 'Trading API: Connected' : 'Trading API: Disconnected'}
                  {!connected && (
                    <button onClick={() => setConnected(true)} className="ml-auto rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-xs hover:bg-white/[0.08]">
                      Connect
                    </button>
                  )}
                  {connected && <Check size={16} className="ml-auto" />}
                </div>
              </div>

              <CurrencyInput value={amount} onChange={setAmount} />

              {/* Advanced */}
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                  <div className="text-white/70 text-xs">Slippage tolerance</div>
                  <div className="mt-1 flex items-center gap-2">
                    <input type="number" min={0} step="0.1" value={slippage}
                      onChange={(e)=>setSlippage(parseFloat(e.target.value||'0'))}
                      className="w-20 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1 text-sm outline-none" />
                    <span className="text-white/70 text-xs">%</span>
                  </div>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                  <div className="text-white/70 text-xs">Estimated shares</div>
                  <div className="mt-1 text-white font-semibold">{estShares.toFixed(2)}</div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                  <div className="text-white/70 text-xs">Fees (2%)</div>
                  <div className="mt-1 text-white font-semibold">${fee.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                  <div className="text-white/70 text-xs">Total</div>
                  <div className="mt-1 text-white font-semibold">${(amount+fee).toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button onClick={onClose} className="rounded-md border border-white/10 px-3 py-2 text-sm hover:bg-white/[0.06]">Cancel</button>
                <button disabled={!connected}
                  onClick={() => setStep('confirm')}
                  className={`rounded-md px-4 py-2 text-sm font-semibold ${connected ? 'bg-cta-gradient text-black shadow-glow' : 'bg-white/10 text-white/60 cursor-not-allowed'}`}>
                  Review Order
                </button>
              </div>
            </>
          )}

          {step === 'confirm' && (
            <>
              <div className="mt-3 rounded-md border border-white/10 bg-white/[0.02] p-3 text-sm">
                <div className="font-semibold mb-1">Confirm Order</div>
                <div>Buy <span className="font-semibold">{estShares.toFixed(2)}</span> {ctx.direction} at price <span className="font-semibold">{estFillPrice.toFixed(2)}</span></div>
                <div className="mt-1">Amount: <span className="font-semibold">${amount.toLocaleString()}</span> • Fees: <span className="font-semibold">${fee.toLocaleString(undefined,{maximumFractionDigits:0})}</span> • Slippage: {slippage}%</div>
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button onClick={() => setStep('review')} className="rounded-md border border-white/10 px-3 py-2 text-sm hover:bg-white/[0.06]">Edit</button>
                <button onClick={placeOrder} className="rounded-md bg-cta-gradient text-black font-semibold px-4 py-2 text-sm shadow-glow">Place Order</button>
              </div>
            </>
          )}

          {step === 'done' && (
            <>
              <div className="mt-3 rounded-md border border-teal/50 bg-teal/10 p-3 text-sm text-teal">
                <div className="font-semibold">Order Placed</div>
                <div className="mt-1">Ref: <span className="font-mono">ORD-{Math.floor(1000+Math.random()*9000)}</span></div>
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button onClick={onClose} className="rounded-md bg-white text-black font-semibold px-4 py-2 text-sm">Done</button>
              </div>
            </>
          )}
        </div>
      </Panel>
    </>
  )
}

// -------- Follow Simulation (copy trading) --------
export type FollowContext = {
  id?: string
  name: string
  equityCurve?: number[] // normalized equity 1.0 start
  holdings?: { label: string; weight: number }[] // sum to 1
  periodLabel?: string // e.g., '30d'
}

function Sparkline({ data, lower, upper, overlay }: { data: number[]; lower?: number[]; upper?: number[]; overlay?: number[] }) {
  const w = 320, h = 80, pad = 6
  if (data.length < 2) return <div className="h-[80px]" />
  const series = [data].concat(lower && upper && lower.length === data.length && upper.length === data.length ? [lower, upper] : []) as number[][]
  const min = Math.min(...series.flat())
  const max = Math.max(...series.flat())
  const norm = (v: number) => (h - pad) - ((v - min) / (max - min || 1)) * (h - 2 * pad)
  const step = (w - 2 * pad) / (data.length - 1)
  const pathFor = (arr: number[]) => arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${pad + i * step} ${norm(v)}`).join(' ')
  const d = pathFor(data)
  const lastX = pad + (data.length - 1) * step
  const lastY = norm(data[data.length - 1])
  let bandPath = ''
  if (lower && upper && lower.length === data.length && upper.length === data.length) {
    const top = upper.map((v, i) => `${i === 0 ? 'M' : 'L'} ${pad + i * step} ${norm(v)}`).join(' ')
    const bottom = lower.map((v, i) => `L ${pad + (data.length - 1 - i) * step} ${norm(lower[lower.length - 1 - i])}`).join(' ')
    bandPath = `${top} ${bottom} Z`
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20">
      <defs>
        <linearGradient id="g" x1="0" x2="1">
          <stop offset="0%" stopColor="#00E5FF" />
          <stop offset="100%" stopColor="#B6FF00" />
        </linearGradient>
      </defs>
      {bandPath && (
        <path d={bandPath} fill="url(#g)" opacity="0.18" stroke="none" />
      )}
      <path d={d} fill="none" stroke="url(#g)" strokeWidth={2} />
      {overlay && overlay.length === data.length && (
        <path d={pathFor(overlay)} fill="none" stroke="#FFFFFF" strokeOpacity={0.85} strokeWidth={1.5} strokeDasharray="4 3" />
      )}
      <circle cx={lastX} cy={lastY} r={3} fill="#00E5FF" />
    </svg>
  )
}

function percentile(arr: number[], p: number) {
  if (arr.length === 0) return 0
  const a = [...arr].sort((x, y) => x - y)
  const idx = Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))
  return a[idx]
}

function monteCarloBands(equity: number[], sims = 50) {
  if (!equity || equity.length < 2) return { lower: [], upper: [] }
  const rets: number[] = []
  for (let i = 1; i < equity.length; i++) {
    const r = Math.log(equity[i] / equity[i - 1])
    if (Number.isFinite(r)) rets.push(r)
  }
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1)
  const sd = Math.sqrt(rets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (rets.length || 1)) * 1.2
  const L = equity.length
  const paths: number[][] = []
  for (let s = 0; s < sims; s++) {
    let v = equity[0]
    const path = [v]
    for (let i = 1; i < L; i++) {
      const z = (Math.random() * 2 - 1) + (Math.random() * 2 - 1) // approx N(0,1)
      v = v * Math.exp(mean + sd * 0.5 * z)
      path.push(v)
    }
    paths.push(path)
  }
  const lower: number[] = []
  const upper: number[] = []
  for (let i = 0; i < L; i++) {
    const vals = paths.map(p => p[i])
    lower.push(percentile(vals, 0.1))
    upper.push(percentile(vals, 0.9))
  }
  return { lower, upper }
}

function HoldingsBars({ items }: { items: { label: string; weight: number }[] }) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="text-sm">
          <div className="flex items-center justify-between">
            <div className="text-white/80">{it.label}</div>
            <div className="text-white/60">{Math.round(it.weight * 100)}%</div>
          </div>
          <div className="mt-1 h-2 rounded bg-white/[0.06]">
            <div className="h-2 rounded bg-cta-gradient" style={{ width: `${Math.min(100, Math.max(0, it.weight * 100))}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function computeDrawdown(equity: number[]) {
  let peak = equity[0] || 1
  let maxDD = 0
  for (const v of equity) {
    if (v > peak) peak = v
    const dd = (peak - v) / peak
    if (dd > maxDD) maxDD = dd
  }
  return maxDD
}

export function FollowSimulateModal({ ctx, onClose }: { ctx: FollowContext; onClose: () => void }) {
  const [amount, setAmount] = useState(1000)
  const [period, setPeriod] = useState<'7d'|'30d'|'90d'>(
    (ctx.periodLabel as any) || '30d'
  )
  const [equity, setEquity] = useState<number[]>(ctx.equityCurve || [])
  const [holdings, setHoldings] = useState<{label:string;weight:number}[]>(ctx.holdings || [])
  const [showBand, setShowBand] = useState(true)
  const bands = useMemo(() => showBand ? monteCarloBands(equity.length ? equity : (ctx.equityCurve || [])) : { lower: [], upper: [] }, [showBand, equity, ctx.equityCurve])
  const [posteriorEdge, setPosteriorEdge] = useState<number | null>(null)
  const [usePosterior, setUsePosterior] = useState(true)
  const [overlay, setOverlay] = useState<number[] | undefined>(undefined)

  // Fetch from API stub if id provided
  useEffect(() => {
    let active = true
    async function load() {
      if (!ctx.id) return
      try {
        const res = await fetch(`/api/backtest?id=${encodeURIComponent(ctx.id)}&period=${period}`)
        if (!res.ok) return
        const data = await res.json()
        if (!active) return
        setEquity(data.equityCurve || [])
        setHoldings(data.holdings || [])
      } catch {}
    }
    load()
    return () => { active = false }
  }, [ctx.id, period])

  const srcEquity = equity.length ? equity : (ctx.equityCurve || [])
  const srcHoldings = holdings.length ? holdings : (ctx.holdings || [])
  const start = srcEquity[0] || 1
  const end = srcEquity[srcEquity.length - 1] || 1
  const roi = end / start - 1
  const worstDD = computeDrawdown(srcEquity)
  const expProfit = Math.max(0, amount * roi)
  const expLoss = -(amount * worstDD)

  // Listen for posterior from Simulate modal
  useEffect(() => {
    function handler(e: any) {
      if (typeof e.detail?.edge === 'number') setPosteriorEdge(e.detail.edge)
    }
    window.addEventListener('smtm:posterior', handler as any)
    return () => window.removeEventListener('smtm:posterior', handler as any)
  }, [])

  // Build overlay curve when we have posterior edge
  useEffect(() => {
    if (!posteriorEdge || !usePosterior || srcEquity.length < 2) { setOverlay(undefined); return }
    const drift = posteriorEdge * 0.6 // scaled impact
    const out: number[] = [srcEquity[0]]
    for (let i = 1; i < srcEquity.length; i++) {
      const r = srcEquity[i] / srcEquity[i-1] - 1
      const r2 = r + drift/(srcEquity.length-1)
      out.push(out[i-1] * (1 + r2))
    }
    setOverlay(out)
  }, [posteriorEdge, usePosterior, srcEquity])

  return (
    <>
      <Backdrop onClose={onClose} />
      <Panel>
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="text-lg font-semibold">Simulate Follow</div>
            <button className="ml-auto rounded-md border border-white/10 p-1 hover:bg-white/10" onClick={onClose} aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <div className="mt-1 text-sm text-white/80">{ctx.name} • Backtest {period}</div>
          <div className="mt-2 inline-flex rounded-md border border-white/10 bg-white/[0.02] p-1 text-sm">
            {(['7d','30d','90d'] as const).map(p => (
              <button key={p} onClick={()=>setPeriod(p)}
                className={`px-2 py-1 rounded ${p===period ? 'bg-white text-black' : 'text-white/80 hover:bg-white/10'}`}>{p}</button>
            ))}
          </div>

          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <Sparkline data={srcEquity} lower={bands.lower} upper={bands.upper} overlay={overlay} />
            <div className="mt-2 flex items-center gap-2 text-sm flex-wrap">
              <div className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1">ROI {Math.round(roi * 100)}%</div>
              <div className="rounded-md border border-white/10 bg-white/[0.02] px-2 py-1">Max Drawdown {Math.round(worstDD * 100)}%</div>
              <label className="ml-auto inline-flex items-center gap-2 text-xs text-white/80 cursor-pointer">
                <input type="checkbox" className="accent-teal" checked={showBand} onChange={(e)=>setShowBand(e.target.checked)} />
                Show p10–p90 band (Monte Carlo)
              </label>
              {posteriorEdge !== null && (
                <label className="inline-flex items-center gap-2 text-xs text-white/80 cursor-pointer">
                  <input type="checkbox" className="accent-teal" checked={usePosterior} onChange={(e)=>setUsePosterior(e.target.checked)} />
                  Apply posterior drift
                </label>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-white/70 mb-1">Holdings (top)</div>
              <HoldingsBars items={srcHoldings} />
            </div>
            <div>
              <label className="text-xs text-white/70">Copy Amount (USD)</label>
              <input
                type="number"
                min={0}
                step="100"
                className="mt-1 w-full rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 outline-none focus:ring-2 focus:ring-teal/40"
                value={amount}
                onChange={(e)=>setAmount(parseFloat(e.target.value || '0'))}
              />

              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                  <div className="text-white/70 text-xs">Expected Profit ({ctx.periodLabel ?? '30d'})</div>
                  <div className="mt-1 text-teal font-semibold">${expProfit.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                </div>
                <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                  <div className="text-white/70 text-xs">Possible Loss (worst DD)</div>
                  <div className="mt-1 text-red-400 font-semibold">{expLoss.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button onClick={onClose} className="rounded-md border border-white/10 px-3 py-2 text-sm hover:bg-white/[0.06]">Close</button>
            <button onClick={onClose} className="rounded-md bg-cta-gradient text-black font-semibold px-4 py-2 text-sm shadow-glow">Save Simulation</button>
          </div>
        </div>
      </Panel>
    </>
  )
}
