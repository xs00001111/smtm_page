"use client"

import { useCallback, useState, useRef, useEffect } from 'react'
import { Share2, Download, Image as ImageIcon } from 'lucide-react'

interface ProfileCardProps {
  userId?: string | null
}

export function ProfileCard({ userId }: ProfileCardProps) {
  // Hardcoded profile data for now - will be replaced with API call based on userId
  const profile = {
    name: 'Crypto Chad',
    handle: 'cryptochad',
    balance: 12450.50,
    balanceChange24h: 125.30,
    balanceChangePercent24h: 1.02,
    pnl: 3245.20,
    pnlPercent: 35.2,
    followers: 1248,
  }

  const [copied, setCopied] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
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

  // Generate shareable card image
  useEffect(() => {
    if (!shareModalOpen) return
    const canvas = canvasRef.current
    if (!canvas) return

    const W = 800, H = 700
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
    const glowGrad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, 400)
    glowGrad.addColorStop(0, 'rgba(0,229,255,0.15)')
    glowGrad.addColorStop(1, 'transparent')
    ctx.fillStyle = glowGrad
    ctx.fillRect(0, 0, W, H)

    // Header - User info top left, SMTM branding top right
    ctx.textAlign = 'left'
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 24px system-ui'
    ctx.fillText(profile.name, 50, 60)

    ctx.fillStyle = '#9CA3AF'
    ctx.font = '15px system-ui'
    ctx.fillText(`@${profile.handle}`, 50, 88)

    // SMTM branding top right (fallback text)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#6B7280'
    ctx.font = 'bold 16px system-ui'
    ctx.fillText('SMTM', W - 50, 60)
    // Try to draw logo image if available
    try {
      const logo = new Image()
      logo.crossOrigin = 'anonymous'
      logo.onload = () => {
        const size = 24
        const x = W - 50 - size - 8
        const y = 60 - size / 2 - 4
        ctx.globalAlpha = 0.8
        ctx.drawImage(logo, x, y, size, size)
        ctx.globalAlpha = 1
      }
      logo.src = '/logo-1024.png'
    } catch {}

    // Hero PNL - centered without background
    ctx.textAlign = 'center'
    const pnlColor = profile.pnl >= 0 ? '#4ADE80' : '#EF4444'
    ctx.fillStyle = pnlColor
    ctx.font = 'black 110px system-ui'
    const pnlValue = Math.abs(profile.pnl).toFixed(0)
    const pnlText = `${profile.pnl >= 0 ? '+' : ''}$${pnlValue}`
    ctx.fillText(pnlText, W / 2, 220)

    // Large percentage
    ctx.fillStyle = pnlColor
    ctx.font = 'bold 36px system-ui'
    ctx.fillText(`${profile.pnl >= 0 ? '+' : ''}${profile.pnlPercent}%`, W / 2, 270)

    // Make label more prominent
    ctx.fillStyle = '#6B7280'
    ctx.font = '16px system-ui'
    ctx.fillText('ALL-TIME P&L', W / 2, 300)

    // Secondary metrics row
    const row1Y = 360
    const row2Y = 395
    const spacing = 240

    ctx.font = '13px system-ui'
    ctx.fillStyle = '#6B7280'
    // Portfolio
    ctx.fillText('Portfolio', W / 2 - spacing / 2, row1Y)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 28px system-ui'
    ctx.fillText(`$${(profile.balance / 1000).toFixed(1)}K`, W / 2 - spacing / 2, row2Y)

    // Today change
    ctx.font = '13px system-ui'
    ctx.fillStyle = '#6B7280'
    ctx.fillText('Today', W / 2 + spacing / 2, row1Y)
    const todayColor = profile.balanceChange24h >= 0 ? '#4ADE80' : '#EF4444'
    ctx.fillStyle = todayColor
    ctx.font = 'bold 28px system-ui'
    ctx.fillText(`${profile.balanceChange24h >= 0 ? '+' : ''}$${Math.abs(profile.balanceChange24h).toFixed(0)}`, W / 2 + spacing / 2, row2Y)

    // Divider
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(W / 2, row1Y - 10)
    ctx.lineTo(W / 2, row2Y + 5)
    ctx.stroke()

    // Divider line
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(80, 440)
    ctx.lineTo(W - 80, 440)
    ctx.stroke()

    // Footer CTA
    ctx.textAlign = 'center'
    ctx.fillStyle = '#6B7280'
    ctx.font = '13px system-ui'
    ctx.fillText('Track your trades', W / 2, 620)
    ctx.fillStyle = '#00E5FF'
    ctx.font = 'bold 15px system-ui'
    ctx.fillText('Join @SMTMBot →', W / 2, 650)

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
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border-2 border-white/20 p-6 relative overflow-hidden">
        {/* Premium Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-teal/20 via-purple-500/10 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-56 h-56 bg-gradient-to-tr from-lime-400/15 via-teal/10 to-transparent rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-teal/5 rounded-full blur-3xl" />
        </div>

        {/* Header with Branding */}
        <div className="relative flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl grid place-items-center text-lg font-bold border border-white/10"
              style={avatarStyle(profile.handle)}
            >
              {profile.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-base font-bold">{profile.name}</h2>
              <div className="text-sm text-white/50">@{profile.handle}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-1024.png"
              alt="SMTM logo"
              className="h-5 w-5 opacity-70 relative top-[1px]"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
            <div className="text-xs font-bold text-white/40 tracking-wider">SMTM</div>
          </div>
        </div>

        {/* Hero PNL - Most Prominent */}
        <div className="relative py-8">
          <div className="text-center">
            {/* Massive PNL */}
            <div className={`whitespace-nowrap text-6xl md:text-7xl font-black leading-none mb-3 ${profile.pnl >= 0 ? 'text-green-400' : 'text-red-500'}`}>
              {profile.pnl >= 0 ? '+' : ''}${Math.abs(profile.pnl).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </div>

            {/* Large Percentage */}
            <div className={`text-2xl font-bold mb-2 ${profile.pnl >= 0 ? 'text-green-400/80' : 'text-red-500/80'}`}>
              {profile.pnl >= 0 ? '+' : ''}{profile.pnlPercent}%
            </div>

            <div className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-8">All-Time P&L</div>

            {/* Secondary Metrics */}
            <div className="flex items-center justify-center gap-8">
              <div className="text-center">
                <div className="text-xs text-white/40 mb-1">Portfolio</div>
                <div className="text-xl font-bold text-white">
                  ${(profile.balance / 1000).toFixed(1)}K
                </div>
              </div>
              <div className="w-px h-12 bg-white/10" />
              <div className="text-center">
                <div className="text-xs text-white/40 mb-1">Today</div>
                <div className={`text-xl font-bold ${profile.balanceChange24h >= 0 ? 'text-green-400' : 'text-red-500'}`}>
                  {profile.balanceChange24h >= 0 ? '+' : ''}${Math.abs(profile.balanceChange24h).toFixed(0)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Simplified: followers and 24h change removed for now */}

        {/* Share Buttons */}
        <div className="relative flex gap-2">
          <button
            onClick={onShareLink}
            className="flex-1 h-11 px-4 rounded-lg border border-white/10 bg-white/[0.03] text-sm font-semibold hover:bg-white/[0.06] transition inline-flex items-center justify-center gap-2"
          >
            <Share2 className="h-4 w-4" />
            {copied ? 'Copied!' : 'Share'}
          </button>
          <button
            onClick={() => setShareModalOpen(true)}
            className="flex-1 h-11 px-4 rounded-lg border border-teal/30 bg-teal/10 text-teal text-sm font-semibold hover:bg-teal/20 transition inline-flex items-center justify-center gap-2"
          >
            <ImageIcon className="h-4 w-4" />
            Image
          </button>
        </div>

        {/* Footer CTA */}
        <div className="relative mt-6 pt-4 border-t border-white/10 text-center">
          <div className="text-xs text-white/40 mb-2">Track your trades</div>
          <a
            href="https://t.me/smtmbot"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-teal hover:text-teal/80 transition"
          >
            Join @SMTMBot →
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

function avatarStyle(seed: string): React.CSSProperties {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  const h2 = (h + 40) % 360
  return {
    background: `linear-gradient(135deg, hsl(${h} 70% 20%), hsl(${h2} 70% 15%))`,
    color: 'white',
  }
}
