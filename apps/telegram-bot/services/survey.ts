import { promises as fs } from 'fs'
import { dirname } from 'path'
import { env } from '@smtm/shared/env'
import { logger } from '../utils/logger'

type SurveyAnswer = 'yes' | 'maybe' | 'no'

// Prefer Supabase if configured, else CSV fallback
function supabaseAvailable(): boolean {
  return !!(env.SUPABASE_URL && env.SUPABASE_ANON_KEY)
}

async function sb<T = any>(path: string, opts?: RequestInit): Promise<T | null> {
  const url = `${env.SUPABASE_URL}/rest/v1/${path}`
  const headers = {
    apikey: env.SUPABASE_ANON_KEY!,
    Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...opts?.headers,
  }
  const res = await fetch(url, { ...opts, headers })
  if (!res.ok) throw new Error(`Supabase error: ${res.status}`)
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

const FILE = 'apps/telegram-bot/data/survey.csv'
const HEADER = 'created_at,user_id,username,answer\n'

async function ensureFile() {
  await fs.mkdir(dirname(FILE), { recursive: true })
  try { await fs.access(FILE) } catch { await fs.writeFile(FILE, HEADER) }
}

async function appendCsv(userId: number, username: string | undefined, answer: SurveyAnswer) {
  await ensureFile()
  const createdAt = new Date().toISOString()
  const safeUser = (username || '').replace(/[,\n]/g, ' ').slice(0, 60)
  const line = `${createdAt},${userId},${safeUser},${answer}\n`
  await fs.appendFile(FILE, line, 'utf8')
}

export async function recordSurveyResponse(userId: number, username: string | undefined, answer: SurveyAnswer) {
  if (supabaseAvailable()) {
    try {
      await sb('tg_survey_interest', {
        method: 'POST',
        body: JSON.stringify({ user_id: userId, username: username || null, answer }),
        headers: { Prefer: 'resolution=merge-duplicates' },
      })
      logger.info({ userId, answer }, 'survey: recorded via Supabase')
      return
    } catch (e) {
      logger.error(e, 'survey: Supabase insert failed, falling back to CSV')
    }
  }
  try {
    await appendCsv(userId, username, answer)
    logger.info({ userId, answer }, 'survey: recorded to CSV')
  } catch (e) {
    logger.error(e, 'survey: failed to write CSV')
  }
}

