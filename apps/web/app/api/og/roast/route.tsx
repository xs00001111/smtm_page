import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET(req: Request) {
  const bg = '#0B0F14'
  const { searchParams } = new URL(req.url)
  const l1 = searchParams.get('l1') || 'Buying tops like it’s a lifestyle.'
  const l2 = searchParams.get('l2') || 'You don’t fade the crowd — you fund it.'
  const l3 = searchParams.get('l3') || '(mock copy)'
  const variantParam = (searchParams.get('variant') || searchParams.get('mode') || '').toLowerCase()
  const compact = (
    variantParam === 'compact' ||
    (searchParams.get('compact') || '').toLowerCase() === 'true' ||
    variantParam === ''
  )
  const single = variantParam === 'single' || (searchParams.get('single') || '').toLowerCase() === 'true'
  // Responsive canvas
  const preset = (searchParams.get('preset') || searchParams.get('size') || 'portrait-short').toLowerCase()
  let width = 1200
  let height = 675
  if (preset === 'square') { width = 1080; height = 1080 }
  else if (preset === 'portrait' || preset === 'mobile') { width = 1080; height = 1350 }
  else if (preset === 'short' || preset === 'portrait-short' || preset === 'mobile-short') { width = 1080; height = 1200 }
  else if (preset === 'narrow') { width = 540; height = 1200 }
  else if (preset === 'mini' || preset === '300x600' || preset === 'small') { width = 300; height = 600 }
  const wParam = parseInt(searchParams.get('w') || searchParams.get('width') || '', 10)
  const hParam = parseInt(searchParams.get('h') || searchParams.get('height') || '', 10)
  if (Number.isFinite(wParam) && wParam > 100 && wParam <= 2000) width = wParam
  if (Number.isFinite(hParam) && hParam > 100 && hParam <= 2000) height = hParam
  const narrowFlag = (searchParams.get('narrow') || '').toLowerCase() === 'true' || preset === 'narrow'
  if (narrowFlag) {
    width = Math.max(200, Math.floor(width / 2))
  }
  const isPortrait = height >= width
  const baseH = preset.includes('short') || preset === 'narrow' ? 1200 : (preset.includes('portrait') || preset.includes('mobile') ? 1350 : 675)
  const k = isPortrait ? (height / baseH) : Math.min(width / 1200, height / 675)
  const boxPadding = Math.round(10 * k)

  return new ImageResponse(
    (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Compact bordered box that fits content */}
        <div
          style={{
            display: 'flex',
            borderRadius: 16,
            background: 'linear-gradient(180deg, rgba(255,45,85,0.25) 0%, rgba(0,0,0,0) 30%)',
            padding: boxPadding,
          }}
        >
          {single ? (
            // Single-line mode
            <div
              style={{
                color: '#EAEFF5',
                fontSize: Math.round(48 * k),
                fontWeight: 600,
                lineHeight: 1.2,
                letterSpacing: '-0.01em',
                textAlign: 'center',
                maxWidth: '90%',
              }}
            >
              {l1}
            </div>
          ) : (
            // Default or compact stacked mode
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: compact ? Math.round(6 * k) : Math.round(10 * k),
                alignItems: 'center',
                maxWidth: '90%',
              }}
            >
              {/* Overline chip */}
              <div
                style={{
                  padding: compact ? `${Math.round(4 * k)}px ${Math.round(8 * k)}px` : `${Math.round(5 * k)}px ${Math.round(10 * k)}px`,
                  borderRadius: 999,
                  backgroundColor: 'rgba(255, 45, 85, 0.16)',
                  color: '#FFC7D2',
                  fontSize: compact ? Math.round(16 * k) : Math.round(18 * k),
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                ROAST MODE
              </div>

              {/* Roast lines */}
              <div
                style={{
                  color: '#EAEFF5',
                  fontSize: compact ? Math.round(32 * k) : Math.round(38 * k),
                  fontWeight: 600,
                  lineHeight: 1.25,
                  letterSpacing: '-0.01em',
                  textAlign: 'center',
                }}
              >
                {l1}
              </div>
              <div
                style={{
                  color: '#EAEFF5',
                  fontSize: compact ? Math.round(32 * k) : Math.round(38 * k),
                  fontWeight: 600,
                  lineHeight: 1.25,
                  letterSpacing: '-0.01em',
                  textAlign: 'center',
                }}
              >
                {l2}
              </div>
              <div
                style={{
                  color: '#FFB3C2',
                  fontSize: compact ? Math.round(24 * k) : Math.round(28 * k),
                  fontWeight: 500,
                  lineHeight: 1.25,
                  textAlign: 'center',
                }}
              >
                {l3}
              </div>

              {/* Footer context */}
              <div
                style={{
                  marginTop: compact ? Math.round(2 * k) : Math.round(4 * k),
                  color: '#93A1AD',
                  fontSize: compact ? Math.round(16 * k) : Math.round(18 * k),
                  fontWeight: 400,
                  lineHeight: 1.3,
                  textAlign: 'center',
                }}
              >
                Satire only — have a laugh, then go win.
              </div>
            </div>
          )}
        </div>
      </div>
    ),
    { width, height }
  )
}
