"use client"
import { useState } from 'react'

export function CopyButton({ text, label = 'Copy', className = '' }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  async function onCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {}
  }
  return (
    <button onClick={onCopy} className={`rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 text-sm hover:bg-white/[0.1] ${className}`}>
      {copied ? 'Copied!' : label}
    </button>
  )
}

