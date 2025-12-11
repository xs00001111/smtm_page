'use client'

import React from 'react'

export function BackToTopMobile() {
  const [show, setShow] = React.useState(false)
  const lastRef = React.useRef(0)

  React.useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0
      const last = lastRef.current
      lastRef.current = y
      if (y > 400 && y < document.body.scrollHeight - window.innerHeight - 20) setShow(true)
      else if (y < 200) setShow(false)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const vibe = (ms = 10) => { try { (navigator as any)?.vibrate?.(ms) } catch {} }

  if (!show) return null

  return (
    <button
      onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); vibe(8) }}
      className="sm:hidden fixed bottom-20 right-3 z-40 h-10 w-10 rounded-full border border-white/15 bg-white/[0.06] backdrop-blur text-white/80 shadow-[0_0_18px_rgba(0,0,0,0.4)]"
      aria-label="Back to top"
    >
      ↑
    </button>
  )
}
