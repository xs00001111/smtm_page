"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
// Support either ethers v5 or v6 at runtime
let Ethers: any
try { Ethers = require('ethers') } catch { Ethers = null }
import { ClobClient } from '@polymarket/clob-client'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { ensureCsrf, parseInitData } from '../helpers'

type Status = 'idle' | 'linking' | 'unlinking' | 'checking' | 'success' | 'error'

function useCsrf(): string {
  const [token, setToken] = useState('')
  useEffect(() => {
    const t = ensureCsrf(localStorage)
    setToken(t)
  }, [])
  return token
}

export default function ExecLinkPage() {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState<string>('')
  const [address, setAddress] = useState<string>('')
  const [connected, setConnected] = useState<boolean>(false)
  const [showMenu, setShowMenu] = useState<boolean>(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const csrf = useCsrf()
  const initData = useMemo(() => (typeof window !== 'undefined' ? parseInitData(window, window.location.href) : null), [])

  const hasPrivy = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID
  const { login, ready, authenticated } = hasPrivy ? usePrivy() : ({} as any)
  const { wallets } = hasPrivy ? useWallets() : ({ wallets: [] } as any)

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  const connectInjected = useCallback(async () => {
    setMessage('')
    try {
      if (typeof window === 'undefined' || !(window as any).ethereum) {
        setMessage('No browser wallet detected. Install MetaMask or use Telegram + embedded wallet later.')
        return
      }
      // Request accounts via EIP-1193
      const eth = (window as any).ethereum
      await eth.request({ method: 'eth_requestAccounts' })
      let signer: any
      if (Ethers?.providers?.Web3Provider) {
        const provider = new Ethers.providers.Web3Provider(eth, 'any')
        signer = provider.getSigner()
      } else if (Ethers?.BrowserProvider) {
        const provider = new Ethers.BrowserProvider(eth)
        signer = await provider.getSigner()
      } else {
        throw new Error('Unsupported ethers version')
      }
      const addr = await signer.getAddress()
      setAddress(addr)
      setConnected(true)
      setMessage(`Connected: ${addr.slice(0, 6)}…${addr.slice(-4)}`)
    } catch (err: any) {
      setMessage(err?.message || 'Failed to connect')
    }
  }, [])

  const onLink = useCallback(async () => {
    setStatus('linking')
    setMessage('')
    try {
      let signer: any | null = null
      let addr = ''
      // Prefer Privy embedded/external wallet if available
      const privyWallet = wallets && wallets.length > 0 ? wallets[0] : undefined
      if (privyWallet) {
        // getEthersProvider is provided by Privy wallets
        // @ts-ignore
        const p = await privyWallet.getEthersProvider?.()
        if (p) {
          signer = p.getSigner()
          addr = await signer.getAddress()
        }
      }
      if (!signer) {
        if (typeof window === 'undefined' || !(window as any).ethereum) throw new Error('No wallet provider')
        const eth = (window as any).ethereum
        if (Ethers?.providers?.Web3Provider) {
          const provider = new Ethers.providers.Web3Provider(eth, 'any')
          signer = provider.getSigner()
        } else if (Ethers?.BrowserProvider) {
          const provider = new Ethers.BrowserProvider(eth)
          signer = await provider.getSigner()
        } else {
          throw new Error('Unsupported ethers version')
        }
        addr = await signer.getAddress()
      }

      const host = process.env.NEXT_PUBLIC_POLYMARKET_CLOB_HOST || 'https://clob.polymarket.com'
      // signatureType: 0 = browser wallet; 1 = Magic/email
      // signatureType: 0 = browser wallet; 1 = Magic/email. Privy uses browser-like signer.
      const client = new ClobClient(host, 137, signer as any, undefined, 0, addr)
      const creds = await client.createOrDeriveApiKey()

      // POST creds to our backend for secure storage
      const res = await fetch('/api/exec/link', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf': csrf },
        body: JSON.stringify({ initData, clob: creds, scope: 'trade' }),
      })
      if (!res.ok) throw new Error(`Link failed: ${res.status}`)
      setStatus('success')
      setMessage('Trading enabled. Credentials stored securely.')
    } catch (err: any) {
      setStatus('error')
      setMessage(err?.message || 'Link failed')
    }
  }, [csrf, initData])

  const onUnlink = useCallback(async () => {
    setStatus('unlinking')
    setMessage('')
    try {
      const res = await fetch('/api/exec/unlink', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf': csrf },
        body: JSON.stringify({ initData }),
      })
      if (!res.ok) throw new Error(`Unlink failed: ${res.status}`)
      setStatus('success')
      setMessage('Unlinked successfully.')
    } catch (err: any) {
      setStatus('error')
      setMessage(err?.message || 'Unlink failed')
    }
  }, [csrf, initData])

  const onStatus = useCallback(async () => {
    setStatus('checking')
    setMessage('')
    try {
      const url = new URL('/api/exec/status', window.location.origin)
      if (initData) url.searchParams.set('initData', initData)
      const res = await fetch(url.toString(), { headers: { 'x-csrf': csrf } })
      if (!res.ok) throw new Error(`Status failed: ${res.status}`)
      const data = await res.json()
      setStatus('success')
      setMessage(`Status: ${data?.status ?? 'Unknown'}`)
    } catch (err: any) {
      setStatus('error')
      setMessage(err?.message || 'Status check failed')
    }
  }, [csrf, initData])

  return (
    <main className="mx-auto max-w-2xl px-6 py-10 space-y-8">
      <section className="space-y-2">
        <h1 className="text-2xl font-bold">SMTM Link Portal</h1>
        <p className="text-sm text-white/70">Connect your wallet, then enable trading. We derive Polymarket CLOB credentials via a one-time wallet signature and store them securely. You can revoke anytime.</p>
      </section>

      <section className="space-y-8">
        <div className="space-y-2">
          <div className="text-sm font-medium">Step 1 — Connect a Wallet</div>
          <div className="text-sm text-white/70">Use an embedded wallet (Privy) or a browser wallet. Works the same on web or Telegram.</div>
          <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center sm:justify-start">
            {process.env.NEXT_PUBLIC_PRIVY_APP_ID ? (
              <Button className="w-full sm:w-auto" onClick={() => login()} variant="outline" disabled={!ready || authenticated}>Sign in (embedded wallet)</Button>
            ) : null}
            <Button className="w-full sm:w-auto" onClick={connectInjected} variant="outline">Connect Wallet</Button>
          </div>
          {address ? <p className="text-teal text-sm">Connected {address.slice(0,6)}…{address.slice(-4)}</p> : null}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Step 2 — Enable Trading</div>
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-2 hover:bg-white/10 rounded-md transition-colors"
                aria-label="More options"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className="text-white/70">
                  <circle cx="8" cy="3" r="1.5" />
                  <circle cx="8" cy="8" r="1.5" />
                  <circle cx="8" cy="13" r="1.5" />
                </svg>
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-1 w-48 bg-zinc-900 border border-white/10 rounded-md shadow-lg z-10">
                  <button
                    onClick={() => {
                      onUnlink()
                      setShowMenu(false)
                    }}
                    disabled={status === 'unlinking'}
                    className="w-full text-left px-4 py-2 text-sm text-white/70 hover:bg-white/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-md"
                  >
                    {status === 'unlinking' ? 'Unlinking…' : 'Unlink & Revoke Access'}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="text-xs text-white/60">We'll request a one-time wallet signature to derive credentials and store them securely for execution and account features.</div>
          <div className="flex flex-col sm:flex-row gap-2 pt-2 justify-center sm:justify-start">
            <Button className="w-full sm:w-auto" onClick={onLink} disabled={!connected || status === 'linking'} variant="cta">{status === 'linking' ? 'Enabling…' : 'Enable'}</Button>
            <Button className="w-full sm:w-auto" onClick={onStatus} disabled={status === 'checking'}>{status === 'checking' ? 'Checking…' : 'Status'}</Button>
          </div>
          {message ? <p className={status === 'error' ? 'text-red-400' : 'text-teal'}>{message}</p> : null}
        </div>
      </section>

      <section className="text-xs text-white/50">
        <p>Notes:</p>
        <ul className="list-disc pl-5 space-y-1 mt-1">
          <li>One-time signature derives API credentials; we never see your private key.</li>
          <li>Credentials are sent over HTTPS and stored encrypted. Never logged.</li>
          <li>Revoking removes stored credentials and disables execution.</li>
        </ul>
      </section>
    </main>
  )
}
