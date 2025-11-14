import { Telegraf } from 'telegraf'
import { env } from '@smtm/shared/env'
import { logger } from '../utils/logger'

const SUPABASE_URL = env.SUPABASE_URL
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY

function supabaseAvailable(): boolean {
  // RPC is granted to service_role only; prefer service key
  return !!(SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)
}

async function postRpc<T = any>(fn: string, body: any): Promise<T | null> {
  if (!supabaseAvailable()) return null
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fn}`
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Supabase RPC ${fn} failed: ${res.status} ${text.slice(0,200)}`)
  }
  const ct = res.headers.get('content-type') || ''
  if (!ct.includes('application/json')) return null
  return (await res.json()) as T
}

function parseCommandFromText(text: string | undefined, entities?: any[]): { command?: string, argsRaw?: string } {
  if (!text || !entities || !Array.isArray(entities)) return {}
  const cmd = entities.find((e: any) => e.type === 'bot_command' && e.offset === 0)
  if (!cmd) return {}
  const raw = text.substring(cmd.offset, cmd.offset + cmd.length) // e.g., '/start' or '/start@Botname'
  const rest = text.substring(cmd.offset + cmd.length).trim() || undefined
  const name = raw.replace(/^\//, '').split('@')[0] // strip leading '/' and bot suffix
  return { command: name, argsRaw: rest }
}

export function initAnalyticsLogging(bot: Telegraf) {
  // Best-effort middleware: logs each command message via RPC
  bot.use(async (ctx, next) => {
    try {
      const m: any = (ctx as any).message
      if (m && typeof m.text === 'string' && Array.isArray(m.entities)) {
        const { command, argsRaw } = parseCommandFromText(m.text, m.entities)
        if (command) {
          const from = ctx.from
          const chat = ctx.chat
          const userId = from?.id ? Number(from.id) : undefined
          const chatId = chat?.id != null ? Number(chat.id) : undefined

          if (userId) {
            const payload = {
              p_telegram_user_id: userId,
              p_username: from?.username ?? null,
              p_language_code: (from as any)?.language_code ?? null,
              p_is_bot: Boolean((from as any)?.is_bot),
              p_telegram_chat_id: chatId ?? null,
              p_chat_type: (chat as any)?.type ?? null,
              p_chat_title: (chat as any)?.title ?? null,
              p_command: command,
              p_args: argsRaw ? { raw: argsRaw } : null,
              p_bot_id: null,
              p_telegram_message_id: m.message_id ?? null,
              p_meta: {
                update_type: ctx.updateType,
                update_id: (ctx as any).update?.update_id,
              },
            }

            try {
              await postRpc('analytics_log_command', payload)
            } catch (e) {
              // Do not block bot flow on analytics errors
              logger.warn({ err: (e as any)?.message }, 'analytics_log_command failed')
            }
          }
        }
      }
    } catch (e) {
      logger.warn({ err: (e as any)?.message }, 'analytics middleware error')
    }
    return next()
  })
}

