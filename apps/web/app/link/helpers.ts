export function parseInitData(win?: any, href?: string): string | null {
  try {
    const initDataWebApp = win?.Telegram?.WebApp?.initData
    if (initDataWebApp && String(initDataWebApp).length > 0) return String(initDataWebApp)
  } catch {}
  try {
    const url = new URL(href || (typeof window !== 'undefined' ? window.location.href : 'http://localhost/'))
    const q = url.searchParams.get('tg_init')
    if (q) return q
  } catch {}
  return null
}

export function ensureCsrf(storage: Pick<Storage, 'getItem' | 'setItem'>, key = 'smtm.csrf'): string {
  let t = ''
  try {
    t = storage.getItem(key) || ''
  } catch {}
  if (!t) {
    t = Math.random().toString(36).slice(2) + Date.now().toString(36)
    try { storage.setItem(key, t) } catch {}
  }
  return t
}

