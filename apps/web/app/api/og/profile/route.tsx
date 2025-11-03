import { ImageResponse } from 'next/og'

export const runtime = 'edge'

function parseMoneyToNumber(input: string | null): number {
  if (!input) return 0
  // Normalize various minus dashes to '-'
  const normalized = input.replace(/[−–—]/g, '-')
  // Remove all non-numeric/decimal/minus characters (also strips currency and grouping)
  const cleaned = normalized.replace(/[^0-9.\-]/g, '')
  const num = Number.parseFloat(cleaned)
  return Number.isFinite(num) ? num : 0
}

function formatCurrency(num: number): string {
  const sign = num >= 0 ? '' : '-'
  const abs = Math.abs(num)
  // Show cents only if needed
  const value = abs % 1 === 0 ? abs.toLocaleString() : abs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${sign}$${value}`
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  // Prefer explicit pnl, else sum realized + unrealized
  const pnlParam = searchParams.get('pnl')
  const realized = searchParams.get('realized')
  const unrealized = searchParams.get('unrealized')
  const address = searchParams.get('address')
  const username = searchParams.get('username')
  const title = searchParams.get('title')
  const investedParam = searchParams.get('invested')
  const valueParam = searchParams.get('value')

  const pnlValue = pnlParam != null
    ? parseMoneyToNumber(pnlParam)
    : parseMoneyToNumber(realized) + parseMoneyToNumber(unrealized)

  const pnlText = formatCurrency(pnlValue)
  const invested = parseMoneyToNumber(investedParam)
  const positionValue = parseMoneyToNumber(valueParam)
  const positive = pnlValue > 0
  const negative = pnlValue < 0
  const color = positive ? '#22c55e' : negative ? '#ef4444' : '#9fb3c8'

  const short = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`
  const displayName = username || (address ? short(address) : '')
  const roi = searchParams.get('roi') || '—'

  // Format numbers for display (toLocaleString not supported in Satori)
  const investedDisplay = invested >= 1000
    ? `${Math.round(invested / 100) / 10}K`
    : Math.round(invested).toString()
  const positionDisplay = positionValue >= 1000
    ? `${Math.round(positionValue / 100) / 10}K`
    : Math.round(positionValue).toString()

  const bg = '#0b1220'
  const fg = '#e6faff'
  const muted = '#9fb3c8'
  const pnlFormatted = positive ? `+${pnlText}` : pnlText

  return new ImageResponse(
    (
      <div
        style={{
          height: '630px',
          width: '1200px',
          display: 'flex',
          flexDirection: 'column',
          background: bg,
          color: fg,
          padding: '48px',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system',
        }}
      >
        <div style={{ fontSize: 36, opacity: 0.9 }}>{displayName || 'Profile'}</div>
        <div style={{ fontSize: 24, color: muted, marginTop: 8 }}>Poly</div>

        <div style={{ display: 'flex', gap: 24, marginTop: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column', background: '#0f172a', padding: 24, borderRadius: 16, width: 340 }}>
            <div style={{ fontSize: 18, color: muted }}>PNL</div>
            <div style={{ fontSize: 64, fontWeight: 900, color }}>{pnlFormatted}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', background: '#0f172a', padding: 24, borderRadius: 16, width: 340 }}>
            <div style={{ fontSize: 18, color: muted }}>PNL %</div>
            <div style={{ fontSize: 38 }}>{roi}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, marginTop: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', background: '#0f172a', padding: 24, borderRadius: 16, width: 340 }}>
            <div style={{ fontSize: 18, color: muted }}>Invested</div>
            <div style={{ fontSize: 38 }}>${investedDisplay}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', background: '#0f172a', padding: 24, borderRadius: 16, width: 340 }}>
            <div style={{ fontSize: 18, color: muted }}>Position</div>
            <div style={{ fontSize: 38 }}>${positionDisplay}</div>
          </div>
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ fontSize: 24, opacity: 0.8 }}>smtm.ai</div>
          <div style={{ fontSize: 18, color: muted }}>Track your prediction market trades</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
