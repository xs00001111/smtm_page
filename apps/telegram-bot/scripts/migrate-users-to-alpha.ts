#!/usr/bin/env tsx
/**
 * Migration script: Add all existing Supabase users to alpha alerts preferences
 * Run once to enable alpha alerts for all historical users
 */
import { env } from '@smtm/shared/env'
import { promises as fs } from 'fs'
import path from 'path'

const PREFS_FILE = path.join(__dirname, '..', 'data', 'alpha-prefs.json')

async function migrate() {
  console.log('Starting user migration to alpha preferences...')

  // Check if Supabase is configured
  const SUPABASE_URL = env.SUPABASE_URL
  const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERROR: Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  // Fetch all users from analytics.tg_user via REST API
  console.log('Fetching users from Supabase...')
  const url = `${SUPABASE_URL}/rest/v1/tg_user?select=telegram_user_id&is_bot=eq.false`
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Accept-Profile': 'analytics',
    },
  })

  if (!res.ok) {
    console.error('Failed to fetch users:', await res.text())
    process.exit(1)
  }

  const users = await res.json() as Array<{ telegram_user_id: number }>
  console.log(`Found ${users?.length || 0} users in Supabase`)

  // Load existing prefs
  let existing: Record<string, any> = {}
  try {
    const raw = await fs.readFile(PREFS_FILE, 'utf8')
    existing = JSON.parse(raw)
    console.log(`Loaded ${Object.keys(existing).length} existing preferences`)
  } catch {
    console.log('No existing preferences file found, starting fresh')
  }

  // Add missing users with default opt-in preferences
  const now = Date.now()
  let added = 0

  for (const user of users || []) {
    const userId = String(user.telegram_user_id)
    if (existing[userId]) continue

    existing[userId] = {
      userId: Number(userId),
      alpha_enabled: true,
      alpha_tier: 'high',
      quiet_hours: null,
      created_at: now,
      updated_at: now,
    }
    added++
  }

  // Save updated prefs
  await fs.mkdir(path.dirname(PREFS_FILE), { recursive: true })
  await fs.writeFile(PREFS_FILE, JSON.stringify(existing, null, 2), 'utf8')

  console.log(`✅ Migration complete!`)
  console.log(`- Total users: ${users?.length || 0}`)
  console.log(`- Already had prefs: ${Object.keys(existing).length - added}`)
  console.log(`- Newly added: ${added}`)
  console.log(`- All users now opted in to alpha alerts (tier: high)`)
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
