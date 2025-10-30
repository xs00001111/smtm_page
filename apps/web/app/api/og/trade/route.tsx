import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const title = (searchParams.get('title') || 'Trade Receipt').slice(0, 120)
  const side = (searchParams.get('side') || '').toUpperCase()
  const stake = searchParams.get('stake') || '$0'
  const entry = searchParams.get('entry') || '—'
  const exit = searchParams.get('exit') || '—'
  const pnl = searchParams.get('pnl') || '—'
  const roi = searchParams.get('roi') || '—'

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
        <div style={{ fontSize: 24, color: muted, marginTop: 8 }}>Side: {side}</div>

        <div style={{ display: 'flex', gap: 24, marginTop: 40 }}>
          <div style={{ background: '#0f172a', padding: 24, borderRadius: 16, width: 340 }}>
            <div style={{ fontSize: 18, color: muted }}>Stake</div>
            <div style={{ fontSize: 38, color: teal }}>{stake}</div>
          </div>
          <div style={{ background: '#0f172a', padding: 24, borderRadius: 16, width: 340 }}>
            <div style={{ fontSize: 18, color: muted }}>Entry</div>
            <div style={{ fontSize: 38 }}>{entry}</div>
          </div>
          <div style={{ background: '#0f172a', padding: 24, borderRadius: 16, width: 340 }}>
            <div style={{ fontSize: 18, color: muted }}>Exit/Current</div>
            <div style={{ fontSize: 38 }}>{exit}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 24, marginTop: 24 }}>
          <div style={{ background: '#0f172a', padding: 24, borderRadius: 16, width: 340 }}>
            <div style={{ fontSize: 18, color: muted }}>PnL</div>
            <div style={{ fontSize: 38 }}>{pnl}</div>
          </div>
          <div style={{ background: '#0f172a', padding: 24, borderRadius: 16, width: 340 }}>
            <div style={{ fontSize: 18, color: muted }}>ROI</div>
            <div style={{ fontSize: 38 }}>{roi}</div>
          </div>
        </div>

        <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ fontSize: 24, opacity: 0.8 }}>smtm.ai</div>
          <div style={{ fontSize: 18, color: muted }}>Forward this card in Telegram</div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}

