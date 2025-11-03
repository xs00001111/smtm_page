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
  const bg = '#000000'
  const positive = pnlValue > 0
  const negative = pnlValue < 0
  const color = positive ? '#22c55e' : negative ? '#ef4444' : '#9fb3c8'

  const short = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`
  const displayName = username || (address ? short(address) : '')
  const roi = searchParams.get('roi') || '—'

  return new ImageResponse(
    (
      <div
        style={{
          height: '630px',
          width: '1200px',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system',
          position: 'relative',
        }}
      >
        {/* Top Section: Username/Address on left, SMTM branding on right */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '60px 80px', position: 'absolute', top: 0, left: 0, right: 0 }}>
          {displayName && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 48, fontWeight: 700, color: '#ffffff', marginBottom: 8 }}>
                {displayName}
              </div>
            </div>
          )}
          <div style={{ fontSize: 32, fontWeight: 700, color: '#666', letterSpacing: 2 }}>
            SMTMPro
          </div>
        </div>

        {/* Main Content - Centered */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', flex: 1, padding: '0 80px' }}>
          {/* Token/Category Label */}
          <div style={{ fontSize: 52, fontWeight: 600, color: '#ffffff', marginBottom: 32 }}>
            Poly
          </div>

          {/* Large PNL in colored box */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: positive ? 'rgba(74, 222, 128, 0.15)' : negative ? 'rgba(239, 68, 68, 0.15)' : 'rgba(159, 179, 200, 0.15)',
            border: `4px solid ${color}`,
            borderRadius: 16,
            padding: '24px 48px',
            marginBottom: 32,
          }}>
            <div style={{ fontSize: 140, fontWeight: 900, color, lineHeight: 1 }}>
              {positive ? '+' : ''}{pnlText}
            </div>
          </div>

          {/* Stats Row */}
          <div style={{ display: 'flex', gap: 64, alignItems: 'center', marginTop: 24 }}>
            {/* PNL Percentage */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 28, color: '#9fb3c8', fontWeight: 500 }}>PNL</div>
              <div style={{ fontSize: 52, fontWeight: 700, color }}>{roi}</div>
            </div>

            {/* Invested */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 28, color: '#9fb3c8', fontWeight: 500 }}>Invested</div>
              <div style={{ fontSize: 52, fontWeight: 700, color: '#ffffff' }}>${invested.toLocaleString()}</div>
            </div>

            {/* Position */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 28, color: '#9fb3c8', fontWeight: 500 }}>Position</div>
              <div style={{ fontSize: 52, fontWeight: 700, color: '#ffffff' }}>${positionValue.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div style={{ position: 'absolute', bottom: 60, left: 80, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#ffffff', letterSpacing: 0.5 }}>
            smtm.ai
          </div>
          <div style={{ fontSize: 22, color: '#9fb3c8', maxWidth: 600 }}>
            Track your prediction market trades
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
