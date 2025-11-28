import { ImageResponse } from 'next/og'

// Edge runtime for fast image generation
export const runtime = 'edge'

export async function GET(req: Request) {
  const matte = '#0B0F14'
  const { searchParams } = new URL(req.url)
  const scoreParam = searchParams.get('score')
  const chip1 = searchParams.get('chip1') || 'Winrate 63%'
  const chip2 = searchParams.get('chip2') || 'Sharpe 1.8'
  const caption = searchParams.get('caption') || 'AI RATE (mock)'
  const variantParam = (searchParams.get('variant') || searchParams.get('mode') || '').toLowerCase()
  const compact = (
    variantParam === 'compact' ||
    (searchParams.get('compact') || '').toLowerCase() === 'true' ||
    variantParam === ''
  )
  const borderColor = searchParams.get('border') || '#1FE2FF'
  const layoutParam = (searchParams.get('layout') || 'center').toLowerCase()
  const leftAligned = layoutParam !== 'center'
  const score = (scoreParam && /^\d{1,3}$/.test(scoreParam)) ? scoreParam : '142'

  // Responsive canvas: presets or explicit size
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

  // Narrow mode: reduce horizontal length by half (after preset/overrides)
  const narrowFlag = (searchParams.get('narrow') || '').toLowerCase() === 'true' || preset === 'narrow'
  if (narrowFlag) {
    width = Math.max(200, Math.floor(width / 2))
  }

  // Scale typography / spacing from base 1200x675
  // For portrait/narrow, scale from height baseline to keep text legible
  const isPortrait = height >= width
  const baseH = preset.includes('short') || preset === 'narrow' ? 1200 : (preset.includes('portrait') || preset.includes('mobile') ? 1350 : 675)
  const k = isPortrait ? (height / baseH) : Math.min(width / 1200, height / 675)
  const scoreSize = Math.round((compact ? 150 : 190) * k)
  const overlineSize = Math.round((compact ? 16 : 18) * k)
  const chipFont = Math.round((compact ? 18 : 20) * k)
  const chipPadV = Math.round((compact ? 4 : 6) * k)
  const chipPadH = Math.round((compact ? 10 : 12) * k)
  const gap = Math.round((compact ? 4 : 8) * k)
  const gapChips = Math.round((compact ? 6 : 8) * k)
  const captionSize = Math.round((compact ? 18 : 22) * k)
  const boxPadding = Math.round(10 * k)
  const contentPadLeft = leftAligned ? Math.round(20 * k) : 0

  return new ImageResponse(
    (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: matte,
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Compact bordered box that fits content */}
        <div
          style={{
            display: 'flex',
            borderRadius: 16,
            border: `2px solid ${borderColor}`,
            background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.06) 0%, rgba(0,0,0,0) 60%)',
            padding: boxPadding,
          }}
        >
          {/* Content wrapper (left or centered) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: leftAligned ? 'flex-start' : 'center',
              justifyContent: 'center',
              gap,
              paddingLeft: contentPadLeft,
              paddingRight: contentPadLeft,
            }}
          >
            {/* Overline */}
            <div
              style={{
                fontSize: overlineSize,
                fontWeight: 600,
                color: '#89A8B8',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
              }}
            >
              TRADER IQ
            </div>
            {/* Score */}
            <div
              style={{
                fontSize: scoreSize,
                fontWeight: 800,
                lineHeight: 0.9,
                color: '#CCF8FF',
                letterSpacing: '-0.02em',
              }}
            >
              {score}
            </div>
            {/* Chips */}
            <div
              style={{
                display: 'flex',
                gap: gapChips,
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  padding: `${chipPadV}px ${chipPadH}px`,
                  borderRadius: 999,
                  backgroundColor: 'rgba(204, 248, 255, 0.08)',
                  color: '#CDECF6',
                  fontSize: chipFont,
                  fontWeight: 500,
                }}
              >
                {chip1}
              </div>
              <div
                style={{
                  padding: `${chipPadV}px ${chipPadH}px`,
                  borderRadius: 999,
                  backgroundColor: 'rgba(204, 248, 255, 0.08)',
                  color: '#CDECF6',
                  fontSize: chipFont,
                  fontWeight: 500,
                }}
              >
                {chip2}
              </div>
            </div>
            {/* Caption */}
            <div
              style={{
                fontSize: captionSize,
                fontWeight: 400,
                color: '#8EA3B4',
              }}
            >
              {caption}
            </div>
          </div>
        </div>
      </div>
    ),
    { width, height }
  )
}
