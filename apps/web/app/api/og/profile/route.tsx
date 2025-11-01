import { ImageResponse } from 'next/og'

export const runtime = 'edge'

function parseMoneyToNumber(input: string | null): number {
  if (!input) return 0
  const cleaned = input.replace(/[$,+\s]/g, '')
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

  const pnlValue = pnlParam != null
    ? parseMoneyToNumber(pnlParam)
    : parseMoneyToNumber(realized) + parseMoneyToNumber(unrealized)

  const pnlText = formatCurrency(pnlValue)
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
          alignItems: 'center',
          justifyContent: 'center',
          background: bg,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system',
        }}
      >
        <div style={{ fontSize: 220, fontWeight: 800, color }}>{pnlText}</div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
