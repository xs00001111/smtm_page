"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ethers } from 'ethers'
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
  const csrf = useCsrf()
  const initData = useMemo(() => (typeof window !== 'undefined' ? parseInitData(window, window.location.href) : null), [])

  const { login, ready, authenticated } = usePrivy()
  const { wallets } = useWallets()

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
      const provider = new ethers.providers.Web3Provider(eth, 'any')
      const signer = provider.getSigner()
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
      let signer: ethers.Signer | null = null
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
        const provider = new ethers.providers.Web3Provider(eth, 'any')
        signer = provider.getSigner()
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

      <section className="rounded-lg border border-white/10 p-5 space-y-4 bg-black/20">
        <div className="text-sm font-medium">Step 1 — Verify Identity</div>
        <div className="text-sm text-white/70">If you opened this inside Telegram, we detect your Telegram proof automatically. Otherwise, connect a browser wallet.</div>
        <div className="flex gap-2 pt-2">
          {process.env.NEXT_PUBLIC_PRIVY_APP_ID ? (
            <Button onClick={() => login()} variant="outline" disabled={!ready || authenticated}>Sign in with Privy</Button>
          ) : null}
          <Button onClick={connectInjected} variant="outline">Connect Wallet (MetaMask/Coinbase)</Button>
        </div>
        {address ? <p className="text-teal text-sm">Connected {address.slice(0,6)}…{address.slice(-4)}</p> : null}
        {initData ? <p className="text-teal text-sm">Telegram proof detected</p> : <p className="text-amber-300 text-sm">No Telegram proof found (ok when testing)</p>}
      </section>

      <section className="rounded-lg border border-white/10 p-5 space-y-4 bg-black/20">
        <div className="text-sm font-medium">Step 2 — Enable Trading (trade-only)</div>
        <div className="text-xs text-white/60">We’ll request a one-time wallet signature to derive Polymarket API credentials and store them server-side.</div>
        <div className="flex gap-2 pt-2">
          <Button onClick={onLink} disabled={!connected || status === 'linking'} variant="cta">{status === 'linking' ? 'Enabling…' : 'Enable Trading'}</Button>
          <Button onClick={onUnlink} disabled={status === 'unlinking'} variant="outline">{status === 'unlinking' ? 'Unlinking…' : 'Unlink'}</Button>
          <Button onClick={onStatus} disabled={status === 'checking'}>{status === 'checking' ? 'Checking…' : 'Status'}</Button>
        </div>
        {message ? <p className={status === 'error' ? 'text-red-400' : 'text-teal'}>{message}</p> : null}
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
