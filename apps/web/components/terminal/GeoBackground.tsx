"use client"

import React from 'react'

function makeRow(width: number, height: number, nodes: number, y: number) {
  const step = width / (nodes - 1)
  const pts = Array.from({ length: nodes }, (_, i) => ({ x: i * step, y }))
  return pts
}

export default function GeoBackground() {
  const width = 1600
  const height = 900
  const row1 = makeRow(width, height, 14, height * 0.68)
  const row2 = makeRow(width, height, 12, height * 0.74)
  const row3 = makeRow(width, height, 10, height * 0.80)

  const line = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(' ')

  return (
    <div className="pointer-events-none fixed inset-0 -z-30 opacity-[0.6]">
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="gridFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(0,229,255,0.12)" />
            <stop offset="100%" stopColor="rgba(0,229,255,0.02)" />
          </linearGradient>
        </defs>
        {/* Subtle radial glows */}
        <circle cx={width * 0.2} cy={height * 0.15} r={220} fill="rgba(0,229,255,0.06)" />
        <circle cx={width * 0.8} cy={height * 0.7} r={260} fill="rgba(182,255,0,0.05)" />

        {/* Network rows */}
        {[row1, row2, row3].map((row, idx) => (
          <g key={idx} stroke="url(#gridFade)" strokeWidth="1.2" fill="none">
            <polyline points={line(row)} />
            {row.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={3} fill="rgba(255,255,255,0.8)" />
            ))}
            {row.slice(0, -1).map((p, i) => (
              <line key={`c${i}`} x1={p.x} y1={p.y} x2={row[i + 1].x} y2={row[i + 1].y - 24 + (idx * 10)} />
            ))}
          </g>
        ))}
      </svg>
    </div>
  )
}

