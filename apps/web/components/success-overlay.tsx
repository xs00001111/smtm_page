"use client"

import { useEffect, useState } from 'react'

interface SuccessOverlayProps {
  active: boolean
  onDone?: () => void
  message?: string
  rewardAmount?: number
  durationMs?: number
}

export function SuccessOverlay({
  active,
  onDone,
  message = 'Congratulations!',
  rewardAmount,
  durationMs = 1800
}: SuccessOverlayProps) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (active) {
      setShow(true)
      const timer = setTimeout(() => {
        setShow(false)
        onDone?.()
      }, durationMs)
      return () => clearTimeout(timer)
    }
  }, [active, durationMs, onDone])

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
      {/* Radial glow background */}
      <div className="absolute inset-0 bg-gradient-radial from-teal/20 via-transparent to-transparent animate-pulse-glow" />

      {/* CSS confetti particles */}
      <div className="absolute inset-0 overflow-hidden">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="confetti-particle"
            style={{
              '--delay': `${i * 0.08}s`,
              '--x': `${Math.random() * 100}vw`,
              '--rotation': `${Math.random() * 720 - 360}deg`,
              '--color': i % 3 === 0 ? '#00E5FF' : i % 3 === 1 ? '#B6FF00' : '#FFFFFF'
            } as React.CSSProperties}
          />
        ))}
      </div>

      {/* Success message card */}
      <div className="relative bg-gradient-to-br from-[#0F0F0F]/95 to-[#1A1A1A]/95 border border-teal/30 rounded-2xl px-8 py-6 shadow-2xl animate-success-bounce backdrop-blur-sm">
        <div className="text-center">
          <div className="text-4xl mb-2 animate-bounce-in">✨</div>
          <h3 className="text-2xl font-bold bg-gradient-to-r from-teal to-lime bg-clip-text text-transparent mb-2 animate-slide-up">
            {message}
          </h3>
          {rewardAmount !== undefined && (
            <div className="text-3xl font-extrabold text-lime animate-scale-in" style={{ animationDelay: '0.2s' }}>
              +${rewardAmount}
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.1); }
        }

        @keyframes confetti-fall {
          0% {
            transform: translateY(-10vh) translateX(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(110vh) translateX(calc(var(--x) - 50vw)) rotate(var(--rotation));
            opacity: 0;
          }
        }

        @keyframes success-bounce {
          0% { transform: scale(0.8); opacity: 0; }
          50% { transform: scale(1.05); }
          100% { transform: scale(1); opacity: 1; }
        }

        @keyframes bounce-in {
          0% { transform: scale(0); }
          50% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }

        @keyframes slide-up {
          0% { transform: translateY(10px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }

        @keyframes scale-in {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }

        .animate-pulse-glow {
          animation: pulse-glow 1.5s ease-in-out;
        }

        .confetti-particle {
          position: absolute;
          width: 10px;
          height: 10px;
          background: var(--color);
          top: -10vh;
          left: 50%;
          animation: confetti-fall 2s ease-out forwards;
          animation-delay: var(--delay);
          border-radius: 2px;
        }

        .animate-success-bounce {
          animation: success-bounce 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .animate-bounce-in {
          animation: bounce-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        .animate-slide-up {
          animation: slide-up 0.4s ease-out;
          animation-delay: 0.1s;
          animation-fill-mode: both;
        }

        .animate-scale-in {
          animation: scale-in 0.5s ease-out;
          animation-fill-mode: both;
        }

        .bg-gradient-radial {
          background: radial-gradient(circle at center, var(--tw-gradient-stops));
        }

        @media (prefers-reduced-motion: reduce) {
          .confetti-particle,
          .animate-pulse-glow,
          .animate-success-bounce,
          .animate-bounce-in,
          .animate-slide-up,
          .animate-scale-in {
            animation: none;
          }
        }
      `}</style>
    </div>
  )
}
