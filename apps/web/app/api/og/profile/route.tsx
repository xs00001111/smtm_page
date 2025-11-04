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
  const rankParam = searchParams.get('rank')
  const pnlLbParam = searchParams.get('pnlLb')
  const totalUsersParam = searchParams.get('total')

  // Approximate Polymarket total users for percentile calc; overridable via ?total=
  const totalUsers = (() => {
    const n = totalUsersParam ? Number.parseInt(totalUsersParam, 10) : NaN
    return Number.isFinite(n) && n > 0 ? n : 100_000
  })()
  const rankNum = rankParam ? Number.parseInt(rankParam, 10) : NaN
  // Compute Top X% (smaller is better). Format smartly.
  const topPercentRaw = Number.isFinite(rankNum) && rankNum > 0
    ? (rankNum / totalUsers) * 100
    : null
  const topPercent = topPercentRaw != null
    ? (topPercentRaw < 10 ? Math.round(topPercentRaw * 10) / 10 : Math.round(topPercentRaw))
    : null

  const pnlValue = pnlParam != null
    ? parseMoneyToNumber(pnlParam)
    : parseMoneyToNumber(realized) + parseMoneyToNumber(unrealized)

  const pnlText = formatCurrency(pnlValue)
  const invested = parseMoneyToNumber(investedParam)
  const positionValue = parseMoneyToNumber(valueParam)
  const bg = '#000000'
  const positive = pnlValue > 0
  const negative = pnlValue < 0
  const color = positive ? '#22c55e' : negative ? '#ef4444' : '#9fb3c8'

  return new ImageResponse(
    (
      <div
        style={{
          height: '630px',
          width: '1200px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: bg,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system',
        }}
      >
        {/* Percentile only (no raw rank/total shown) */}
        {topPercent !== null ? (
          <div
            style={{
              position: 'absolute',
              top: 40,
              left: 60,
              color: '#9fb3c8',
              fontSize: 28,
              fontWeight: 600,
              display: 'flex',
            }}
          >
            {`Top ${topPercent}%`}
          </div>
        ) : null}
        {/* Headline row: label + big PNL on one line */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 24 }}>
          <div style={{ fontSize: 64, color: '#9fb3c8', fontWeight: 700, display: 'flex' }}>PNL</div>
          <div style={{ fontSize: 220, fontWeight: 800, color, lineHeight: 1, display: 'flex' }}>{pnlText}</div>
        </div>
        {/* Stats row: ROI, Invested, Position */}
        <div style={{ marginTop: 12, display: 'flex', gap: 48, color: '#9fb3c8' }}>
          <div style={{ fontSize: 28 }}>ROI</div>
          <div style={{ fontSize: 28 }}>{searchParams.get('roi') || '—'}</div>
          <div style={{ fontSize: 28 }}>Invested</div>
          <div style={{ fontSize: 28 }}>{`$${invested.toLocaleString()}`}</div>
          <div style={{ fontSize: 28 }}>Position</div>
          <div style={{ fontSize: 28 }}>{`$${positionValue.toLocaleString()}`}</div>
        </div>
        {/* Username or address */}
        {(username || address) ? (
          <div style={{ position: 'absolute', bottom: 40, left: 60, color: '#ffffff', fontSize: 40, fontWeight: 700, display: 'flex' }}>
            {username || address}
          </div>
        ) : null}
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
