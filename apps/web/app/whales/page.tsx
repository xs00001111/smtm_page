import type { Metadata } from 'next'
import { CopyButton } from '@/components/copy-button'
import { WhaleShareButton } from '@/components/whale-share-card'

type GammaMarket = {
  condition_id: string
  question: string
  volume_24hr?: string
}

type HoldersResponse = {
  token: string
  holders: { address: string; balance: string }[]
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    // Revalidate periodically so the list stays fresh
    next: { revalidate: 180 },
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  if (!res.ok) throw new Error(`Request failed ${res.status}`)
  return res.json() as Promise<T>
}

async function getTrendingMarkets(limit = 10): Promise<GammaMarket[]> {
  const url = `https://gamma-api.polymarket.com/markets?active=true&limit=${limit}&order=volume&ascending=false`
  return fetchJson<GammaMarket[]>(url)
}

async function getTopHolders(conditionId: string, limit = 40, minBalance = 500): Promise<HoldersResponse[]> {
  const url = `https://data-api.polymarket.com/holders?market=${conditionId}&limit=${limit}&minBalance=${minBalance}`
  return fetchJson<HoldersResponse[]>(url)
}

async function getUserValue(address: string): Promise<{ user: string; value: string }> {
  const url = `https://data-api.polymarket.com/value?user=${address}`
  return fetchJson<{ user: string; value: string }>(url)
}

function formatAddress(address: string, chars = 4) {
  if (!address || address.length < chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

function formatUsd(numStr?: string | number) {
  const n = typeof numStr === 'number' ? numStr : parseFloat(numStr || '0')
  if (isNaN(n)) return '$0'
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(0)}`
}

async function getRecentWhales() {
  // 1) Find trending markets by 24h volume
  const markets = await getTrendingMarkets(8)

  // 2) For each market, fetch top holders and collect addresses
  const holderLists = await Promise.all(
    markets.map((m) => getTopHolders(m.condition_id, 40, 250))
  )

  const addresses = new Set<string>()
  holderLists.forEach((hr) => {
    hr.forEach((t) => t.holders.forEach((h) => addresses.add(h.address.toLowerCase())))
  })

  const list = Array.from(addresses).slice(0, 60)

  // 3) Fetch portfolio value for each address
  const values = await Promise.all(
    list.map(async (addr) => {
      try {
        const value = await getUserValue(addr)
        const v = parseFloat(value.value || '0')
        return { address: addr, value: isNaN(v) ? 0 : v }
      } catch {
        return { address: addr, value: 0 }
      }
    })
  )

  // 4) Rank by value and keep top
  return values
    .filter((v) => v.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 24)
}

export const metadata: Metadata = {
  title: 'Whales · SMTM',
  description: 'Recent active Polymarket wallets discovered from trending markets and top holders.',
}

export default async function WhalesPage({ searchParams }: { searchParams?: { [key: string]: string | string[] | undefined } }) {
  const q = typeof searchParams?.market === 'string' ? searchParams!.market : ''
  let whales = await getRecentWhales()
  let marketData: null | {
    conditionId: string
    question: string
    slug: string | null
  } = null
  let commandItems: Array<{ address: string; balance: number; follow: string }> | null = null

  if (q) {
    try {
      const url = `${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/whales/commands?market=${encodeURIComponent(q)}`
      const res = await fetch(url.startsWith('http') ? url : `/api/whales/commands?market=${encodeURIComponent(q)}`, { next: { revalidate: 180 } })
      if (res.ok) {
        const data = await res.json()
        if (data?.ok) {
          marketData = {
            conditionId: data.market.conditionId,
            question: data.market.question,
            slug: data.market.slug,
          }
          commandItems = (data.whales || []).map((w: any) => ({ address: w.address, balance: parseFloat(w.balance || w.score || 0), follow: w.follow }))
        }
      }
    } catch {}
  }

  return (
    <main className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(0,229,255,0.08),transparent_60%)]" />

      <header className="mb-8">
        <div className="text-xs tracking-[0.2em] text-white/70 uppercase">Discovery</div>
        <h1 className="mt-2 text-3xl md:text-4xl font-extrabold tracking-tight">Recent Polymarket Whales</h1>
        <p className="mt-2 text-white/80 max-w-2xl">Active wallets from holders of trending markets. For a specific market, search below to get follow-ready commands.</p>
        <form method="get" action="/whales" className="mt-4 flex gap-2 max-w-xl">
          <input name="market" defaultValue={q} placeholder="Search market (slug, question, or condition id)" className="flex-1 rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 text-sm" />
          <button className="rounded-md border border-teal/60 text-teal px-3 py-2 text-sm hover:bg-teal/10">Search</button>
        </form>
        <div className="mt-2 text-xs text-white/60">
          API: {q ? <a className="underline" href={`/api/whales/commands?market=${encodeURIComponent(q)}`}>/api/whales/commands?market=…</a> : <a className="underline" href="/api/whales">/api/whales</a>}
        </div>
      </header>

      <section>
        {commandItems && marketData ? (
          <>
            <h2 className="text-xl font-bold mb-3">{marketData.question}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {commandItems.map((w) => (
                <div key={w.address} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-white/70">Wallet</div>
                    <div className="text-xs text-white/60">Balance</div>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <a href={`https://polymarket.com/user/${w.address}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-lg hover:underline">{formatAddress(w.address, 6)}</a>
                    <div className="font-bold text-teal text-xl">{formatUsd(w.balance)}</div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <CopyButton text={w.follow} label="Copy Follow" />
                    <WhaleShareButton address={w.address} label="Share" marketTitle={marketData.question} theme="dark" />
                    <WhaleShareButton address={w.address} label="Share Light" marketTitle={marketData.question} theme="light" />
                  </div>
                </div>
              ))}
            </div>
            {commandItems.length === 0 && (
              <div className="text-white/70 text-sm">No whales found for this market. Try another query.</div>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {whales.map((w) => (
                <div key={w.address} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-white/70">Wallet</div>
                    <div className="text-xs text-white/60">Score</div>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <a href={`https://polymarket.com/user/${w.address}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-lg hover:underline">{formatAddress(w.address, 6)}</a>
                    <div className="font-bold text-teal text-xl">{formatUsd(w.value)}</div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <CopyButton text={w.address} label="Copy Address" />
                    <WhaleShareButton address={w.address} label="Share" theme="dark" />
                  </div>
                </div>
              ))}
            </div>
            {whales.length === 0 && (
              <div className="text-white/70 text-sm">No recent whales found. Try again shortly.</div>
            )}
          </>
        )}
      </section>
    </main>
  )
}
export const runtime = 'edge'
