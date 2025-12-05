#!/usr/bin/env tsx
/*
  Verify Supabase alpha_event schema has required columns and PostgREST cache is fresh.

  Usage:
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/verify_alpha_schema.ts

  Exits non-zero if required columns are not queryable.
*/

import 'dotenv/config'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing SUPABASE_URL or key (SUPABASE_SERVICE_ROLE_KEY/ANON_KEY).')
  process.exit(2)
}

async function checkColumns() {
  const endpoint = `${url}/rest/v1/alpha_event?select=market_title,market_slug,market_url&limit=1`
  const res = await fetch(endpoint, {
    headers: {
      apikey: key!,
      Authorization: `Bearer ${key}`,
      'Accept-Profile': 'public',
    },
  } as any)
  if (res.ok) {
    console.log('OK: Required columns are queryable (market_title, market_slug, market_url).')
    return 0
  }
  const txt = await res.text()
  console.error(`ERROR: Query failed (${res.status}). Body: ${txt}`)
  if (txt.includes('42703') || txt.includes("does not exist") || txt.includes('PGRST204')) {
    console.error('\nResolution:')
    console.error('- Ensure migration supabase/migrations/20251205_add_market_url.sql has been applied:')
    console.error('    ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS market_url TEXT;')
    console.error("- Then refresh PostgREST schema cache:")
    console.error("    NOTIFY pgrst, 'reload schema';")
    console.error('\nIf you apply SQL via Supabase SQL Editor, paste both statements and run.')
  }
  return 1
}

checkColumns().then((code)=>process.exit(code)).catch((e)=>{ console.error(e); process.exit(1) })

