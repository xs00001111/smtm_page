/*
 End-to-end test for skew-store against a real Supabase project.
 Requires SUPABASE_URL and either SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY in your environment.
 Run with: npm run test:skew:e2e
*/

import { persistSkewSnapshot, fetchLatestSkew } from '../apps/telegram-bot/services/skew-store'

function assert(cond: any, msg: string) { if (!cond) throw new Error('Assertion failed: ' + msg) }

async function main() {
  if (!process.env.SUPABASE_URL || (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ANON_KEY)) {
    console.error('Missing SUPABASE_URL and/or key. Set them in your .env before running.')
    process.exit(1)
  }
  const cond = `test-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
  console.log('Using conditionId:', cond)

  // 1) Persist
  const id = await persistSkewSnapshot({
    conditionId: cond,
    source: 'holders',
    yesTokenId: 'Y',
    noTokenId: 'N',
    skewYes: 0.76,
    skew: 0.76,
    direction: 'YES',
    smartPoolUsd: 4200,
    walletsEvaluated: 11,
    whaleThreshold: 45,
    meta: { e2e: true },
  })
  assert(id !== null, 'persistSkewSnapshot returned null id')
  console.log('Persisted id:', id)

  // 2) Read latest
  const row = await fetchLatestSkew({ conditionId: cond, source: 'holders', maxAgeSec: 24*60*60, useCacheMs: 0 })
  assert(!!row, 'fetchLatestSkew returned null')
  assert(Math.abs((row!.skew ?? 0) - 0.76) < 1e-9, 'fetched skew mismatch')
  console.log('Fetched row skew:', row!.skew, 'smart_pool_usd:', row!.smart_pool_usd)

  // 3) Cleanup test rows to keep DB tidy
  const base = process.env.SUPABASE_URL as string
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY) as string
  const res = await fetch(`${base}/rest/v1/skew_snapshot?condition_id=eq.${encodeURIComponent(cond)}`, {
    method: 'DELETE',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Accept-Profile': 'public',
      'Content-Profile': 'public',
      Prefer: 'return=representation',
    } as any,
  } as any)
  if (!res.ok) {
    console.warn('Cleanup failed:', res.status, await res.text())
  } else {
    try { const json = await res.json(); console.log('Cleanup deleted rows:', Array.isArray(json) ? json.length : json) } catch { console.log('Cleanup ok') }
  }

  console.log('E2E skew-store OK')
}

main().catch((e) => { console.error(e); process.exit(1) })

