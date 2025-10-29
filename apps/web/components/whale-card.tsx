"use client"

import { useCallback, useEffect, useRef, useState } from 'react'
import { Share2, Download, Image as ImageIcon } from 'lucide-react'

interface WhaleCardProps {
  address: string
  marketId?: string
}

export function WhaleCard({ address, marketId }: WhaleCardProps) {
  // Hardcoded whale data for now - will be replaced with API call based on address
  const whale = {
    name: 'GigaWhale',
    address: address,
    rank: 3,
    pnl: 531751,
    pnlChange24h: 12450,
    pnlChangePercent24h: 2.4,
    volume: 228711,
    volumeChange24h: 18500,
    volumeChangePercent24h: 8.8,
    winRate: 74,
    trades: 142,
  }

  const [copied, setCopied] = useState(false)
  const [followCopied, setFollowCopied] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const onShare = useCallback(async () => {
    try {
      const shareUrl = `${window.location.origin}/mini/whale/${address}${marketId ? `?market=${marketId}` : ''}`
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback
    }
  }, [address, marketId])

  const onCopyFollow = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`/follow ${address}`)
      setFollowCopied(true)
      setTimeout(() => setFollowCopied(false), 1500)
    } catch {
      // Fallback
    }
  }, [address])

  const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`

  // Generate shareable card image (includes logo)
  useEffect(() => {
    if (!shareModalOpen) return
    const canvas = canvasRef.current
    if (!canvas) return

    const W = 800, H = 700
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')!

    // Background
    const bgGrad = ctx.createLinearGradient(0, 0, W, H)
    bgGrad.addColorStop(0, '#0A0F14')
    bgGrad.addColorStop(1, '#0F1A14')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, W, H)

    const glowGrad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, 400)
    glowGrad.addColorStop(0, 'rgba(0,229,255,0.15)')
    glowGrad.addColorStop(1, 'transparent')
    ctx.fillStyle = glowGrad
    ctx.fillRect(0, 0, W, H)

    // Header left: whale + rank
    ctx.textAlign = 'left'
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 24px system-ui'
    ctx.fillText(whale.name || 'Whale Trader', 50, 60)
    ctx.fillStyle = '#9CA3AF'
    ctx.font = '15px system-ui'
    ctx.fillText(`Rank #${whale.rank}  •  ${shortAddress}`, 50, 88)

    // Header right: logo (fallback text)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#6B7280'
    ctx.font = 'bold 16px system-ui'
    ctx.fillText('SMTM', W - 50, 60)
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

    // Center PnL - matching the updated text size
    ctx.textAlign = 'center'
    const pnlColor = whale.pnl >= 0 ? '#4ADE80' : '#EF4444'
    ctx.fillStyle = pnlColor
    ctx.font = 'black 110px system-ui'
    const pnlValue = (Math.abs(whale.pnl) / 1000).toFixed(0)
    ctx.fillText(`${whale.pnl >= 0 ? '+' : ''}$${pnlValue}K`, W / 2, 220)

    ctx.fillStyle = '#6B7280'
    ctx.font = '16px system-ui'
    ctx.fillText('PnL', W / 2, 250)

    // Metrics row - 3 columns
    const row1Y = 310
    const row2Y = 345
    const spacing = 240
    const startX = W / 2 - spacing

    // Volume
    ctx.font = '13px system-ui'
    ctx.fillStyle = '#6B7280'
    ctx.fillText('Volume', startX, row1Y)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 28px system-ui'
    ctx.fillText(`$${(whale.volume / 1000).toFixed(0)}K`, startX, row2Y)

    // Win Rate
    ctx.font = '13px system-ui'
    ctx.fillStyle = '#6B7280'
    ctx.fillText('Win Rate', W / 2, row1Y)
    ctx.fillStyle = '#4ADE80'
    ctx.font = 'bold 28px system-ui'
    ctx.fillText(`${whale.winRate}%`, W / 2, row2Y)

    // Trades
    ctx.font = '13px system-ui'
    ctx.fillStyle = '#6B7280'
    ctx.fillText('Trades', startX + spacing * 2, row1Y)
    ctx.fillStyle = '#FFFFFF'
    ctx.font = 'bold 28px system-ui'
    ctx.fillText(`${whale.trades}`, startX + spacing * 2, row2Y)

    // Dividers
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(startX + spacing / 2, row1Y - 10)
    ctx.lineTo(startX + spacing / 2, row2Y + 5)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(startX + spacing * 1.5, row1Y - 10)
    ctx.lineTo(startX + spacing * 1.5, row2Y + 5)
    ctx.stroke()

    // Divider line
    ctx.strokeStyle = '#374151'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(80, 390)
    ctx.lineTo(W - 80, 390)
    ctx.stroke()

    // 24h change
    ctx.textAlign = 'center'
    ctx.fillStyle = pnlColor
    ctx.font = 'bold 26px system-ui'
    ctx.fillText(`${whale.pnlChange24h >= 0 ? '+' : ''}$${(Math.abs(whale.pnlChange24h) / 1000).toFixed(1)}K (${whale.pnlChange24h >= 0 ? '+' : ''}${whale.pnlChangePercent24h}%) Today`, W / 2, 435)

    // Footer CTA
    ctx.fillStyle = '#6B7280'
    ctx.font = '13px system-ui'
    ctx.fillText('Copy their winning strategy', W / 2, 620)
    ctx.fillStyle = '#00E5FF'
    ctx.font = 'bold 15px system-ui'
    ctx.fillText('Join @SMTMBot →', W / 2, 650)

  }, [shareModalOpen, whale, shortAddress])

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
    a.download = 'smtm-whale.png'
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
        <div className="relative flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="text-3xl">🐋</div>
            <div className="text-xs text-white/40 font-medium">
              Rank #{whale.rank}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Try to render brand logo; if missing, keep text fallback */}
            {/* Using native img to avoid extra deps; small size for header */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-1024.png"
              alt="SMTM logo"
              className="h-5 w-5 opacity-70"
              onError={(e) => {
                // Hide broken image icon, keep text fallback
                (e.currentTarget as HTMLImageElement).style.display = 'none'
              }}
            />
            <div className="text-xs font-bold text-white/40 tracking-wider">SMTM</div>
          </div>
        </div>

        {/* Name & Address */}
        <div className="relative mb-8">
          <h2 className="text-lg font-bold mb-1">{whale.name || 'Whale Trader'}</h2>
          <div className="text-xs text-white/50 font-mono">{shortAddress}</div>
        </div>

        {/* Hero PNL - Most Prominent */}
        <div className="relative py-8">
          <div className="text-center">
            {/* Massive PNL */}
            <div className={`text-6xl md:text-7xl font-black leading-none mb-4 ${whale.pnl >= 0 ? 'text-green-400' : 'text-red-500'}`}>
              {whale.pnl >= 0 ? '+' : ''}${(Math.abs(whale.pnl) / 1000).toFixed(0)}K
            </div>

            <div className="text-sm text-white/40 uppercase tracking-wider mb-8">PnL</div>

            {/* Secondary Metrics Row */}
            <div className="flex items-center justify-center gap-6 mb-8">
              <div className="text-center">
                <div className="text-xs text-white/40 mb-1">Volume</div>
                <div className="text-xl font-bold text-white">
                  ${(whale.volume / 1000).toFixed(0)}K
                </div>
              </div>
              <div className="w-px h-12 bg-white/10" />
              <div className="text-center">
                <div className="text-xs text-white/40 mb-1">Win Rate</div>
                <div className="text-xl font-bold text-green-400">
                  {whale.winRate}%
                </div>
              </div>
              <div className="w-px h-12 bg-white/10" />
              <div className="text-center">
                <div className="text-xs text-white/40 mb-1">Trades</div>
                <div className="text-xl font-bold text-white">
                  {whale.trades}
                </div>
              </div>
            </div>

            {/* 24h Change */}
            <div className={`text-xl font-bold ${whale.pnlChange24h >= 0 ? 'text-green-400' : 'text-red-500'}`}>
              {whale.pnlChange24h >= 0 ? '+' : ''}${(Math.abs(whale.pnlChange24h) / 1000).toFixed(1)}K ({whale.pnlChange24h >= 0 ? '+' : ''}{whale.pnlChangePercent24h}%) Today
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="relative border-t border-white/10 pt-6">
          <div className="flex gap-2 mb-6">
            <button
              onClick={onCopyFollow}
              className="flex-1 h-11 px-4 rounded-lg border border-teal/30 bg-teal/10 text-teal text-sm font-semibold hover:bg-teal/20 transition inline-flex items-center justify-center gap-2"
            >
              {followCopied ? '✓ Copied!' : 'Copy Follow'}
            </button>
            <button
              onClick={onShare}
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
          <div className="text-center pb-2">
            <div className="text-xs text-white/40 mb-2">Copy their winning strategy</div>
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
      </div>
      {/* Share Modal */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setShareModalOpen(false)}>
          <div className="bg-[#0F0F0F] border border-white/10 rounded-xl p-6 max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4">Share Whale Card</h3>
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
