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

    // Header
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 32px system-ui'
    ctx.fillText(profile.name, 50, 60)

    ctx.fillStyle = '#9CA3AF'
    ctx.font = '18px system-ui'
    ctx.fillText(`@${profile.handle}`, 50, 90)

    // Balance (HERO)
    ctx.fillStyle = '#00E5FF'
    ctx.font = 'bold 110px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(`$${profile.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, W / 2, 230)

    ctx.fillStyle = '#6B7280'
    ctx.font = 'bold 18px system-ui'
    ctx.fillText('BALANCE', W / 2, 270)

    // PNL (Secondary)
    const pnlColor = profile.pnl >= 0 ? '#B6FF00' : '#FF4444'
    ctx.fillStyle = pnlColor
    ctx.font = 'bold 80px system-ui'
    const pnlText = `${profile.pnl >= 0 ? '+' : ''}${profile.pnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    ctx.fillText(pnlText, W / 2, 380)

    ctx.fillStyle = pnlColor
    ctx.font = 'bold 36px system-ui'
    ctx.fillText(`(${profile.pnl >= 0 ? '+' : ''}${profile.pnlPercent}%)`, W / 2, 430)

    ctx.fillStyle = '#6B7280'
    ctx.font = 'bold 16px system-ui'
    ctx.fillText('PNL', W / 2, 465)

    // Followers
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 48px system-ui'
    ctx.fillText(profile.followers.toLocaleString(), W / 2, 555)

    ctx.fillStyle = '#6B7280'
    ctx.font = 'bold 16px system-ui'
    ctx.fillText('FOLLOWERS', W / 2, 590)

    // Footer
    ctx.fillStyle = '#6B7280'
    ctx.font = '16px system-ui'
    ctx.fillText('smtm.ai', W / 2, H - 40)

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
        {/* Subtle Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-10 right-5 w-48 h-48 bg-teal/5 rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-5 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl" />
        </div>

        {/* Header */}
        <div className="relative flex items-center gap-3 mb-8">
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

        {/* Balance & PNL - Most Prominent */}
        <div className="relative text-center py-8 space-y-6">
          {/* Balance */}
          <div>
            <div className="text-6xl font-extrabold bg-gradient-to-r from-teal to-lime-400 bg-clip-text text-transparent leading-none">
              ${profile.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-white/40 uppercase tracking-wider mt-2">
              Balance
            </div>
          </div>

          {/* PNL */}
          <div>
            <div className={`text-5xl font-extrabold leading-none ${profile.pnl >= 0 ? 'text-lime-400' : 'text-red-400'}`}>
              {profile.pnl >= 0 ? '+' : ''}{profile.pnl.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className={`text-2xl font-bold mt-1 ${profile.pnl >= 0 ? 'text-lime-400/70' : 'text-red-400/70'}`}>
              ({profile.pnl >= 0 ? '+' : ''}{profile.pnlPercent}%)
            </div>
            <div className="text-xs text-white/40 uppercase tracking-wider mt-2">
              PNL
            </div>
          </div>
        </div>

        {/* Follower Count */}
        <div className="relative text-center py-4 border-t border-white/10">
          <div className="text-3xl font-bold text-white/90">
            {profile.followers.toLocaleString()}
          </div>
          <div className="text-xs text-white/40 uppercase tracking-wider mt-1">
            Followers
          </div>
        </div>

        {/* Share Buttons */}
        <div className="relative flex gap-2 mt-6">
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
