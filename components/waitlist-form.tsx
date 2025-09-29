"use client"
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ ok?: boolean; position?: number; error?: string } | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      setResult(data)
    } catch (err) {
      setResult({ error: 'Network error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3">
      <Input
        type="email"
        required
        placeholder="your@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button variant="cta" type="submit" disabled={loading}>
        {loading ? 'Joining…' : 'Join'}
      </Button>
      {result?.ok && (
        <p className="text-sm text-muted mt-2 sm:mt-0 sm:ml-3">Welcome! Your position: #{result.position}</p>
      )}
      {result?.error && (
        <p className="text-sm text-red-400 mt-2 sm:mt-0 sm:ml-3">{result.error}</p>
      )}
    </form>
  )
}
