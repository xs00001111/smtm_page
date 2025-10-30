import { ImageResponse } from 'next/og'

export const runtime = 'edge'

function fmtMoney(n: string | number | undefined) {
  const num = typeof n === 'string' ? parseFloat(n) : (n ?? 0)
  if (!Number.isFinite(num)) return '$0'
  return `$${Math.round(num).toLocaleString()}`
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address') || '0x0000...0000'
  const title = searchParams.get('title') || 'Polymarket Profile'
  const value = searchParams.get('value') || '0'
  const realized = searchParams.get('realized') || '0'
  const unrealized = searchParams.get('unrealized') || '0'
  const roi = searchParams.get('roi') || '—'
  const rank = searchParams.get('rank') || ''
  const pnlLb = searchParams.get('pnlLb') || ''

  const bg = '#0b1220'
  const fg = '#e6faff'
  const teal = '#00E5FF'
  const muted = '#9fb3c8'

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
        <div style={{ fontSize: 36, opacity: 0.9 }}>{title}</div>
        <div style={{ fontSize: 24, color: muted, marginTop: 8 }}>{address}</div>

        <div style={{ display: 'flex', gap: 24, marginTop: 40 }}>
          <div style={{ background: '#0f172a', padding: 24, borderRadius: 16, width: 340 }}>
            <div style={{ fontSize: 18, color: muted }}>Portfolio Value</div>
            <div style={{ fontSize: 38, color: teal }}>{fmtMoney(value)}</div>
          </div>
          <div style={{ background: '#0f172a', padding: 24, borderRadius: 16, width: 340 }}>
            <div style={{ fontSize: 18, color: muted }}>Unrealized PnL</div>
            <div style={{ fontSize: 38 }}>{unrealized}</div>
            <div style={{ fontSize: 18, color: muted, marginTop: 6 }}>ROI {roi}</div>
          </div>
          <div style={{ background: '#0f172a', padding: 24, borderRadius: 16, width: 340 }}>
            <div style={{ fontSize: 18, color: muted }}>Realized PnL</div>
            <div style={{ fontSize: 38 }}>{realized}</div>
          </div>
        </div>

        {(rank || pnlLb) && (
          <div style={{ marginTop: 28, fontSize: 20, color: muted }}>
            {rank ? `Rank ${rank}` : ''} {pnlLb ? `• Leaderboard PnL ${pnlLb}` : ''}
          </div>
        )}

        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ fontSize: 24, opacity: 0.8 }}>smtm.ai</div>
          <div style={{ fontSize: 18, color: muted }}>Share your profile instantly</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}

