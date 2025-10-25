"use client"
import { useEffect, useRef, useState } from 'react'

function roundRect(ctx: CanvasRenderingContext2D, x:number, y:number, w:number, h:number, r:number){
  if (w < 2 * r) r = w / 2; if (h < 2 * r) r = h / 2
  ctx.beginPath()
  ctx.moveTo(x+r, y)
  ctx.arcTo(x+w, y, x+w, y+h, r)
  ctx.arcTo(x+w, y+h, x, y+h, r)
  ctx.arcTo(x, y+h, x, y, r)
  ctx.arcTo(x, y, x+w, y, r)
  ctx.closePath()
}

async function fetchValue(address: string): Promise<number | null> {
  try {
    const res = await fetch(`https://data-api.polymarket.com/value?user=${address}`)
    if (!res.ok) return null
    const json = await res.json()
    const v = parseFloat(json?.value || '0')
    return isNaN(v) ? null : v
  } catch {
    return null
  }
}

type Theme = 'dark' | 'light'

export function WhaleShareButton({ address, label, theme='dark', marketTitle }: { address: string; label?: string; theme?: Theme; marketTitle?: string }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<number | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!open) return
    (async () => {
      const v = await fetchValue(address)
      setValue(v)
    })()
  }, [open, address])

  useEffect(() => {
    if (!open) return
    const c = canvasRef.current
    if (!c) return
    const W = 640, H = 360
    c.width = W; c.height = H
    const ctx = c.getContext('2d')!

    // background by theme
    if (theme === 'light') {
      const g = ctx.createLinearGradient(0, 0, W, H)
      g.addColorStop(0, '#F8FBFF'); g.addColorStop(1, '#F6FFF0')
      ctx.fillStyle = g
    } else {
      const g = ctx.createLinearGradient(0, 0, W, H)
      g.addColorStop(0, '#06131A'); g.addColorStop(1, '#0F1A06')
      ctx.fillStyle = g
    }
    ctx.fillRect(0,0,W,H)

    // header
    ctx.fillStyle = theme === 'light' ? '#111827' : '#E5E7EB'
    ctx.font = '700 20px system-ui'
    ctx.fillText('SMTM • Whale Snapshot', 20, 34)

    // wallet
    ctx.fillStyle = theme === 'light' ? '#0F172A' : '#FFFFFF'
    ctx.font = '700 24px system-ui'
    const short = address.slice(0, 6) + '...' + address.slice(-4)
    ctx.fillText(short, 20, 72)

    // market title (optional)
    if (marketTitle) {
      ctx.fillStyle = theme === 'light' ? '#374151' : '#9CA3AF'
      ctx.font = '600 16px system-ui'
      const title = marketTitle.length > 58 ? marketTitle.slice(0,55) + '…' : marketTitle
      ctx.fillText(title, 20, 96)
    }

    // metrics boxes
    const box = (x:number,y:number,w:number,h:number,label:string,valueStr:string,color='#00E5FF')=>{
      ctx.save()
      ctx.fillStyle = theme === 'light' ? 'rgba(15,23,42,0.04)' : 'rgba(255,255,255,0.06)'
      ctx.strokeStyle = theme === 'light' ? '#E5E7EB' : '#1F2937'
      ctx.lineWidth = 1
      roundRect(ctx, x,y,w,h,12)
      ctx.fill(); ctx.stroke()
      ctx.fillStyle = theme === 'light' ? '#4B5563' : '#9CA3AF'
      ctx.font = '600 14px system-ui'
      ctx.fillText(label, x+14, y+28)
      ctx.fillStyle = color
      ctx.font = '700 26px system-ui'
      ctx.fillText(valueStr, x+14, y+60)
      ctx.restore()
    }

    const valueStr = value != null ? `$${value.toFixed(0)}` : '—'
    box(20, 110, 260, 84, 'Portfolio Value', valueStr)
    box(300, 110, 260, 84, 'Address', short)

    // footer
    ctx.fillStyle = theme === 'light' ? '#6B7280' : '#9CA3AF'
    ctx.font = '14px system-ui'
    ctx.fillText('Share to discuss whether to follow.', 20, H-48)
    ctx.fillText('smtm.ai', 20, H-24)
  }, [open, address, value, theme, marketTitle])

  async function copyPng() {
    const c = canvasRef.current; if (!c) return
    const blob: Blob | null = await new Promise(resolve => c.toBlob(b => resolve(b), 'image/png'))
    if (blob && 'clipboard' in navigator && 'ClipboardItem' in window) {
      try {
        // @ts-ignore
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })])
        return
      } catch {}
    }
    const url = c.toDataURL('image/png'); const a = document.createElement('a'); a.href = url; a.download = 'smtm-whale.png'; a.click()
  }

  return (
    <>
      <button onClick={()=>setOpen(true)} className="rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 text-sm hover:bg-white/[0.1]">
        {label || 'Share'}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={()=>setOpen(false)}>
          <div className="bg-[#0F0F0F] border border-white/10 rounded-xl p-4" onClick={(e)=>e.stopPropagation()}>
            <canvas ref={canvasRef} className="block rounded-md border border-white/10" />
            <div className="mt-3 flex gap-2 justify-end">
              <button onClick={()=>setOpen(false)} className="rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 text-sm hover:bg-white/[0.1]">Close</button>
              <button onClick={copyPng} className="rounded-md border border-teal/50 text-teal px-3 py-2 text-sm hover:bg-teal/10">Copy Image</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
