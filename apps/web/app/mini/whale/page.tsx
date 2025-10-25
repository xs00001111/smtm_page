import type { Metadata } from 'next'
import { CopyButton } from '@/components/copy-button'
import { WhaleShareButton } from '@/components/whale-share-card'

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { ...init, next: { revalidate: 120 } })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

type WhaleCommands = {
  ok: boolean
  market?: { conditionId: string; question: string; slug: string | null }
  commands?: { whale: string; subscribe: string }
  whales?: { address: string; balance: number; follow: string }[]
}

export const metadata: Metadata = {
  title: 'Whale Share · SMTM',
  description: 'Create and share a whale card that others can follow in Telegram.',
}

export default async function MiniWhalePage({ searchParams }: { searchParams?: { [key: string]: string | string[] | undefined } }) {
  const address = typeof searchParams?.address === 'string' ? searchParams!.address : ''
  const marketQuery = typeof searchParams?.market === 'string' ? searchParams!.market : ''
  const titleParam = typeof searchParams?.title === 'string' ? searchParams!.title : ''

  let question = titleParam
  let followCmd = ''
  let conditionId = ''

  if (marketQuery) {
    const url = `/api/whales/commands?market=${encodeURIComponent(marketQuery)}`
    const data = await fetchJson<WhaleCommands>(url)
    if (data?.ok && data.market) {
      conditionId = data.market.conditionId
      question = question || data.market.question
      if (address) {
        followCmd = `/follow ${address} ${conditionId}`
      } else if (data.whales && data.whales.length > 0) {
        followCmd = data.whales[0].follow
      }
    }
  } else {
    // If only title provided, build a follow with title
    if (address && titleParam) followCmd = `/follow ${address} ${titleParam}`
  }

  return (
    <main className="relative mx-auto max-w-xl px-4 py-8">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_rgba(0,229,255,0.08),transparent_60%)]" />
      <h1 className="text-2xl font-extrabold mb-2">Whale Card</h1>
      <p className="text-white/80 text-sm mb-4">Share this whale so others can follow in Telegram.</p>

      <section className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <div className="text-sm text-white/70">Wallet</div>
        <div className="mt-1 text-xl font-semibold break-all">{address || '—'}</div>
        {question && (
          <div className="mt-3 text-sm">
            <div className="text-white/70 mb-1">Market</div>
            <div className="font-medium">{question}</div>
          </div>
        )}

        <div className="mt-4 flex gap-2 flex-wrap">
          {followCmd ? (
            <CopyButton text={followCmd} label="Copy Follow" />
          ) : (
            <div className="text-xs text-white/60">Add <span className="font-mono">?market=&lt;id or search&gt;</span> or <span className="font-mono">?title=&lt;question&gt;</span> to build a follow command.</div>
          )}
          {address && (
            <CopyButton text={address} label="Copy Address" />
          )}
        </div>

        <div className="mt-4 flex gap-2 flex-wrap">
          {address && (
            <WhaleShareButton address={address} marketTitle={question} theme="dark" label="Share (Dark)" />
          )}
          {address && (
            <WhaleShareButton address={address} marketTitle={question} theme="light" label="Share (Light)" />
          )}
          {address && (
            <a
              href={`https://polymarket.com/user/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-white/15 bg-white/[0.06] px-3 py-2 text-sm hover:bg-white/[0.1]"
            >View on Polymarket</a>
          )}
        </div>
      </section>

      <section className="mt-6 text-xs text-white/60">
        <div>Mini App usage:</div>
        <div className="mt-1">Use this URL as the Mini App link in @BotFather:</div>
        <div className="font-mono break-all bg-white/[0.04] border border-white/10 rounded p-2 mt-1">
          {`https://your-domain/mini/whale?address=0x...&market=0x...`}
        </div>
        <div className="mt-2">Parameters:</div>
        <ul className="list-disc list-inside">
          <li><span className="font-mono">address</span> — EVM wallet to share</li>
          <li><span className="font-mono">market</span> — condition id or search text (optional)</li>
          <li><span className="font-mono">title</span> — market question (optional fallback)</li>
        </ul>
      </section>
    </main>
  )
}

