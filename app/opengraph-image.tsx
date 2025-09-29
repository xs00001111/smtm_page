import { ImageResponse } from 'next/og'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 64,
          background: 'linear-gradient(90deg, #0C0C0C 0%, #101010 100%)',
          color: '#FFFFFF',
          fontFamily: 'Inter, Arial, sans-serif',
        }}
      >
        <div style={{ fontSize: 18, opacity: 0.8 }}>SMTM</div>
        <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1, marginTop: 16 }}>
          Truth is Profitable.
          <br />
          Lies are Costly.
        </div>
        <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: '#00E5FF',
              boxShadow: '0 0 32px rgba(0,229,255,0.6)',
            }}
          />
          <div style={{ fontSize: 24, color: '#B6FF00' }}>Show Me The Money</div>
        </div>
      </div>
    ),
    { ...size }
  )
}
