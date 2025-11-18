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
  if (!supabaseAvailable()) {
    logger.info('Analytics disabled: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
  } else {
    logger.info('Analytics enabled: logging commands, callbacks, inline queries, messages, and errors');
  }
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
        else if (typeof m.text === 'string') {
          // Non-command text message; log as 'message'
          const from = ctx.from
          const chat = ctx.chat
          const userId = from?.id ? Number(from.id) : undefined
          const chatId = chat?.id != null ? Number(chat.id) : undefined

          if (userId) {
            const truncated = m.text.length > 200 ? m.text.slice(0, 200) + '…' : m.text
            const payload = {
              p_telegram_user_id: userId,
              p_username: from?.username ?? null,
              p_language_code: (from as any)?.language_code ?? null,
              p_is_bot: Boolean((from as any)?.is_bot),
              p_telegram_chat_id: chatId ?? null,
              p_chat_type: (chat as any)?.type ?? null,
              p_chat_title: (chat as any)?.title ?? null,
              p_command: 'message',
              p_args: { text: truncated, length: m.text.length },
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
              logger.warn({ err: (e as any)?.message }, 'analytics_log_message failed')
            }
          }
        }
      }
    } catch (e) {
      logger.warn({ err: (e as any)?.message }, 'analytics middleware error')
    }
    return next()
  })

  // Track callback button interactions
  bot.on('callback_query', async (ctx, next) => {
    try {
      const cq: any = (ctx as any).callbackQuery
      const data: string | undefined = cq?.data
      if (!data) return next()

      // Skip generic action-token callbacks here. We'll log the resolved
      // action type in the handler after token is resolved.
      if (typeof data === 'string' && data.startsWith('act:')) {
        return next()
      }

      const from = ctx.from
      const chatId = (cq?.message && cq.message.chat && cq.message.chat.id != null)
        ? Number(cq.message.chat.id)
        : undefined

      const userId = from?.id ? Number(from.id) : undefined
      if (userId) {
        const parts = data.split(':')
        const inferred = parts[0] || 'callback'

        const payload = {
          p_telegram_user_id: userId,
          p_username: from?.username ?? null,
          p_language_code: (from as any)?.language_code ?? null,
          p_is_bot: Boolean((from as any)?.is_bot),
          p_telegram_chat_id: chatId ?? null,
          p_chat_type: (cq?.message as any)?.chat?.type ?? null,
          p_chat_title: (cq?.message as any)?.chat?.title ?? null,
          p_command: inferred,
          p_args: { callback_data: data, parts },
          p_bot_id: null,
          p_telegram_message_id: (cq?.message as any)?.message_id ?? null,
          p_meta: {
            update_type: ctx.updateType,
            update_id: (ctx as any).update?.update_id,
            inline_message_id: cq?.inline_message_id || null,
          },
        }

        try {
          await postRpc('analytics_log_command', payload)
        } catch (e) {
          logger.warn({ err: (e as any)?.message }, 'analytics_log_callback failed')
        }
      }
    } catch (e) {
      logger.warn({ err: (e as any)?.message }, 'analytics callback middleware error')
    }
    return next()
  })

  // Track inline queries (bot used in inline mode)
  bot.on('inline_query', async (ctx, next) => {
    try {
      const iq: any = (ctx as any).inlineQuery
      const userId = ctx.from?.id ? Number(ctx.from.id) : undefined
      if (!iq || !userId) return next()

      const payload = {
        p_telegram_user_id: userId,
        p_username: ctx.from?.username ?? null,
        p_language_code: (ctx.from as any)?.language_code ?? null,
        p_is_bot: Boolean((ctx.from as any)?.is_bot),
        p_telegram_chat_id: null,
        p_chat_type: null,
        p_chat_title: null,
        p_command: 'inline_query',
        p_args: { query: iq.query || '', offset: iq.offset || '' },
        p_bot_id: null,
        p_telegram_message_id: null,
        p_meta: {
          update_type: ctx.updateType,
          update_id: (ctx as any).update?.update_id,
          inline_query_id: iq.id,
          chat_type: iq.chat_type || null,
        },
      }

      try {
        await postRpc('analytics_log_command', payload)
      } catch (e) {
        logger.warn({ err: (e as any)?.message }, 'analytics_log_inline_query failed')
      }
    } catch (e) {
      logger.warn({ err: (e as any)?.message }, 'analytics inline_query middleware error')
    }
    return next()
  })
}

// Log a specific action with explicit command name (e.g., follow_market)
export async function logActionEvent(ctx: any, command: string, args?: any) {
  try {
    if (!supabaseAvailable()) return
    const from = ctx?.from
    const chat = ctx?.chat || (ctx?.message && ctx.message.chat)
    const userId = from?.id ? Number(from.id) : undefined
    const chatId = chat?.id != null ? Number(chat.id) : undefined
    if (!userId) return
    const payload = {
      p_telegram_user_id: userId,
      p_username: from?.username ?? null,
      p_language_code: (from as any)?.language_code ?? null,
      p_is_bot: Boolean((from as any)?.is_bot),
      p_telegram_chat_id: chatId ?? null,
      p_chat_type: (chat as any)?.type ?? null,
      p_chat_title: (chat as any)?.title ?? null,
      p_command: command,
      p_args: args ?? null,
      p_bot_id: null,
      p_telegram_message_id: (ctx as any)?.message?.message_id ?? (ctx as any)?.callbackQuery?.message?.message_id ?? null,
      p_meta: {
        update_type: ctx?.updateType,
        update_id: (ctx as any)?.update?.update_id,
      },
    }
    await postRpc('analytics_log_command', payload)
  } catch (e) {
    logger.warn({ err: (e as any)?.message }, 'analytics logActionEvent failed')
  }
}

// Optional helper to log handled errors with context
export async function logAnalyticsError(ctx: any, err: any) {
  try {
    if (!supabaseAvailable()) return
    const from = ctx?.from
    const chat = ctx?.chat
    const userId = from?.id ? Number(from.id) : undefined
    const chatId = chat?.id != null ? Number(chat.id) : undefined
    if (!userId) return
    const payload = {
      p_telegram_user_id: userId,
      p_username: from?.username ?? null,
      p_language_code: (from as any)?.language_code ?? null,
      p_is_bot: Boolean((from as any)?.is_bot),
      p_telegram_chat_id: chatId ?? null,
      p_chat_type: (chat as any)?.type ?? null,
      p_chat_title: (chat as any)?.title ?? null,
      p_command: 'error',
      p_args: { message: String(err?.message || err), name: String(err?.name || 'Error') },
      p_bot_id: null,
      p_telegram_message_id: (ctx as any)?.message?.message_id ?? null,
      p_meta: {
        update_type: ctx?.updateType,
        update_id: (ctx as any)?.update?.update_id,
        stack: (err && err.stack) ? String(err.stack).slice(0, 2000) : null,
      },
    }
    await postRpc('analytics_log_command', payload)
  } catch (e) {
    logger.warn({ err: (e as any)?.message }, 'analytics_log_error failed')
  }
}
