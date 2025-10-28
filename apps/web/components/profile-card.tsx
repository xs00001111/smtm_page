"use client"

import { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { CheckCircle2, Link2, Shield, Share2, Download, Image as ImageIcon } from 'lucide-react'

interface ProfileCardProps {
  userId?: string | null
}

export function ProfileCard({ userId }: ProfileCardProps) {
  // Hardcoded profile data for now - will be replaced with API call based on userId
  const profile = {
    name: 'Crypto Chad',
    handle: 'cryptochad',
    credibility: 84,
    verified: true,
    portfolioLinked: true,
    stats: {
      predictions: 52,
      accuracy: 72,
      tips: 87,
      followers: 1248,
      following: 93,
      openPositions: 2,
      resolved: 1,
    },
    badges: ['🏅 Top 10% Accuracy', '🎲 High Roller', '💸 Most Tipped'],
  }

  const [copied, setCopied] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [followerCount] = useState(profile.stats.followers)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const onShareLink = useCallback(async () => {
    try {
      const shareUrl = `${window.location.origin}/mini/profile${userId ? `?user=${userId}` : ''}`
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback for browsers that don't support clipboard API
    }
  }, [userId])

  const accuracySeries = useMemo(() => [62, 65, 61, 68, 70, 72, 71, 74, 73, 75], [])

  // Generate shareable card image
  useEffect(() => {
    if (!shareModalOpen) return
    const canvas = canvasRef.current
    if (!canvas) return

    const W = 800, H = 600
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!

    // Dark gradient background
    const bgGrad = ctx.createLinearGradient(0, 0, W, H)
    bgGrad.addColorStop(0, '#0A0F14')
    bgGrad.addColorStop(1, '#0F1A14')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, W, H)

    // Accent glow
    const glowGrad = ctx.createRadialGradient(W/2, 100, 0, W/2, 100, 300)
    glowGrad.addColorStop(0, 'rgba(0,229,255,0.15)')
    glowGrad.addColorStop(1, 'transparent')
    ctx.fillStyle = glowGrad
    ctx.fillRect(0, 0, W, H)

    // Header
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 48px system-ui'
    ctx.fillText(profile.name, 50, 70)

    if (profile.verified) {
      ctx.fillStyle = '#00E5FF'
      ctx.font = '32px system-ui'
      ctx.fillText('✓', ctx.measureText(profile.name).width + 60, 70)
    }

    ctx.fillStyle = '#9CA3AF'
    ctx.font = '24px system-ui'
    ctx.fillText(`@${profile.handle}`, 50, 110)

    // Credibility badge
    ctx.fillStyle = 'rgba(0,229,255,0.2)'
    roundRect(ctx, W - 180, 40, 130, 50, 25)
    ctx.fill()
    ctx.fillStyle = '#00E5FF'
    ctx.font = 'bold 24px system-ui'
    const credText = `${profile.credibility}`
    ctx.fillText(credText, W - 150, 75)

    // Hero Stats - Large and Prominent
    const statY = 200

    // Predictions
    drawHeroStat(ctx, 50, statY, '52', 'Predictions', '#00E5FF')

    // Accuracy - Most Prominent (center)
    drawHeroStat(ctx, 280, statY, '72%', 'Accuracy', '#B6FF00', true)

    // Tips
    drawHeroStat(ctx, 540, statY, '$87', 'Tips Earned', '#00E5FF')

    // Secondary Stats
    const secY = 410
    ctx.fillStyle = '#6B7280'
    ctx.font = 'bold 16px system-ui'
    ctx.fillText('COMMUNITY', 50, secY)

    ctx.fillStyle = '#FFFFFF'
    ctx.font = '24px system-ui'
    ctx.fillText(`${profile.stats.followers.toLocaleString()} Followers`, 50, secY + 35)
    ctx.fillText(`${profile.stats.following} Following`, 50, secY + 70)

    ctx.fillText(`${profile.stats.openPositions} Open`, 400, secY + 35)
    ctx.fillText(`${profile.stats.resolved} Resolved`, 400, secY + 70)

    // Badges
    ctx.fillStyle = '#6B7280'
    ctx.font = 'bold 14px system-ui'
    ctx.fillText('ACHIEVEMENTS', 50, secY + 120)

    let badgeX = 50
    profile.badges.forEach(badge => {
      ctx.fillStyle = 'rgba(255,255,255,0.05)'
      ctx.font = '16px system-ui'
      const badgeWidth = ctx.measureText(badge).width + 30
      roundRect(ctx, badgeX, secY + 135, badgeWidth, 35, 8)
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = '#E5E7EB'
      ctx.fillText(badge, badgeX + 15, secY + 158)
      badgeX += badgeWidth + 10
    })

    // Footer
    ctx.fillStyle = '#6B7280'
    ctx.font = '18px system-ui'
    ctx.fillText('smtm.ai • Track predictions & whales', 50, H - 30)

  }, [shareModalOpen, profile])

  const copyImage = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas) return

    try {
      const blob: Blob | null = await new Promise(resolve => canvas.toBlob(b => resolve(b), 'image/png'))
      if (blob && 'clipboard' in navigator && 'ClipboardItem' in window) {
        // @ts-ignore
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
        return
      }
    } catch {
      // Fallback to download
      downloadImage()
    }
  }, [])

  const downloadImage = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = 'smtm-profile.png'
    a.click()
  }, [])

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border-2 border-white/20 p-6 md:p-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center gap-6 mb-8">
          <div className="flex items-center gap-4 flex-1">
            <div
              className="w-[72px] h-[72px] rounded-xl grid place-items-center text-2xl md:text-3xl font-bold border border-white/10"
              style={avatarStyle(profile.handle)}
            >
              {profile.name.charAt(0)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-2xl md:text-3xl font-extrabold leading-tight">
                  {profile.name}
                </h2>
                {profile.verified && (
                  <span className="inline-flex items-center gap-1 text-teal text-sm">
                    <CheckCircle2 className="h-4 w-4" /> Verified
                  </span>
                )}
              </div>
              <div className="text-muted">@{profile.handle}</div>
            </div>
          </div>

          <div className="inline-flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-teal/10 text-teal text-sm px-3 py-1.5 border border-teal/30 font-semibold">
              Credibility {profile.credibility}
            </span>
          </div>
        </div>

        {/* Hero Stats - Prominent Display */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <HeroStat label="Predictions" value={`${profile.stats.predictions}`} />
          <HeroStat label="Accuracy" value={`${profile.stats.accuracy}%`} highlight series={accuracySeries} />
          <HeroStat label="Tips Earned" value={`$${profile.stats.tips}`} />
        </div>

        {/* Share Buttons */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={onShareLink}
            className="flex-1 h-12 px-4 rounded-lg border border-white/10 bg-white/[0.03] text-sm font-semibold hover:bg-white/[0.06] transition inline-flex items-center justify-center gap-2"
          >
            <Share2 className="h-4 w-4" />
            {copied ? 'Link Copied!' : 'Share Link'}
          </button>
          <button
            onClick={() => setShareModalOpen(true)}
            className="flex-1 h-12 px-4 rounded-lg border border-teal/30 bg-teal/10 text-teal text-sm font-semibold hover:bg-teal/20 transition inline-flex items-center justify-center gap-2"
          >
            <ImageIcon className="h-4 w-4" />
            Share Image
          </button>
        </div>

        {/* Community Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Strip label="Followers" value={followerCount.toLocaleString()} />
          <Strip label="Following" value={profile.stats.following.toLocaleString()} />
          <Strip label="Open Positions" value={profile.stats.openPositions.toString()} />
          <Strip label="Resolved" value={profile.stats.resolved.toString()} />
        </div>

        {/* Badges */}
        <div className="pt-6 border-t border-white/10">
          <div className="text-xs text-white/60 mb-3 font-semibold">ACHIEVEMENTS</div>
          <div className="flex flex-wrap gap-2">
            {profile.badges.map((badge, i) => (
              <span key={i} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-white/80 text-sm">
                {badge}
              </span>
            ))}
          </div>
        </div>

        {/* Trust Info */}
        <div className="mt-6 pt-6 border-t border-white/10 flex flex-wrap gap-3 text-sm">
          <span className="inline-flex items-center gap-2 text-white/60">
            <Shield className="h-4 w-4 text-teal" />
            Trust Layer: Reputation-first
          </span>
          <span className="inline-flex items-center gap-2 text-white/60">
            <Link2 className="h-4 w-4 text-teal" />
            Portfolio: {profile.portfolioLinked ? 'Linked (Coinbase API)' : 'Not Linked'}
          </span>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-white/10 text-center text-sm text-muted">
          Track predictions and whales with{' '}
          <a
            href="https://t.me/smtmbot"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal hover:underline"
          >
            @SMTMBot
          </a>
        </div>
      </div>

      {/* Share Modal */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShareModalOpen(false)}>
          <div className="bg-[#0F0F0F] border border-white/10 rounded-xl p-6 max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4">Share Profile Card</h3>
            <canvas ref={canvasRef} className="block rounded-lg border border-white/10 w-full" />
            <div className="mt-4 flex gap-3 justify-end">
              <button
                onClick={() => setShareModalOpen(false)}
                className="rounded-md border border-white/15 bg-white/[0.06] px-4 py-2 text-sm hover:bg-white/[0.1]"
              >
                Close
              </button>
              <button
                onClick={downloadImage}
                className="rounded-md border border-white/15 bg-white/[0.06] px-4 py-2 text-sm hover:bg-white/[0.1] inline-flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download
              </button>
              <button
                onClick={copyImage}
                className="rounded-md border border-teal/50 text-teal px-4 py-2 text-sm hover:bg-teal/10 inline-flex items-center gap-2"
              >
                <ImageIcon className="h-4 w-4" />
                Copy Image
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function HeroStat({
  label,
  value,
  highlight,
  series,
}: {
  label: string
  value: string
  highlight?: boolean
  series?: number[]
}) {
  const path = useMemo(() => {
    if (!series) return ''
    return sparklinePath(series, 100, 30)
  }, [series])

  return (
    <div
      className={`rounded-xl border p-6 text-center transition-all ${
        highlight
          ? 'border-teal/30 bg-teal/5 shadow-[0_0_20px_rgba(0,229,255,0.15)]'
          : 'border-white/10 bg-white/5'
      }`}
    >
      <div className="text-xs text-white/60 mb-2 font-semibold uppercase">{label}</div>
      <div className={`font-extrabold mb-2 ${highlight ? 'text-5xl text-teal' : 'text-4xl text-white/90'}`}>
        {value}
      </div>
      {series && path && (
        <svg width="100" height="30" viewBox="0 0 100 30" className="mx-auto">
          <path d={path} fill="none" stroke="#00E5FF" strokeWidth="2" />
        </svg>
      )}
    </div>
  )
}

function Strip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}

function sparklinePath(data: number[], width: number, height: number) {
  if (data.length === 0) return ''
  const step = width / (data.length - 1 || 1)
  return data
    .map((v, i) => {
      const x = i * step
      const y = height - (v / 100) * height
      return `${i === 0 ? 'M' : 'L'}${x},${y}`
    })
    .join(' ')
}

function avatarStyle(seed: string): React.CSSProperties {
  // Simple deterministic HSL gradient based on seed hash
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  const h2 = (h + 40) % 360
  return {
    background: `linear-gradient(135deg, hsl(${h} 70% 20%), hsl(${h2} 70% 15%))`,
    color: 'white',
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (w < 2 * r) r = w / 2
  if (h < 2 * r) r = h / 2
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function drawHeroStat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  value: string,
  label: string,
  color: string,
  highlight?: boolean
) {
  const boxW = 210
  const boxH = 140

  // Box background
  if (highlight) {
    ctx.fillStyle = 'rgba(0,229,255,0.1)'
    ctx.strokeStyle = 'rgba(0,229,255,0.3)'
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.05)'
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  }
  ctx.lineWidth = 2
  roundRect(ctx, x, y, boxW, boxH, 12)
  ctx.fill()
  ctx.stroke()

  // Label
  ctx.fillStyle = '#9CA3AF'
  ctx.font = 'bold 14px system-ui'
  ctx.textAlign = 'center'
  ctx.fillText(label.toUpperCase(), x + boxW / 2, y + 30)

  // Value
  ctx.fillStyle = highlight ? '#B6FF00' : color
  ctx.font = `bold ${highlight ? '56px' : '48px'} system-ui`
  ctx.fillText(value, x + boxW / 2, y + 90)

  ctx.textAlign = 'start' // Reset
}
