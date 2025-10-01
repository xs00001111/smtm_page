export type FireworksQuality = 'low' | 'medium' | 'high'

export type QualityOverride = 'auto' | FireworksQuality

// Lightweight heuristic shared by components to choose animation quality.
export function getFireworksQuality(viewportWidth?: number): FireworksQuality {
  if (typeof window === 'undefined') return 'medium'
  const w = viewportWidth ?? window.innerWidth
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(ua)
  const hwCores = typeof navigator !== 'undefined' && 'hardwareConcurrency' in navigator ? navigator.hardwareConcurrency || 0 : 0
  const devMem = (navigator as any)?.deviceMemory as number | undefined

  if (prefersReduced || isMobile || (devMem && devMem <= 4) || (hwCores > 0 && hwCores <= 4) || w < 700) return 'low'
  if ((hwCores > 0 && hwCores <= 6) || w < 1024) return 'medium'
  return 'high'
}

// React-friendly helper: returns the resolved quality given an optional override.
export function resolveFireworksQuality(override: QualityOverride = 'auto', viewportWidth?: number): FireworksQuality {
  if (override !== 'auto') return override
  return getFireworksQuality(viewportWidth)
}

