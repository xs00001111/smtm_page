import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './pages/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0C0C0C',
        foreground: '#FFFFFF',
        muted: '#F5F5F5',
        teal: '#00E5FF',
        lime: '#B6FF00',
      },
      fontFamily: {
        sans: ['var(--font-inter)'],
        display: ['var(--font-orbitron)'],
      },
      backgroundImage: {
        'cta-gradient': 'linear-gradient(90deg, #00E5FF 0%, #B6FF00 100%)',
      },
      boxShadow: {
        glow: '0 0 24px rgba(0, 229, 255, 0.25), 0 0 48px rgba(182, 255, 0, 0.15)',
        glowSoft: '0 0 16px rgba(0, 229, 255, 0.18), 0 0 24px rgba(182, 255, 0, 0.12)',
      },
      keyframes: {
        gridPulse: {
          '0%, 100%': { opacity: '0.08' },
          '50%': { opacity: '0.18' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
        winPulse: {
          '0%, 100%': { boxShadow: '0 0 0 rgba(0,229,255,0)' },
          '50%': { boxShadow: '0 0 24px rgba(0,229,255,0.35), 0 0 48px rgba(182,255,0,0.25)' },
        },
        losePulse: {
          '0%, 100%': { boxShadow: '0 0 0 rgba(255,0,0,0)' },
          '50%': { boxShadow: '0 0 28px rgba(239, 68, 68, 0.35)' },
        },
        marqueeLeft: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        marqueeRight: {
          '0%': { transform: 'translateX(-50%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
      animation: {
        gridPulse: 'gridPulse 6s ease-in-out infinite',
        float: 'float 6s ease-in-out infinite',
        winPulse: 'winPulse 1.8s ease-in-out 2',
        losePulse: 'losePulse 1.2s ease-in-out 2',
        tickerLeft: 'marqueeLeft 22s linear infinite',
        tickerRight: 'marqueeRight 28s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
