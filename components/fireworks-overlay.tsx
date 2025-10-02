"use client"

import { useEffect, useRef } from 'react'
import { resolveFireworksQuality } from '@/hooks/use-fireworks-quality'

type Props = {
  active: boolean
  onDone?: () => void
  message?: string
  durationMs?: number
  rewardAmount?: number
  // Set to 'low' | 'medium' | 'high' to override auto quality; defaults to 'auto'
  quality?: 'auto' | 'low' | 'medium' | 'high'
}

type Particle = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  life: number
  px: number
  py: number
}

type Ring = { x: number; y: number; r: number; a: number; color: string }
type Floaty = { x: number; y: number; vy: number; a: number; text: string; scale: number }

export function FireworksOverlay({ active, onDone, message = 'Congratulations! 🎉', durationMs = 2200, rewardAmount, quality: qualityOverride = 'auto' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let w = window.innerWidth
    let h = window.innerHeight
    // helper to set canvas internal resolution with a quality-based scale factor
    const setupCanvasSize = () => {
      w = window.innerWidth
      h = window.innerHeight
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1
      const scale = resolvedQuality === 'high' ? Math.min(dpr, 1.5) : resolvedQuality === 'medium' ? 1 : 0.75
      canvas.width = Math.max(1, Math.floor(w * scale))
      canvas.height = Math.max(1, Math.floor(h * scale))
      ctx.setTransform(scale, 0, 0, scale, 0, 0)
    }
    setupCanvasSize()

    const onResize = () => {
      setupCanvasSize()
    }
    window.addEventListener('resize', onResize)

    // respect reduced motion
    const prefersReduced = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Resolve quality from shared helper for a single source of truth
    const resolvedQuality = resolveFireworksQuality(qualityOverride, w)

    const colors = ['#00E5FF', '#B6FF00', '#FFFFFF']
    const particles: Particle[] = []
    const rings: Ring[] = []
    const floaties: Floaty[] = []

    // cache for pre-rendered particle heads (glow sprite) per color
    const spriteCache = new Map<string, HTMLCanvasElement>()
    const getSprite = (color: string, baseSize: number) => {
      const key = `${color}-${resolvedQuality}`
      const cached = spriteCache.get(key)
      if (cached) return cached
      const s = Math.max(8, Math.floor(baseSize * (resolvedQuality === 'high' ? 10 : 8)))
      const off = document.createElement('canvas')
      off.width = s
      off.height = s
      const octx = off.getContext('2d')!
      const r = s / 2
      // radial gradient glow
      const grad = octx.createRadialGradient(r, r, 0, r, r, r)
      const c0 = color
      octx.clearRect(0, 0, s, s)
      grad.addColorStop(0, `${c0}AA`)
      grad.addColorStop(0.4, `${c0}66`)
      grad.addColorStop(1, `${c0}00`)
      octx.fillStyle = grad
      octx.beginPath()
      octx.arc(r, r, r, 0, Math.PI * 2)
      octx.fill()
      spriteCache.set(key, off)
      return off
    }

    // seed bursts from center top-third
    const baseCount = w < 640 ? 2 : 4
    const bursts = prefersReduced ? 1 : resolvedQuality === 'low' ? 1 : resolvedQuality === 'medium' ? Math.min(2, baseCount) : baseCount
    for (let b = 0; b < bursts; b++) {
      const cx = w * (0.3 + 0.4 * Math.random())
      const cy = h * (0.25 + 0.15 * Math.random())
      const count = prefersReduced ? 28 : resolvedQuality === 'low' ? 36 : resolvedQuality === 'medium' ? 60 : 80
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5
        const speed = 2 + Math.random() * 4
        particles.push({
          x: cx,
          y: cy,
          px: cx,
          py: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: resolvedQuality === 'low' ? 1 + Math.random() * 2 : 2 + Math.random() * 3,
          color: colors[(Math.random() * colors.length) | 0],
          life: 1,
        })
      }
      rings.push({ x: cx, y: cy, r: 8, a: 1, color: colors[b % colors.length] })
    }

    // floating dollar signs
    const floats = prefersReduced ? 2 : resolvedQuality === 'low' ? 3 : resolvedQuality === 'medium' ? 6 : 8
    for (let i = 0; i < floats; i++) {
      const x = w * (0.3 + 0.4 * Math.random())
      const y = h * (0.5 + 0.25 * Math.random())
      floaties.push({ x, y, vy: -(0.6 + Math.random() * 0.6), a: 1, text: '$', scale: 1 + Math.random() * 0.6 })
    }

    let start = performance.now()
    const gravity = 0.05
    const drag = 0.992
    const headShadow = 0 // replaced by glow sprite
    const drawHeads = resolvedQuality !== 'low' && !prefersReduced
    const drawStreaks = true
    let frame = 0
    let acc = 0
    const targetMs = resolvedQuality === 'low' ? 1000 / 30 : resolvedQuality === 'medium' ? 1000 / 45 : 1000 / 60

    const tick = (t: number) => {
      const dt = Math.min(32, t - start)
      start = t

      // frame cap for low/medium to reduce work
      acc += dt
      if (acc < targetMs) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }
      acc = 0

      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = resolvedQuality === 'low' ? 'source-over' : 'lighter'
      ctx.lineCap = 'round'
      // particles with streaks
      for (let p of particles) {
        const nx = p.x + p.vx
        const ny = p.y + p.vy + gravity
        p.vx *= drag
        p.vy = p.vy * drag + gravity
        p.px = p.x
        p.py = p.y
        p.x = nx
        p.y = ny
        p.life *= resolvedQuality === 'low' ? 0.986 : 0.991
        const a = Math.max(0, p.life)
        if (drawStreaks) {
          ctx.strokeStyle = p.color
          ctx.globalAlpha = a * 0.6
          ctx.lineWidth = resolvedQuality === 'low' ? 1 : Math.max(1, p.size - 1)
          ctx.beginPath()
          ctx.moveTo((p.px)|0, (p.py)|0)
          ctx.lineTo((p.x)|0, (p.y)|0)
          ctx.stroke()
        }
        if (drawHeads) {
          ctx.globalAlpha = a
          const sprite = getSprite(p.color, 2)
          const size = p.size * (resolvedQuality === 'high' ? 4 : 3)
          ctx.drawImage(sprite, p.x - size / 2, p.y - size / 2, size, size)
        }
      }
      ctx.globalAlpha = 1

      // rings
      if (resolvedQuality === 'low') {
        if ((frame & 1) === 0) {
          for (let r of rings) {
            r.r += 2.4
            r.a *= 0.955
            ctx.strokeStyle = r.color
            ctx.globalAlpha = Math.max(0, r.a * 0.85)
            ctx.lineWidth = 1.5
            ctx.beginPath()
            ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2)
            ctx.stroke()
          }
        } else {
          // still advance state when skipping draw
          for (let r of rings) { r.r += 2.4; r.a *= 0.955 }
        }
      } else {
        for (let r of rings) {
          r.r += 2.4
          r.a *= 0.96
          ctx.strokeStyle = r.color
          ctx.globalAlpha = Math.max(0, r.a)
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'

      // floaty dollars
      ctx.fillStyle = '#B6FF00'
      ctx.font = 'bold 28px system-ui, -apple-system, Segoe UI, Roboto, sans-serif'
      for (let f of floaties) {
        f.y += f.vy
        f.a *= 0.985
        if (resolvedQuality !== 'low' || (frame & 1) === 0) {
          ctx.save()
          ctx.globalAlpha = Math.max(0, f.a)
          ctx.translate(f.x, f.y)
          ctx.scale(f.scale, f.scale)
          ctx.fillText(f.text, 0, 0)
          ctx.restore()
        }
      }

      frame++
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    const endTimer = window.setTimeout(() => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      onDone?.()
      window.removeEventListener('resize', onResize)
    }, durationMs)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      window.clearTimeout(endTimer)
      window.removeEventListener('resize', onResize)
    }
  }, [active, onDone, durationMs, qualityOverride])

  return (
    <div className={`pointer-events-none fixed inset-0 z-50 transition ${active ? 'opacity-100' : 'opacity-0'} duration-200`} aria-hidden>
      <canvas ref={canvasRef} className="absolute inset-0" />
      {active && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">
              {message}
            </div>
            {typeof rewardAmount === 'number' && (
              <div className="mt-2 text-4xl sm:text-5xl lg:text-6xl font-extrabold text-teal drop-shadow">
                ${rewardAmount}
              </div>
            )}
            <div className="mt-2 text-white/80 text-sm sm:text-base">Prediction placed — you’re in.</div>
          </div>
        </div>
      )}
    </div>
  )
}
