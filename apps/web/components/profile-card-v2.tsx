"use client"

import { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { CheckCircle2, Link2, Shield, Share2, Download, Image as ImageIcon, ChevronDown } from 'lucide-react'

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
  const [activeTab, setActiveTab] = useState<'stats' | 'activity' | 'badges'>('stats')
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
    const glowGrad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, 400)
    glowGrad.addColorStop(0, 'rgba(0,229,255,0.15)')
    glowGrad.addColorStop(1, 'transparent')
    ctx.fillStyle = glowGrad
    ctx.fillRect(0, 0, W, H)

    // Header
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 36px system-ui'
    ctx.fillText(profile.name, 50, 60)

    ctx.fillStyle = '#9CA3AF'
    ctx.font = '20px system-ui'
    ctx.fillText(`@${profile.handle}`, 50, 95)

    // Hero Metrics - Centered
    const centerY = H / 2

    // Tips Earned (HERO)
    ctx.fillStyle = '#00E5FF'
    ctx.font = 'bold 120px system-ui'
    ctx.textAlign = 'center'
    ctx.fillText(`$${profile.stats.tips}`, W / 2, centerY - 20)

    ctx.fillStyle = '#6B7280'
    ctx.font = 'bold 20px system-ui'
    ctx.fillText('TIPS EARNED', W / 2, centerY + 30)

    // Accuracy (Secondary)
    ctx.fillStyle = '#B6FF00'
    ctx.font = 'bold 72px system-ui'
    ctx.fillText(`${profile.stats.accuracy}%`, W / 2, centerY + 120)

    ctx.fillStyle = '#6B7280'
    ctx.font = 'bold 16px system-ui'
    ctx.fillText('ACCURACY', W / 2, centerY + 155)

    // Footer stats
    ctx.textAlign = 'start'
    ctx.fillStyle = '#6B7280'
    ctx.font = '16px system-ui'
    ctx.fillText(`${profile.stats.predictions} Predictions • ${profile.stats.followers.toLocaleString()} Followers`, 50, H - 40)
    ctx.fillText('smtm.ai', W - 150, H - 40)

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
    <div className="mx-auto max-w-4xl">
      <div className="rounded-2xl border-2 border-white/20 p-6 md:p-8 relative overflow-hidden">
        {/* Geometric Background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute top-20 right-10 w-64 h-64 bg-teal/5 rounded-full blur-3xl" />
          <div className="absolute bottom-20 left-10 w-48 h-48 bg-purple-500/5 rounded-full blur-2xl" />
          <div className="absolute top-1/2 left-1/4 w-32 h-32 border border-white/5 rotate-45" />
        </div>

        {/* Header */}
        <div className="relative flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <div
              className="w-16 h-16 rounded-xl grid place-items-center text-2xl font-bold border border-white/10"
              style={avatarStyle(profile.handle)}
            >
              {profile.name.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{profile.name}</h2>
                {profile.verified && (
                  <CheckCircle2 className="h-4 w-4 text-teal" />
                )}
              </div>
              <div className="text-sm text-muted">@{profile.handle}</div>
            </div>
          </div>

          <div className="inline-flex items-center rounded-full bg-teal/10 text-teal text-sm px-4 py-2 border border-teal/30 font-semibold">
            Credibility {profile.credibility}
          </div>
        </div>

        {/* Hero Metrics - Center Stage */}
        <div className="relative text-center py-12">
          <div className="mb-2">
            <div className="text-8xl md:text-9xl font-extrabold bg-gradient-to-r from-teal to-lime-400 bg-clip-text text-transparent leading-none">
              ${profile.stats.tips}
            </div>
            <div className="text-sm text-white/40 uppercase tracking-wider mt-4 font-semibold">
              Tips Earned
            </div>
          </div>

          <div className="mt-12 inline-flex items-center gap-8">
            <div>
              <div className="text-5xl font-extrabold text-lime-400">
                {profile.stats.accuracy}%
              </div>
              <div className="text-xs text-white/40 uppercase tracking-wider mt-2">
                Accuracy
              </div>
            </div>
            <div className="h-16 w-px bg-white/10" />
            <div>
              <div className="text-5xl font-extrabold text-white/90">
                {profile.stats.predictions}
              </div>
              <div className="text-xs text-white/40 uppercase tracking-wider mt-2">
                Predictions
              </div>
            </div>
          </div>
        </div>

        {/* Share Buttons */}
        <div className="relative flex gap-2 mb-8">
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

        {/* Tabs */}
        <div className="relative border-t border-white/10 pt-6">
          <div className="flex gap-6 mb-6 text-sm">
            <button
              onClick={() => setActiveTab('stats')}
              className={`pb-2 border-b-2 transition ${
                activeTab === 'stats' ? 'border-teal text-teal' : 'border-transparent text-white/60 hover:text-white/80'
              }`}
            >
              Stats
            </button>
            <button
              onClick={() => setActiveTab('activity')}
              className={`pb-2 border-b-2 transition ${
                activeTab === 'activity' ? 'border-teal text-teal' : 'border-transparent text-white/60 hover:text-white/80'
              }`}
            >
              Activity
            </button>
            <button
              onClick={() => setActiveTab('badges')}
              className={`pb-2 border-b-2 transition ${
                activeTab === 'badges' ? 'border-teal text-teal' : 'border-transparent text-white/60 hover:text-white/80'
              }`}
            >
              Badges
            </button>
          </div>

          {activeTab === 'stats' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SecondaryMetric label="Followers" value={profile.stats.followers.toLocaleString()} />
              <SecondaryMetric label="Following" value={profile.stats.following.toString()} />
              <SecondaryMetric label="Open" value={profile.stats.openPositions.toString()} />
              <SecondaryMetric label="Resolved" value={profile.stats.resolved.toString()} />
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-3 text-sm">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-white/60">
                Recent activity will appear here
              </div>
            </div>
          )}

          {activeTab === 'badges' && (
            <div className="flex flex-wrap gap-2">
              {profile.badges.map((badge, i) => (
                <span
                  key={i}
                  className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm"
                >
                  {badge}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="relative mt-6 pt-6 border-t border-white/10 text-center text-xs text-muted">
          Track predictions with{' '}
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

function SecondaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-center">
      <div className="text-lg font-bold text-white/90">{value}</div>
      <div className="text-xs text-white/40 uppercase">{label}</div>
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
