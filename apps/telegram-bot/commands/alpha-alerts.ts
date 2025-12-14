import { Telegraf } from 'telegraf'
import { alphaAlerts } from '../services/alpha-alerts'
import { logger } from '../utils/logger'

function formatStatusLine(p: { alpha_enabled: boolean; alpha_tier: string; quiet_hours: any }) {
  const en = p.alpha_enabled ? 'On' : 'Off'
  // Map internal tier to display name
  let tierDisplay = ''
  if (p.alpha_enabled) {
    if (p.alpha_tier === 'daily_digest') tierDisplay = ' • Daily'
    else tierDisplay = ' • All'
  }
  const qh = p.quiet_hours ? ` • Quiet: ${p.quiet_hours.startHour}-${p.quiet_hours.endHour}` : ' • Quiet: Off'
  return `Alpha alerts: <b>${en}</b>${tierDisplay}${qh}`
}

export function registerAlphaAlertsCommands(bot: Telegraf) {
  // /alpha – show settings AFTER the alpha response, not before
  bot.command('alpha', async (ctx, next) => {
    await next()
    try {
      const svc = alphaAlerts()
      const prefs = await svc.getPrefs(ctx.from.id)
      const msg = `${formatStatusLine(prefs)}\n<i>Opt-in only. All = real-time alerts. Daily = morning summary at 09:00. Quiet hours queue alerts.</i>`
      await ctx.reply(msg, { parse_mode: 'HTML' })
    } catch (e) {
      logger.warn('alpha_alerts.alpha_cmd_post_failed', (e as any)?.message || e)
    }
  })

  // /settings – direct to alpha settings
  bot.command('settings', async (ctx) => {
    try {
      const svc = alphaAlerts()
      const prefs = await svc.getPrefs(ctx.from.id)
      const msg = `Settings — ${formatStatusLine(prefs)}\n<i>Opt-in only. All = real-time alerts. Daily = morning summary at 09:00. Quiet hours queue alerts.</i>`
      await ctx.reply(msg, { parse_mode: 'HTML' })
    } catch {}
  })

  // /mute – immediate opt-out
  bot.command('mute', async (ctx) => {
    try {
      const svc = alphaAlerts()
      await svc.updatePrefs(ctx.from.id, { alpha_enabled: false })
      await ctx.reply('Alpha alerts turned off. You can re-enable anytime via /alpha or /settings.')
    } catch {}
  })

  // /start – onboarding prompt for alpha alerts (Yes/No)
  bot.command('start', async (ctx, next) => {
    try {
      const svc = alphaAlerts()
      const prefs = await svc.getPrefs(ctx.from.id)
      const msg = `Welcome!\n\nDo you want real-time alpha alerts?`
      const kb = {
        reply_markup: {
          inline_keyboard: [
            [
              { text: 'Yes', callback_data: 'alrt:onboard:yes' },
              { text: 'No', callback_data: 'alrt:onboard:no' },
            ],
          ],
        },
      }
      await ctx.reply(msg, kb as any)
      // Also show current status
      const status = `${formatStatusLine(prefs)}`
      await ctx.reply(status, { parse_mode: 'HTML' })
    } catch {}
    return next()
  })

  // Callbacks
  bot.on('callback_query', async (ctx, next) => {
    const data = (ctx.callbackQuery as any)?.data as string | undefined
    if (!data || !data.startsWith('alrt:')) return next()
    const svc = alphaAlerts()
    const userId = ctx.from.id
    try {
      if (data === 'alrt:disable') {
        await svc.updatePrefs(userId, { alpha_enabled: false })
        try { await ctx.answerCbQuery('Muted') } catch {}
        const prefs = await svc.getPrefs(userId)
        await ctx.reply('Alpha alerts turned off.')
        return
      }
      if (data === 'alrt:settings') {
        const prefs = await svc.getPrefs(userId)
        await ctx.answerCbQuery('Settings')
        await ctx.reply('Alpha settings')
        return
      }
      if (data.startsWith('alrt:t:')) {
        const tier = data.split(':')[2] as any
        // Map simplified tier names to internal values
        let internalTier: string
        if (tier === 'all') internalTier = 'high'
        else if (tier === 'daily') internalTier = 'daily_digest'
        else if (tier === 'high' || tier === 'high_confidence' || tier === 'daily_digest') internalTier = tier
        else { await ctx.answerCbQuery('Invalid tier'); return }

        await svc.updatePrefs(userId, { alpha_enabled: true, alpha_tier: internalTier })
        await ctx.answerCbQuery('Updated')
        const prefs = await svc.getPrefs(userId)
        await ctx.reply('Preferences updated')
        return
      }
      if (data === 'alrt:qh:menu') {
        const prefs = await svc.getPrefs(userId)
        await ctx.answerCbQuery('Quiet hours')
        await ctx.reply('Quiet hours presets', { ...(svc.buildQuietHoursKeyboard(prefs.quiet_hours) as any) })
        return
      }
      if (data.startsWith('alrt:qh:set:')) {
        const key = data.split(':')[3]
        let qh: any = null
        if (key !== 'off') {
          const [s, e] = key.split('-').map((x) => parseInt(x, 10))
          if (!Number.isFinite(s) || !Number.isFinite(e)) { await ctx.answerCbQuery('Invalid'); return }
          qh = { startHour: s, endHour: e }
        }
        await svc.updatePrefs(userId, { quiet_hours: qh })
        await ctx.answerCbQuery('Saved quiet hours')
        const prefs = await svc.getPrefs(userId)
        await ctx.reply('Quiet hours updated')
        return
      }
      if (data === 'alrt:onboard:yes') {
        await ctx.answerCbQuery('Choose alert frequency')
        await ctx.reply('Choose your alert preference:', {
          reply_markup: {
            inline_keyboard: [
              [
                { text: 'All alerts', callback_data: 'alrt:t:all' },
                { text: 'Daily summary', callback_data: 'alrt:t:daily' },
              ],
            ],
          },
        } as any)
        return
      }
      if (data === 'alrt:onboard:no') {
        await ctx.answerCbQuery('No problem')
        await svc.updatePrefs(userId, { alpha_enabled: false })
        await ctx.reply('You can enable alerts later via /alpha or /settings.')
        return
      }
    } catch (e) {
      logger.warn({ data, err: (e as any)?.message || e }, 'alpha_alerts.cb_failed')
      try { await ctx.answerCbQuery('Error') } catch {}
    }
  })
}
