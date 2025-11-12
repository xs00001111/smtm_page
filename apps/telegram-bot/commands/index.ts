import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger';
import { getTopRewardMarket, formatRewardInfo } from '../services/rewards';
import { findMarket, findMarketFuzzy, findWhaleFuzzy, gammaApi, dataApi, clobApi } from '@smtm/data';
import { wsMonitor } from '../index';
import { botConfig } from '../config/bot';
import { linkPolymarketAddress, linkPolymarketUsername, unlinkAll, getLinks, parsePolymarketProfile, resolveUsernameToAddress } from '../services/links';
import { actionFollowMarket, actionFollowWhaleAll, actionFollowWhaleMarket, resolveAction, actionUnfollowMarket, actionUnfollowWhaleAll, actionUnfollowWhaleMarket, actionFollowWhaleAllMany } from '../services/actions';
import { recordSurveyResponse } from '../services/survey';

/**
 * Generate Polymarket profile URL for a whale/trader
 * @param username - User's display name (e.g., "Car")
 * @param address - User's wallet address (fallback if no username)
 * @returns Formatted profile URL
 */
function getPolymarketProfileUrl(username: string | null | undefined, address: string): string {
  // If we have a real username (not "Anonymous"), use the profile format
  if (username && username !== 'Anonymous') {
    const encodedName = encodeURIComponent(username);
    const lowerName = encodeURIComponent(username.toLowerCase());
    return `https://polymarket.com/profile/%40${encodedName}?via=user%2F${lowerName}`;
  }
  // Fallback to address format for anonymous or address-only cases
  return `https://polymarket.com/profile/${address}`;
}

/**
 * Generate Polymarket market URL from API response
 * Uses events[0].slug from API response (most reliable)
 * @param market - Market object from Gamma API
 * @returns Formatted market URL or null if no slug available
 */
function getPolymarketMarketUrl(market: any): string | null {
  // Prefer events[0].slug from API (most reliable)
  if (market.events && Array.isArray(market.events) && market.events.length > 0) {
    const eventSlug = market.events[0].slug;
    if (eventSlug) {
      return `https://polymarket.com/event/${eventSlug}`;
    }
  }

  // Fallback to direct slug field
  if (market.slug) {
    return `https://polymarket.com/event/${market.slug}`;
  }

  return null;
}

// Escape HTML for Telegram HTML parse_mode
function esc(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Parse a market input which may be:
// - condition id (0x...)
// - polymarket event URL
// - slug or free text
async function resolveMarketFromInput(input: string): Promise<any | null> {
  const looksLikeCond = /^0x[a-fA-F0-9]{64}$/
  const looksLikeUrl = /^https?:\/\//i
  try {
    if (looksLikeCond.test(input)) {
      return await gammaApi.getMarket(input)
    }
    if (looksLikeUrl.test(input)) {
      try {
        const u = new URL(input)
        const parts = u.pathname.split('/').filter(Boolean)
        // Expect /event/<slug>
        const idx = parts.findIndex(p=>p==='event')
        if (idx >= 0 && parts[idx+1]) {
          const slug = decodeURIComponent(parts[idx+1])
          const m = await findMarket(slug)
          if (m) return m
        }
      } catch {}
    }
    // Fallback to search/slug resolution
    return await findMarket(input)
  } catch (e) {
    logger.error('resolveMarketFromInput failed', { input, error: (e as any)?.message })
    return null
  }
}

export function registerCommands(bot: Telegraf) {
  // Start command
  bot.command('start', async (ctx) => {
    logger.info('User started bot', { userId: ctx.from?.id });
    await ctx.reply(
      'Welcome to SMTM 🎯\n\n' +
        'Quick actions:\n' +
        '• /markets [query] — hot markets or search\n' +
        '• /whales [0x<id>|query] — leaderboard, market whales, or search\n' +
        '• /profile_card [@username|address] — uses linked profile if omitted\n' +
        '• /follow 0x<market_id> • /list\n\n' +
        'More commands: /help',
      {
        reply_markup: {
          keyboard: [
            [{ text: '/markets' }, { text: '/whales' }],
            [{ text: '/list' }, { text: '/profile_card' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        } as any
      }
    );
  });

  // Inline button handler for one‑tap follow actions
  bot.on('callback_query', async (ctx) => {
    try {
      const data = (ctx.callbackQuery as any)?.data as string | undefined
      if (!data) return
      // Survey responses (interest poll)
      if (data.startsWith('survey:')) {
        const answer = data.slice('survey:'.length) as 'yes'|'maybe'|'no'
        const userId = ctx.from!.id
        const uname = ctx.from?.username || undefined
        await recordSurveyResponse(userId, uname, answer)
        await ctx.answerCbQuery('✅ Thanks for your feedback!')
        try {
          await ctx.reply(
            answer === 'yes'
              ? '🚀 Noted! We\'ll ping you when arbitrage & spread farming goes live.'
              : answer === 'maybe'
              ? '👍 Got it — we\'ll keep you posted as it shapes up.'
              : '🙏 Thanks! Appreciate the signal.'
          )
        } catch {}
        return
      }
      if (!data.startsWith('act:')) return
      const id = data.slice(4)
      const rec = await resolveAction(id)
      if (!rec) { await ctx.answerCbQuery('Action expired. Try again.'); return }
      const userId = ctx.from!.id

      if (rec.type === 'follow_market') {
        const { conditionId, marketName } = rec.data
        const ok = wsMonitor.subscribePendingMarket(userId, conditionId, marketName || 'Market', botConfig.websocket.priceChangeThreshold)
        const { addMarketSubscription } = await import('../services/subscriptions')
        await addMarketSubscription(userId, '', marketName || 'Market', conditionId, botConfig.websocket.priceChangeThreshold)
        await ctx.answerCbQuery(ok ? '✅ Following market!' : 'Already following')
      } else if (rec.type === 'follow_whale_all') {
        const { address } = rec.data
        const ok = wsMonitor.subscribeToWhaleTradesAll(userId, address, botConfig.websocket.whaleTrademinSize)
        const { addWhaleSubscriptionAll } = await import('../services/subscriptions')
        await addWhaleSubscriptionAll(userId, address, botConfig.websocket.whaleTrademinSize)
        await ctx.answerCbQuery(ok ? '✅ Following whale (all markets)!' : 'Already following')
      } else if (rec.type === 'follow_whale_market') {
        const { address, conditionId, marketName } = rec.data
        const ok = wsMonitor.subscribePendingWhale(userId, conditionId, marketName || 'Market', botConfig.websocket.whaleTrademinSize, address)
        const { addWhaleSubscription } = await import('../services/subscriptions')
        await addWhaleSubscription(userId, '', marketName || 'Market', botConfig.websocket.whaleTrademinSize, address, conditionId)
        await ctx.answerCbQuery(ok ? '✅ Following whale on market!' : 'Already following')
      } else if (rec.type === 'follow_whale_all_many') {
        const { addresses } = rec.data as { addresses: string[] }
        const userId = ctx.from!.id
        let okCount = 0
        try {
          const { addWhaleSubscriptionAll } = await import('../services/subscriptions')
          for (const addrRaw of (addresses || []).slice(0, 20)) {
            const addr = String(addrRaw || '').toLowerCase()
            if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) continue
            const ok = wsMonitor.subscribeToWhaleTradesAll(userId, addr, botConfig.websocket.whaleTrademinSize)
            if (ok) {
              okCount++
              await addWhaleSubscriptionAll(userId, addr, botConfig.websocket.whaleTrademinSize)
            }
          }
          await ctx.answerCbQuery(okCount > 0 ? `✅ Following ${okCount} whales` : 'No new follows')
          if (okCount > 0) await ctx.reply(`✅ Following ${okCount} whales (all markets)`)
        } catch {
          await ctx.answerCbQuery('❌ Failed to follow all')
        }
      } else if (rec.type === 'unfollow_market') {
        const { tokenId, conditionId, marketName } = rec.data
        try {
          let ok = false
          if (tokenId) { ok = wsMonitor.unsubscribeFromMarket(userId, tokenId) }
          const { removeMarketSubscription, removePendingMarketByCondition } = await import('../services/subscriptions')
          if (tokenId) await removeMarketSubscription(userId, tokenId)
          if (conditionId) await removePendingMarketByCondition(userId, conditionId)
          await ctx.answerCbQuery(`✅ Unfollowed${marketName ? ` ${marketName}` : ''}`)
        } catch {
          await ctx.answerCbQuery('❌ Failed to unfollow')
        }
      } else if (rec.type === 'unfollow_whale_all') {
        const { address } = rec.data
        try {
          wsMonitor.unsubscribeFromWhaleTradesAll(userId, address)
          const { removeWhaleSubscriptionAll } = await import('../services/subscriptions')
          await removeWhaleSubscriptionAll(userId, address)
          await ctx.answerCbQuery('✅ Unfollowed whale (all)')
        } catch { await ctx.answerCbQuery('❌ Failed to unfollow') }
      } else if (rec.type === 'unfollow_whale_market') {
        const { address, tokenId, conditionId, marketName } = rec.data
        try {
          if (tokenId) wsMonitor.unsubscribeFromWhaleTrades(userId, tokenId)
          const { removeWhaleSubscription, removePendingWhaleByCondition } = await import('../services/subscriptions')
          if (tokenId) await removeWhaleSubscription(userId, tokenId)
          if (conditionId) await removePendingWhaleByCondition(userId, conditionId, address)
          await ctx.answerCbQuery(`✅ Unfollowed${marketName ? ` ${marketName}` : ''}`)
        } catch { await ctx.answerCbQuery('❌ Failed to unfollow') }
      }
    } catch (e) {
      logger.error('callback action failed', e)
      try { await ctx.answerCbQuery('❌ Failed. Please try again.') } catch {}
    }
  })

  // Help command
  bot.command('help', async (ctx) => {
    await ctx.reply(
      '📚 SMTM Help\n\n' +
        'Create\n' +
        '• /profile_card [address|@username|profile_url] — accurate (address/URL) or fuzzy (username); uses linked profile if omitted\n' +
        '   e.g. /profile_card 0xABC…  •  /profile_card @alice\n' +
        '• /trade_card <market> <yes|no> <stake_$> [entry_%] [current_%]\n' +
        '   e.g. /trade_card trump-2024 yes 1000 65 72\n\n' +
        'Discover\n' +
        '• /markets [query] — hot markets or search\n' +
        '   e.g. /markets election\n' +
        '• /whales [0x<market_id>|query] — leaderboard, whales in market, or search; accurate (address/URL) and fuzzy (name/@username) supported\n' +
        '   e.g. /whales  •  /whales 0xABC...  •  /whales @alice\n' +
        '• /price <id|slug|keywords> — detailed price view\n' +
        '   e.g. /price 0xABC...  •  /price trump-2024\n' +
        '• /overview <market> — sides, holders, pricing\n\n' +
        'Resolution\n' +
        '• Exact: address or profile URL (preferred)\n' +
        '• Fuzzy: username/name when exact not provided\n\n' +
        'Alerts\n' +
        '• /follow 0x<market_id> — price alerts\n' +
        '• /follow 0x<wallet> — whale trades (all markets)\n' +
        '• /follow 0x<wallet> 0x<market_id> — whale on a specific market\n' +
        '• /unfollow <...>  •  /list\n\n' +
        'Account\n' +
        '• /link 0x... | @username  •  /unlink\n' +
        '• /stats <address|@username|profile_url> — accurate (address/URL) or fuzzy (username)\n\n' +
        'Utility\n' +
        '• /status — connection status  •  /survey — feedback\n\n' +
        'Tip: Use @username in /profile_card to print the handle on the card; omit args for your linked profile.',
      {
        reply_markup: {
          keyboard: [
            [{ text: '/markets' }, { text: '/whales' }],
            [{ text: '/list' }, { text: '/profile_card' }]
          ],
          resize_keyboard: true,
          one_time_keyboard: true
        } as any
      }
    );
  });

  // Survey: gauge interest in arbitrage & spread farming feature
  bot.command('survey', async (ctx) => {
    const text =
      '🧪 New Feature Survey\n\n' +
      'We\'re building tools to spot arbitrage and spread farming opportunities across markets.\n' +
      'Would you be interested in this feature?'
    const keyboard = {
      inline_keyboard: [[
        { text: '✅ I\'m interested', callback_data: 'survey:yes' },
        { text: '🤔 Maybe', callback_data: 'survey:maybe' },
        { text: '❌ Not interested', callback_data: 'survey:no' },
      ]],
    }
    await ctx.reply(text, { reply_markup: keyboard as any })
  })

  // Link command — link Polymarket address
  bot.command('link', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    const userId = ctx.from!.id
    if (args.length === 0) {
      await ctx.reply(
        '🔗 Link your Polymarket profile to your Telegram account.\n\n' +
        'Usage:\n' +
        '• /link 0x<polymarket_address>\n' +
        '• /link https://polymarket.com/profile/0x...\n' +
        '• /link https://polymarket.com/@username\n' +
        '• /link @username\n\n' +
        'This allows commands like /stats and /profile_card to work without arguments.'
      )
      return
    }

    const input = args.join(' ').trim()
    const isAddress = /^0x[a-fA-F0-9]{40}$/.test(input)
    const looksLikeUrl = /^https?:\/\//i.test(input)

    try {
      if (isAddress) {
        await linkPolymarketAddress(userId, input)
        await ctx.reply('✅ Linked Polymarket address!\n\n💡 Try /profile_card to create your profile card.')
        return
      }

      if (looksLikeUrl) {
        const parsed = parsePolymarketProfile(input)
        if (parsed?.address) {
          await linkPolymarketAddress(userId, parsed.address)
          await ctx.reply('✅ Linked Polymarket address!\n\n💡 Try /profile_card to create your profile card.')
          return
        }
        if (parsed?.username) {
          await linkPolymarketUsername(userId, parsed.username)
          await ctx.reply(`✅ Linked Polymarket username @${parsed.username}!\n\n💡 Try /profile_card to create your profile card.`)
          return
        }
        // URL provided but couldn't parse
        await ctx.reply(
          '❌ Could not parse Polymarket profile URL.\n\n' +
          'Supported formats:\n' +
          '• https://polymarket.com/profile/0x...\n' +
          '• https://polymarket.com/@username'
        )
        return
      }

      // If starts with @, treat as Polymarket username
      if (input.startsWith('@')) {
        const username = input.slice(1)
        await linkPolymarketUsername(userId, username)
        await ctx.reply(`✅ Linked Polymarket username @${username}!\n\n💡 Try /profile_card to create your profile card.`)
        return
      }

      // Unknown format
      await ctx.reply(
        '❌ Unrecognized format.\n\n' +
        'Usage:\n' +
        '• /link 0x<address>\n' +
        '• /link https://polymarket.com/@username\n' +
        '• /link @username'
      )
    } catch (e:any) {
      logger.error('link command failed', { error: e?.message })
      await ctx.reply('❌ Failed to link. Please check the format and try again.')
    }
  })

  // Unlink command — remove all linked profiles
  bot.command('unlink', async (ctx) => {
    const userId = ctx.from!.id
    try {
      const removed = await unlinkAll(userId)
      if (removed > 0) {
        await ctx.reply('✅ Unlinked all profiles and reset your link settings.')
      } else {
        await ctx.reply('ℹ️ You had no linked profiles.')
      }
    } catch (e:any) {
      logger.error('unlink command failed', { error: e?.message })
      await ctx.reply('❌ Failed to unlink. Please try again.')
    }
  })

  // Stats command — show full profile for Polymarket
  bot.command('stats', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    const userId = ctx.from!.id
    const inputRaw = args.join(' ').trim()

    const replyUsage = async () => {
      await ctx.reply(
        '📊 Stats\n\n' +
        'Usage:\n' +
        '• /stats 0x<polymarket_address>\n' +
        '• /stats https://polymarket.com/profile/<address|@username>\n' +
        '• /stats <polymarket_username>\n\n' +
        'Tip: /link saves your profile so you can run /stats without arguments.'
      )
    }

    try {
      let mode: 'poly_address'|'poly_username'|null = null
      let polyAddress: string | undefined
      let polyUsername: string | undefined

      if (!inputRaw) {
        const linked = await getLinks(userId)
        if (!linked) { await replyUsage(); return }
        if (linked.polymarket_address) { mode = 'poly_address'; polyAddress = linked.polymarket_address }
        else if (linked.polymarket_username) { mode = 'poly_username'; polyUsername = linked.polymarket_username }
        else { await replyUsage(); return }
      } else {
        const input = inputRaw
        if (/^0x[a-fA-F0-9]{40}$/.test(input)) { mode = 'poly_address'; polyAddress = input }
        else if (/^https?:\/\//i.test(input)) {
          const parsed = parsePolymarketProfile(input)
          if (parsed?.address) { mode = 'poly_address'; polyAddress = parsed.address }
          else if (parsed?.username) { mode = 'poly_username'; polyUsername = parsed.username }
          else { await replyUsage(); return }
        } else if (/^[a-zA-Z0-9_\-]+$/.test(input)) {
          // Username; default to Polymarket username first
          polyUsername = input.replace(/^@/, '')
          mode = 'poly_username'
        } else {
          await replyUsage(); return
        }
      }

      // Resolve username -> address with robust fallbacks
      if (mode === 'poly_username' && polyUsername) {
        // 1) Leaderboard fuzzy search
        const results = await findWhaleFuzzy(polyUsername, 1)
        if (results.length && results[0]?.user_id) {
          polyAddress = results[0].user_id
        }
        // 2) Profile page resolution if not on leaderboard
        if (!polyAddress) {
          try {
            const addr = await resolveUsernameToAddress(polyUsername)
            if (addr) polyAddress = addr
          } catch {}
        }
      }

      if (!polyAddress && (mode === 'poly_address' || mode === 'poly_username')) {
        // Additional fuzzy attempt using raw input
        const results = await findWhaleFuzzy(polyUsername || inputRaw, 1)
        if (results.length && results[0]?.user_id) {
          polyAddress = results[0].user_id
        }
      }

      if (!polyAddress) {
        await ctx.reply('❌ Could not resolve a Polymarket address from the input. Try an address or profile URL.')
        return
      }

      await ctx.reply('⏳ Fetching profile...')

      // Fetch value, open and closed positions
      const [value, openPositions, closed] = await Promise.all([
        dataApi.getUserValue(polyAddress),
        dataApi.getUserPositions({ user: polyAddress, limit: 200 }),
        dataApi.getClosedPositions(polyAddress, 200)
      ])

      // Realized PnL from closed positions
      let realizedPnl = 0
      for (const p of closed) {
        const rp = (p as any).realizedPnl ?? (p as any).pnl ?? 0
        const n = typeof rp === 'number' ? rp : parseFloat(String(rp))
        if (!isNaN(n)) realizedPnl += n
      }

      // Unrealized PnL on opens (best-effort)
      let openInitial = 0
      let openCurrent = 0
      for (const p of openPositions) {
        const curRaw = (p as any).value ?? (p as any).currentValue ?? 0
        const initRaw = (p as any).initial_value ?? (p as any).initialValue ?? 0
        const cur = typeof curRaw === 'number' ? curRaw : parseFloat(String(curRaw))
        const init = typeof initRaw === 'number' ? initRaw : parseFloat(String(initRaw))
        if (!isNaN(cur)) openCurrent += cur
        if (!isNaN(init)) openInitial += init
      }
      const unrealizedPnl = openCurrent - openInitial

      // Top positions by current value
      const byValue = [...openPositions].sort((a,b)=>{
        const av = (a as any).value ?? (a as any).currentValue ?? 0
        const bv = (b as any).value ?? (b as any).currentValue ?? 0
        return (typeof bv==='number'?bv:parseFloat(String(bv))) - (typeof av==='number'?av:parseFloat(String(av)))
      }).slice(0,5)

      // Resolve market titles/links for top positions
      const uniqueMarkets = Array.from(new Set(byValue.map(p=>p.market))).slice(0,5)
      const marketMap = new Map<string, any>()
      for (const m of uniqueMarkets) {
        try {
          const mk = await gammaApi.getMarket(m as any)
          marketMap.set(m, mk)
        } catch {}
      }

      // Try to enrich from leaderboard
      let leaderboardLine = ''
      try {
        const lb = await findWhaleFuzzy(polyAddress, 1)
        if (lb.length) {
          const e = lb[0]
          const pnlNum = Math.round(e.pnl)
          leaderboardLine = `Rank: #${e.rank}  •  Leaderboard PnL: ${pnlNum >= 0 ? '+' : '-'}$${Math.abs(pnlNum).toLocaleString()}\n`
        }
      } catch {}

      const short = polyAddress.slice(0,6)+'...'+polyAddress.slice(-4)
      const profileUrl = getPolymarketProfileUrl(undefined, polyAddress)
      const valNum = parseFloat(value.value || '0')
      const realized = Math.round(realizedPnl)
      const unrealized = Math.round(unrealizedPnl)
      const realizedStr = `${realized >= 0 ? '+' : '-'}$${Math.abs(realized).toLocaleString()}`
      const unrealizedStr = `${unrealized >= 0 ? '+' : '-'}$${Math.abs(unrealized).toLocaleString()}`
      const roiStr = openInitial > 0 ? `${(((openCurrent - openInitial)/openInitial)*100).toFixed(1)}%` : '—'

      let msg = `👤 Polymarket Profile\n` +
        `Address: ${short}\n` +
        `🔗 ${profileUrl}\n\n` +
        (leaderboardLine ? leaderboardLine + '\n' : '') +
        `Portfolio Value: $${Math.round(valNum).toLocaleString()}\n` +
        `Open Positions: ${openPositions.length}  •  Closed: ${closed.length}\n` +
        `Unrealized PnL: ${unrealizedStr}  •  ROI: ${roiStr}\n` +
        `Realized PnL: ${realizedStr}\n\n`

      if (byValue.length) {
        msg += 'Top Positions:\n'
        for (const p of byValue) {
          const mk = marketMap.get(p.market)
          const title = mk?.question ? mk.question.slice(0,90) + (mk.question.length>90?'...':'') : p.market
          const url = mk ? getPolymarketMarketUrl(mk) : null
          const pv = (p as any).value ?? (p as any).currentValue ?? 0
          const piv = (p as any).initial_value ?? (p as any).initialValue ?? 0
          const v = Math.round(typeof pv==='number' ? pv : parseFloat(String(pv)) || 0)
          const iv = Math.round(typeof piv==='number' ? piv : parseFloat(String(piv)) || 0)
          const upnl = v - iv
          const upnlStr = `${upnl>=0?'+':'-'}$${Math.abs(upnl).toLocaleString()}`
          msg += `• ${title}\n   Value: $${v.toLocaleString()}  •  uPnL: ${upnlStr}${url?`\n   🔗 ${url}`:''}\n`
        }
        msg += '\n'
      }

      msg += '💡 Link your profile with /link to reuse it here.'

      await ctx.reply(msg)
    } catch (e:any) {
      logger.error('stats command failed', { error: e?.message })
      await ctx.reply('❌ Failed to fetch stats. Please try again with an address or profile URL.')
    }
  })

  // Price command
  bot.command('price', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      await ctx.reply(
        'Usage:\n' +
        '• /price <market_slug> — e.g., /price trump-2024\n' +
        '• /price 0x<market_id> — direct market lookup\n' +
        '• /price <search_term> — search by keywords\n\n' +
        'Tip: Use /markets to find market slugs'
      );
      return;
    }

    const query = args.join(' ');
    const userId = ctx.from?.id;
    logger.info('Price command', { userId, query });

    try {
      await ctx.reply('🔍 Loading market...');

      // Check if it's a condition ID
      const looksLikeCond = /^0x[a-fA-F0-9]{64}$/.test(query);
      let market: any = null;

      if (looksLikeCond) {
        // Direct lookup by condition ID
        try {
          market = await gammaApi.getMarket(query);
          logger.info('price: resolved by condition id', { conditionId: query });
        } catch (e: any) {
          logger.error('price: getMarket failed', { conditionId: query, error: e?.message });
        }
      } else {
        // Try as slug or search
        try {
          market = await findMarket(query);
          logger.info('price: resolved by search/slug', { query, conditionId: market?.condition_id });
        } catch (e: any) {
          logger.error('price: findMarket failed', { query, error: e?.message });
        }
      }

      if (!market) {
        await ctx.reply(
          `❌ No match for "${query}"\n\n` +
          'Try instead:\n' +
          '• /markets to browse trending\n' +
          '• Different keywords (e.g., "election")\n' +
          '• Full market ID (0x...)'
        );
        return;
      }

      // Extract price data
      const question = market.question || 'Unknown market';
      const conditionId = market.condition_id || market.conditionId;

      // Parse outcome prices
      let outcomes: { outcome: string; price: number }[] = [];

      // Try to get prices from tokens array
      if (Array.isArray(market.tokens) && market.tokens.length > 0) {
        outcomes = market.tokens.map((t: any) => ({
          outcome: t.outcome || 'Unknown',
          price: parseFloat(t.price || '0')
        }));
      }
      // Try to parse from outcomePrices string
      else if (market.outcomePrices || market.outcomes) {
        try {
          const prices = typeof market.outcomePrices === 'string'
            ? JSON.parse(market.outcomePrices)
            : market.outcomePrices;
          const outcomeNames = typeof market.outcomes === 'string'
            ? JSON.parse(market.outcomes)
            : market.outcomes;

          if (Array.isArray(prices) && Array.isArray(outcomeNames)) {
            outcomes = outcomeNames.map((name: string, i: number) => ({
              outcome: name,
              price: parseFloat(prices[i] || '0')
            }));
          }
        } catch (parseErr) {
          logger.error('price: failed to parse outcomes', { error: parseErr });
        }
      }

      if (outcomes.length === 0) {
        await ctx.reply('⚠️ This market doesn\'t have price data yet. Try /markets for active markets.');
        return;
      }

      // Format volume and liquidity
      const volNum = typeof market.volume === 'number' ? market.volume : parseFloat(market.volume || '0');
      const volume = isNaN(volNum) ? 'N/A' : `$${(volNum / 1_000_000).toFixed(2)}M`;

      const liqNum = typeof market.liquidity === 'number' ? market.liquidity : parseFloat(market.liquidity || '0');
      const liquidity = isNaN(liqNum) ? 'N/A' : `$${(liqNum / 1_000_000).toFixed(2)}M`;

      // Format end date
      const endDateIso = market.end_date_iso || market.endDateIso || market.endDate || market.end_date;
      const endDate = endDateIso ? new Date(endDateIso).toLocaleDateString() : 'N/A';

      // Build message
      let message = `📊 ${question}\n\n`;

      // Prices
      message += '💰 Current Prices:\n';
      outcomes.forEach(({ outcome, price }) => {
        const pricePercent = (price * 100).toFixed(1);
        const bar = '▰'.repeat(Math.floor(price * 10)) + '▱'.repeat(10 - Math.floor(price * 10));
        message += `   ${outcome}: ${pricePercent}% ${bar}\n`;
      });

      message += `\n📈 Volume: ${volume}\n`;
      message += `🧊 Liquidity: ${liquidity}\n`;
      message += `📅 Ends: ${endDate}\n\n`;

      // Add market URL from API
      const marketUrl = getPolymarketMarketUrl(market);
      if (marketUrl) {
        message += `🔗 Trade: ${marketUrl}\n`;
      }

      if (conditionId) {
        message += `\n💡 Follow price alerts:\n/follow ${conditionId}`;
      }

      await ctx.reply(message);

    } catch (error: any) {
      logger.error('Error in price command', { error: error?.message || error });
      await ctx.reply('❌ Unable to load market data. Try another market or use /markets to browse.');
    }
  });

  // (removed) search command — use /markets [query] and /whales [0x<market_id>|query]

  // (removed) subscribe command

  // (removed) unsubscribe command — use /unfollow instead

  // (removed) whale command

  // Whales leaderboard (global, by market, or search)
  bot.command('whales', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    const looksLikeCond = (s: string) => /^0x[a-fA-F0-9]{64}$/.test(s)
    const minBalanceDefault = 50
    let minBalance = minBalanceDefault

    try {
      // Case A: no args — global leaderboard
      if (args.length === 0) {
        // Use Polymarket leaderboard API for top whales (much faster!)
        await ctx.reply('🔍 Loading top traders...')
        try {
          logger.info('whales: fetching leaderboard (limit=10)')
          let leaderboard = await dataApi.getLeaderboard({ limit: 10 })
          logger.info('whales: leaderboard returned', { count: leaderboard.length })

          // Soft retry once if empty (transient bot protections)
          if (leaderboard.length === 0) {
            await new Promise(r => setTimeout(r, 400));
            logger.info('whales: retrying leaderboard fetch')
            leaderboard = await dataApi.getLeaderboard({ limit: 10 })
            logger.info('whales: retry returned', { count: leaderboard.length })
          }

          if (leaderboard.length === 0) {
            // Fallback: aggregate top holders across trending markets
            try {
              logger.info('whales: fallback via trending markets + top holders')
              const trending = await gammaApi.getTrendingMarkets(3)
              const uniq = new Map<string, number>() // address -> max balance seen
              for (const m of (trending || [])) {
                const cond = (m as any)?.condition_id || (m as any)?.conditionId
                if (!cond) continue
                try {
                  const holders = await dataApi.getTopHolders({ market: cond, limit: 20, minBalance })
                  holders.forEach((t:any)=>t.holders.forEach((h:any)=>{
                    const bal = parseFloat(h.balance || '0')
                    if (!isNaN(bal)) uniq.set(h.address, Math.max(uniq.get(h.address) || 0, bal))
                  }))
                } catch (e:any) {
                  logger.error('whales: fallback holders failed', { cond, error: e?.message })
                }
              }
              const top = Array.from(uniq.entries()).sort((a,b)=>b[1]-a[1]).slice(0, 10)
              if (top.length === 0) {
                await ctx.reply('❌ Unable to load leaderboard right now. Try a specific market: `/whales 0x<market_id>`\n\nBrowse: https://polymarket.com/leaderboard', { parse_mode: 'Markdown' })
                return
              }
              let msg = '🐋 Top Traders (fallback)\n\n'
              const keyboard: { text: string; callback_data: string }[][] = []
              const addresses: string[] = []
              let i = 0
              for (const [addr, bal] of top) {
                i += 1
                const short = addr.slice(0,6)+'...'+addr.slice(-4)
                const profileUrl = getPolymarketProfileUrl(null, addr)
                msg += `${i}. ${short}\n`
                msg += `   Est. Balance: ${Math.round(bal)}\n`
                msg += `   🔗 ${profileUrl}\n`
                try {
                  const tok = await actionFollowWhaleAll(addr)
                  keyboard.push([{ text: `Follow ${i}`, callback_data: `act:${tok}` }])
                  addresses.push(addr)
                } catch {}
                msg += '\n'
              }
              try { const tokAll = await actionFollowWhaleAllMany(addresses); keyboard.push([{ text: 'Follow All (Top 10)', callback_data: `act:${tokAll}` }]) } catch {}
              msg += '💡 Tip: Use /whales 0x<market_id> for market-specific whales.'
              await ctx.reply(msg, { reply_markup: { inline_keyboard: keyboard } as any })
              return
            } catch (e:any) {
              logger.error('whales: fallback trending+holders failed', { error: e?.message })
              await ctx.reply('❌ Unable to load leaderboard right now. Try a specific market: `/whales 0x<market_id>`\n\nBrowse: https://polymarket.com/leaderboard', { parse_mode: 'Markdown' })
              return
            }
          }

          let msg = '🐋 Top Traders (by PnL)\n\n'
          const keyboard: { text: string; callback_data: string }[][] = []
          const addresses: string[] = []
          let i = 0
          for (const entry of leaderboard) {
            i += 1
            const short = entry.user_id.slice(0,6)+'...'+entry.user_id.slice(-4)
            const name = entry.user_name || 'Anonymous'
            const pnl = entry.pnl > 0 ? `+$${Math.round(entry.pnl).toLocaleString()}` : `-$${Math.abs(Math.round(entry.pnl)).toLocaleString()}`
            const vol = `$${Math.round(entry.vol).toLocaleString()}`
            const profileUrl = getPolymarketProfileUrl(entry.user_name, entry.user_id)
            msg += `${i}. ${name} (${short})\n`
            msg += `   ID: ${entry.user_id}\n`
            msg += `   💰 PnL: ${pnl} | Vol: ${vol}\n`
            msg += `   🔗 ${profileUrl}\n`
            msg += `   ${'<code>'+esc(`/follow ${entry.user_id}`)+'</code>'}\n\n`
            addresses.push(entry.user_id)
            try {
              const tok = await actionFollowWhaleAll(entry.user_id)
              keyboard.push([{ text: `Follow ${i}`, callback_data: `act:${tok}` }])
            } catch {}
          }
          try {
            const tokAll = await actionFollowWhaleAllMany(addresses)
            keyboard.push([{ text: 'Follow All (Top 10)', callback_data: `act:${tokAll}` }])
          } catch {}
          msg += '💡 Tip: For a specific market, run <code>/whales &lt;market_id&gt;</code> to list whales there with a market-specific follow command.'
          await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } as any })
          return
        } catch (e: any) {
          logger.error('whales: leaderboard failed', { error: e?.message })
          await ctx.reply('❌ Unable to load leaderboard. Try a specific market: `/whales 0x<market_id>`', { parse_mode: 'Markdown' })
          return
        }
      }

      // By market or fallback to whale search
      const q = args.join(' ')
      const first = args[0]
      let market: any = null
      try { market = looksLikeCond(first) ? await gammaApi.getMarket(first) : await findMarket(q) } catch {}
      if (!market) {
        await ctx.reply('🔍 Searching top traders...')
        try {
          // Normalize input and try to resolve username/profile URL to address
          let addr: string | undefined
          const looksAddr = /^0x[a-fA-F0-9]{40}$/
          if (looksAddr.test(q)) {
            addr = q.toLowerCase()
          } else {
            try {
              const parsed = parsePolymarketProfile(q)
              if (parsed?.address) {
                addr = parsed.address.toLowerCase()
              } else {
                const uname = (parsed?.username || q).replace(/^@/, '')
                if (uname && uname.length >= 2) {
                  addr = await resolveUsernameToAddress(uname)
                }
              }
            } catch {}
          }

          // Fuzzy search by name/id (leaderboard)
          const results = await findWhaleFuzzy(q.replace(/^@/, ''), 5)

          if (results.length > 0) {
            let message = `🐋 Search Results (${results.length})\n\n`
            const keyboard: { text: string; callback_data: string }[][] = []
            for (let i=0;i<results.length;i++) {
              const whale = results[i]
              const name = whale.user_name || 'Anonymous'
              const short = whale.user_id.slice(0,6)+'...'+whale.user_id.slice(-4)
              const pnl = whale.pnl > 0 ? `+$${Math.round(whale.pnl).toLocaleString()}` : `-$${Math.abs(Math.round(whale.pnl)).toLocaleString()}`
              const vol = `$${Math.round(whale.vol).toLocaleString()}`
              const profileUrl = getPolymarketProfileUrl(whale.user_name, whale.user_id)
              message += `${i+1}. ${name} (${short})\n`
              message += `   ID: ${whale.user_id}\n`
              message += `   💰 PnL: ${pnl} | Vol: ${vol}\n`
              message += `   Rank: #${whale.rank}\n`
              message += `   🔗 ${profileUrl}\n\n`
              try { const tok = await actionFollowWhaleAll(whale.user_id); keyboard.push([{ text: `Follow ${i+1}`, callback_data: `act:${tok}` }]) } catch {}
            }
            message += '💡 Use /whales for global leaderboard or add a market id to scope.'
            await ctx.reply(message, { reply_markup: { inline_keyboard: keyboard } as any })
            return
          }

          // If fuzzy empty but an address resolved, show a direct result
          if (addr) {
            const short = addr.slice(0,6)+'...'+addr.slice(-4)
            const url = getPolymarketProfileUrl(null, addr)
            let message = `🐋 Trader Found\n\n`
            message += `ID: ${addr}\n`
            message += `🔗 ${url}\n\n`
            const keyboard: { text: string; callback_data: string }[][] = []
            try { const tok = await actionFollowWhaleAll(addr); keyboard.push([{ text: `Follow ${short} (All)`, callback_data: `act:${tok}` }]) } catch {}
            await ctx.reply(message, { reply_markup: { inline_keyboard: keyboard } as any })
            return
          }

          await ctx.reply('❌ No traders match your query. Try different keywords or use /whales for leaderboard.')
          return
        } catch (e:any) {
          logger.error('whales: search fallback failed', { error: e?.message })
          await ctx.reply('❌ Unable to search traders. Try again later or use /whales for leaderboard.')
          return
        }
      }
      await ctx.reply('🔍 Loading market whales...')
      const holders = await dataApi.getTopHolders({ market: market.condition_id, limit: 20, minBalance })
      const uniq = new Map<string, number>()
      holders.forEach((t)=>t.holders.forEach((h)=>{
        const bal = parseFloat(h.balance || '0')
        if (!isNaN(bal)) uniq.set(h.address, Math.max(uniq.get(h.address) || 0, bal))
      }))
      const whales = Array.from(uniq.entries()).sort((a,b)=>b[1]-a[1]).slice(0,10)
      if (whales.length === 0) {
        await ctx.reply('❌ No whales found for this market.')
        return
      }
      // Build URL - strip date suffixes for grouped markets and numeric suffixes
      let marketSlug = market.slug || market.market_slug || '';
      marketSlug = marketSlug.replace(/-(january|february|march|april|may|june|july|august|september|october|november|december)-\d+$/i, '');
      marketSlug = marketSlug.replace(/-\d+$/, '');
      let msg = `🐋 Whales — ${market.question}\n`;
      if (marketSlug) {
        msg += `🔗 https://polymarket.com/event/${marketSlug}\n`;
      }
      msg += '\n';
      const keyboard: { text: string; callback_data: string }[][] = []
      whales.forEach(async ([addr, bal], i) => {
        const short = addr.slice(0,6)+'...'+addr.slice(-4)
        const profileUrl = getPolymarketProfileUrl(null, addr)
        msg += `${i+1}. ${short}  — balance: ${Math.round(bal)}\n`
        msg += `   ID: ${addr}\n`
        msg += `   🔗 ${profileUrl}\n`
        msg += `   ${'<code>'+esc(`/follow ${addr}`)+'</code>'}\n`
        msg += `   ${'<code>'+esc(`/follow ${addr} ${market.condition_id}`)+'</code>'}\n`
        try {
          const tokAll = await actionFollowWhaleAll(addr)
          const tokHere = await actionFollowWhaleMarket(addr, market.condition_id, market.question)
          keyboard.push([
            { text: `Follow ${short} (All)`, callback_data: `act:${tokAll}` },
            { text: `Here`, callback_data: `act:${tokHere}` },
          ])
        } catch {}
      })
      msg += `\n💡 Follow market price: <code>${esc(`/follow ${market.condition_id}`)}</code>`
      try {
        const tokMarket = await actionFollowMarket(market.condition_id, market.question)
        const kb = { inline_keyboard: [...keyboard, [{ text: 'Follow Market Price', callback_data: `act:${tokMarket}` }]] }
        await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: kb as any })
      } catch {
        await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } as any })
      }
    } catch (err) {
      logger.error('Error in whales command', err)
      await ctx.reply('❌ Unable to load whales. Try /markets for active markets or check your connection.')
    }
  })

  // Net positions by user for a market
  bot.command('net', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    if (args.length === 0) {
      await ctx.reply('Usage: /net <market_url|id|slug> — shows per-user net positions (top holders sample).')
      return
    }
    const query = args.join(' ')
    try {
      await ctx.reply('🔍 Loading market and holders...')
      const market = await resolveMarketFromInput(query)
      if (!market) { await ctx.reply('❌ Market not found. Try a full URL, ID (0x...), or slug.'); return }
      const conditionId = market.condition_id || market.conditionId
      const holdersRes = await dataApi.getTopHolders({ market: conditionId, limit: 100, minBalance: 10 })
      if (!holdersRes?.length) { await ctx.reply('❌ No holder data available for this market.'); return }

      // Build address -> outcome balances
      type AddrPos = { [outcome: string]: number }
      const byAddr = new Map<string, AddrPos>()
      const outcomeNames = new Map<string,string>() // token -> outcome
      for (const t of market.tokens || []) outcomeNames.set(t.token_id, t.outcome || '')
      holdersRes.forEach((token) => {
        const out = market.tokens?.find((t:any)=>t.token_id===token.token)
        const outcome = out?.outcome || token.token
        token.holders.forEach((h)=>{
          const bal = parseFloat(h.balance || '0')
          if (isNaN(bal) || bal===0) return
          const cur = byAddr.get(h.address) || {}
          cur[outcome] = (cur[outcome] || 0) + bal
          byAddr.set(h.address, cur)
        })
      })

      // Compute net = largest - sum(others)
      const scored: Array<{ addr: string; net: number; dominant: string; breakdown: string }>=[]
      for (const [addr, pos] of byAddr.entries()) {
        const entries = Object.entries(pos)
        if (!entries.length) continue
        entries.sort((a,b)=>b[1]-a[1])
        const top = entries[0]
        const others = entries.slice(1).reduce((s,[,v])=>s+v,0)
        const net = top[1] - others
        const breakdown = entries.map(([k,v])=>`${k}:${Math.round(v)}`).join(' ')
        scored.push({ addr, net, dominant: top[0], breakdown })
      }
      scored.sort((a,b)=>Math.abs(b.net)-Math.abs(a.net))
      const topN = scored.slice(0,10)

      const url = getPolymarketMarketUrl(market)
      let msg = `🧮 Net Positions — ${market.question}\n`
      if (url) msg += `🔗 ${url}\n`
      msg += `Sampled top holders across outcomes.\n\n`
      if (!topN.length) { msg += 'No holder positions to display.'; await ctx.reply(msg); return }
      topN.forEach((r,i)=>{
        const short = r.addr.slice(0,6)+'...'+r.addr.slice(-4)
        const prof = getPolymarketProfileUrl(null, r.addr)
        msg += `${i+1}. ${short} — Net ${r.net>=0?'+':''}${Math.round(r.net)} (${r.dominant})\n   ${r.breakdown}\n   🔗 ${prof}\n`
      })
      await ctx.reply(msg)
    } catch (e) {
      logger.error('net command failed', e)
      await ctx.reply('❌ Failed to load net positions. Try again later.')
    }
  })

  // Overview: positions by side with pricing + orderbook summary (public data)
  bot.command('overview', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    if (args.length === 0) {
      await ctx.reply('Usage: /overview <market_url|id|slug> — shows totals per side, holders, and current pricing.')
      return
    }
    const query = args.join(' ')
    try {
      await ctx.reply('🔍 Loading market overview...')
      const market = await resolveMarketFromInput(query)
      if (!market) { await ctx.reply('❌ Market not found. Try a full URL, ID (0x...), or slug.'); return }
      const conditionId = market.condition_id || market.conditionId
      const holdersRes = await dataApi.getTopHolders({ market: conditionId, limit: 100, minBalance: 10 })
      if (!holdersRes?.length) { await ctx.reply('❌ No holder data available for this market.'); return }

      // Build outcome totals and holders
      type Side = { outcome: string; tokenId: string; holders: number; totalBalance: number; price: number|null; bid?: number|null; ask?: number|null; spread?: number|null; depthBid?: number; depthAsk?: number }
      const sides: Side[] = []
      for (const token of market.tokens || []) {
        const set = holdersRes.find(h=>h.token===token.token_id)
        const holdersCount = set ? set.holders.length : 0
        const totalBalance = set ? set.holders.reduce((s,h)=>s + (parseFloat(h.balance||'0')||0), 0) : 0
        let price: number|null = null
        let bid: number|null = null
        let ask: number|null = null
        let spread: number|null = null
        let depthBid = 0
        let depthAsk = 0
        try {
          const book = await clobApi.getOrderbook(token.token_id)
          bid = book.bids?.length ? parseFloat(book.bids[0].price) : null
          ask = book.asks?.length ? parseFloat(book.asks[0].price) : null
          spread = bid!=null && ask!=null ? ask - bid : null
          // Sum top-5 depth (shares)
          depthBid = (book.bids || []).slice(0,5).reduce((s,l)=>s + (parseFloat(l.size||'0')||0), 0)
          depthAsk = (book.asks || []).slice(0,5).reduce((s,l)=>s + (parseFloat(l.size||'0')||0), 0)
          if (bid!=null && ask!=null) price = (bid+ask)/2
        } catch {}
        if (price==null) {
          const p = parseFloat(token.price || 'NaN'); if (!isNaN(p)) price = p
        }
        sides.push({ outcome: token.outcome || token.token_id, tokenId: token.token_id, holders: holdersCount, totalBalance, price, bid, ask, spread, depthBid, depthAsk })
      }

      const url = getPolymarketMarketUrl(market)
      let msg = `📘 Market Overview — ${market.question}\n`
      if (url) msg += `🔗 ${url}\n`
      msg += `Based on top holders sample; totals are approximate.\n\n`

      for (const s of sides) {
        const val = (s.price!=null) ? Math.round(s.totalBalance * s.price) : null
        const spreadPct = (s.spread!=null && s.price!=null) ? `${((s.spread/s.price)*100).toFixed(2)}%` : '—'
        const bidStr = s.bid!=null ? `${(s.bid*100).toFixed(1)}%` : '—'
        const askStr = s.ask!=null ? `${(s.ask*100).toFixed(1)}%` : '—'
        msg += `• ${s.outcome}: holders ${s.holders}, shares ~${Math.round(s.totalBalance)}${s.price!=null?`, mid ${(s.price*100).toFixed(1)}%`:''}${val!=null?`, value ~$${val.toLocaleString()}`:''}\n`
        msg += `   OB: bid ${bidStr} (${Math.round(s.depthBid||0)} sh) | ask ${askStr} (${Math.round(s.depthAsk||0)} sh) | spread ${s.spread!=null?(s.spread*100).toFixed(1)+'%':'—'} (${spreadPct})\n`
      }

      msg += '\nAverage entry & realized PnL for all users are not public. Summary uses order book data and top-holder aggregates.'

      await ctx.reply(msg)
    } catch (e) {
      logger.error('overview command failed', e)
      await ctx.reply('❌ Failed to load overview. Try again later.')
    }
  })

  // List subscriptions command
  bot.command('list', async (ctx) => {
    const userId = ctx.from!.id;
    logger.info('List command', { userId });

    try {
      const { getUserRows } = await import('../services/subscriptions')
      const rows = await getUserRows(userId)
      if (rows.length === 0) {
        await ctx.reply('📭 No follows yet! Get started:\n\n• /markets — Browse markets\n• /whales — Find top traders\n• /follow <market_id> — Set up alerts')
        return
      }
      let i=0
      let msg = '📋 Your Follows\n\n'
      const keyboard: { text: string; callback_data: string }[][] = []
      for (const r of rows) {
        i+=1
        const mid = r.market_condition_id || '—'
        if (r.type === 'market') {
          msg += `${i}. 📈 ${r.market_name}\n   Market ID: ${mid}\n   ➖ Unfollow: /unfollow ${mid}\n\n`
          try {
            const tok = await actionUnfollowMarket({ tokenId: r.token_id || undefined, conditionId: r.market_condition_id || undefined, marketName: r.market_name })
            keyboard.push([{ text: `Unfollow ${i}`, callback_data: `act:${tok}` }])
          } catch {}
        } else if (r.type === 'whale_all') {
          const w = r.address_filter ? r.address_filter : 'wallet'
          const short = w.length > 10 ? w.slice(0,6)+'...'+w.slice(-4) : w
          msg += `${i}. 🐋 ${short} — ALL markets\n   ➖ Unfollow: /unfollow ${w}\n\n`
          try {
            if (r.address_filter) {
              const tok = await actionUnfollowWhaleAll(r.address_filter)
              keyboard.push([{ text: `Unfollow ${i}`, callback_data: `act:${tok}` }])
            }
          } catch {}
        } else {
          const w = r.address_filter ? r.address_filter : 'wallet'
          const short = w.length > 10 ? w.slice(0,6)+'...'+w.slice(-4) : w
          msg += `${i}. 🐋 ${r.market_name} — ${short}\n   Market ID: ${mid}\n   ➖ Unfollow: /unfollow ${w} ${mid}\n\n`
          try {
            if (r.address_filter) {
              const tok = await actionUnfollowWhaleMarket({ address: r.address_filter, tokenId: r.token_id || undefined, conditionId: r.market_condition_id || undefined, marketName: r.market_name })
              keyboard.push([{ text: `Unfollow ${i}`, callback_data: `act:${tok}` }])
            }
          } catch {}
        }
      }
      await ctx.reply(msg, { reply_markup: { inline_keyboard: keyboard } as any })
    } catch (error) {
      logger.error('Error in list command', error);
      await ctx.reply('❌ Unable to load your follows. Please try again or contact support if this persists.');
    }
  });

  // Deprecated command
  bot.command('whales_top', async (ctx) => {
    await ctx.reply(`⚠️ This command is deprecated. Use /whales to see the global leaderboard or /whales <market_id> to see whales for a specific market.`)
  })

  // Status command - Check WebSocket connection
  bot.command('status', async (ctx) => {
    logger.info('Status command', { userId: ctx.from?.id });

    try {
      const status = wsMonitor.getStatus();

      const eta = !status.connected && status.nextReconnectInMs != null
        ? `${Math.ceil(status.nextReconnectInMs/1000)}s`
        : null

      const message =
        '🔌 WebSocket Status\n\n' +
        `Connection: ${status.connected ? '✅ Connected' : '❌ Disconnected'}\n` +
        `Active market subscriptions: ${status.marketSubscriptions}\n` +
        `Active whale subscriptions: ${status.whaleSubscriptions}\n` +
        `Total users monitoring: ${status.totalUsers}\n` +
        (!status.connected
          ? `Reconnect attempt: ${status.reconnectAttempts}/${10}\n`
          : '') +
        (!status.connected && eta ? `Next reconnect in: ${eta}\n` : '') +
        (!status.connected && status.rateLimited ? 'Rate limit cooldown active ⏳\n' : '') +
        '\n' +
        (status.connected ? 'All systems operational! 🚀' : 'Attempting to reconnect...');

      await ctx.reply(message);
    } catch (error) {
      logger.error('Error in status command', error);
      await ctx.reply('❌ Unable to check status. Please try again.');
    }
  });

  // Markets command - Hot list or fuzzy search
  bot.command('markets', async (ctx) => {
    const userId = ctx.from?.id;
    const args = ctx.message.text.split(' ').slice(1)
    logger.info('Markets command', { userId, argsLen: args.length });

    try {
      // If a query is provided, perform fuzzy search
      if (args.length > 0) {
        const query = args.join(' ')
        await ctx.reply('🔍 Searching...')
        const results = await findMarketFuzzy(query, 5)
        if (!results.length) {
          await ctx.reply(`❌ No matches for "${query}"\n\nTry different keywords (e.g., "election") or run /markets to browse trending.`)
          return
        }
        let message = `🔍 Search Results (${results.length})\n\n`
        const keyboard: { text: string; callback_data: string }[][] = []
        for (let i=0;i<results.length;i++) {
          const market = results[i]
          const title = market.question || 'Untitled'
          const conditionId = market.condition_id || market.conditionId
          let priceStr = 'N/A'
          try {
            if (market.outcomePrices) {
              const prices = typeof market.outcomePrices === 'string' ? JSON.parse(market.outcomePrices) : market.outcomePrices
              if (Array.isArray(prices) && prices.length > 0) priceStr = `${(parseFloat(prices[0]) * 100).toFixed(1)}%`
            }
          } catch {}
          message += `${i+1}. ${title.slice(0,80)}${title.length>80?'...':''}\n`
          message += `   Price: ${priceStr}\n`
          const url = getPolymarketMarketUrl(market)
          if (url) message += `   🔗 ${url}\n`
          if (conditionId) {
            message += `   /price ${conditionId}\n`
            try { const tok = await actionFollowMarket(conditionId, title); keyboard.push([{ text: `Follow ${i+1}`, callback_data: `act:${tok}` }]) } catch {}
          }
          message += '\n'
        }
        message += '💡 Use /price <market_id> for details'
        await ctx.reply(message, { reply_markup: { inline_keyboard: keyboard } as any })
        return
      }

      await ctx.reply('🔍 Loading markets...');

      // Primary: active markets by volume
      let markets: any[] = []
      try {
        logger.info('markets: using gammaApi.getActiveMarkets(10, volume)')
        markets = await gammaApi.getActiveMarkets(10, 'volume')
        const c = Array.isArray(markets) ? markets.length : -1
        logger.info(`markets: gammaApi active returned count=${c} type=${typeof markets}`)
      } catch (inner: any) {
        logger.error('markets: gammaApi active failed', { error: inner?.message || String(inner) })
        // Fallback to direct fetch with timeout
        const url = 'https://gamma-api.polymarket.com/markets?active=true&limit=10&order=volume&ascending=false'
        logger.info('markets: fallback fetch (active by volume)', { url })
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), 7000);
        let res: Response
        try {
          res = await fetch(url, { signal: controller.signal, headers: { 'accept': 'application/json' } })
        } finally {
          clearTimeout(to)
        }
        logger.info('markets: fallback status', { status: res.status, ok: res.ok, contentType: res.headers.get('content-type') })
        if (!res.ok) {
          const text = await res.text().catch(() => '')
          logger.error('markets: fallback http error', { status: res.status, bodySnippet: text.slice(0, 200) })
          throw new Error(`gamma http ${res.status}`)
        }
        try {
          markets = await res.json()
          logger.info('markets: fallback parsed json', { count: Array.isArray(markets) ? markets.length : -1 })
        } catch (parseErr: any) {
          const text = await res.text().catch(() => '')
          logger.error('markets: json parse failed', { error: parseErr?.message, snippet: text.slice(0, 200) })
          throw parseErr
        }
      }

      // Normalize to array
      if (!Array.isArray(markets)) {
        logger.warn('markets: unexpected payload type; wrapping into array?')
        markets = markets ? [markets] as any : []
      }

      // Keep only ACTIVE markets with future end_date and real liquidity
      // Note: /markets endpoint doesn't include tokens array, so we can't filter on that here
      const before = markets.length
      const now = Date.now()
      const minLiquidity = parseFloat(process.env.MARKET_MIN_LIQUIDITY || '5000')
      let filtered = (markets || []).filter((m: any) => {
        const active = m?.active === true
        const closed = m?.closed === true
        const resolved = m?.resolved === true
        const archived = m?.archived === true
        const endIso = m?.end_date_iso || m?.endDateIso || m?.endDate || m?.end_date
        const endTime = endIso ? Date.parse(endIso) : NaN
        const futureEnd = Number.isFinite(endTime) && endTime > now
        const liq = parseFloat(m?.liquidity || '0')
        const hasLiq = !Number.isNaN(liq) && liq >= minLiquidity
        return active && !closed && !resolved && !archived && futureEnd && hasLiq
      })
      logger.info(`markets: filtered ACTIVE+futureEnd+liq>=${minLiquidity} before=${before} after=${filtered.length}`)
      if (filtered.length === 0 && before > 0) {
        // relax liquidity threshold
        const relaxedMin = 1000
        filtered = (markets || []).filter((m: any) => {
          const active = m?.active === true
          const closed = m?.closed === true
          const resolved = m?.resolved === true
          const archived = m?.archived === true
          const endIso = m?.end_date_iso || m?.endDateIso || m?.endDate || m?.end_date
          const endTime = endIso ? Date.parse(endIso) : NaN
          const futureEnd = Number.isFinite(endTime) && endTime > now
          const liq = parseFloat(m?.liquidity || '0')
          const hasLiq = !Number.isNaN(liq) && liq >= relaxedMin
          return active && !closed && !resolved && !archived && futureEnd && hasLiq
        })
        logger.info(`markets: relaxed liquidity>=${relaxedMin} result=${filtered.length}`)
      }
      markets = filtered

      // Secondary fallback: if empty, try trending as last resort and re-filter
      if (markets.length === 0) {
        try {
          logger.info('markets: trying gammaApi.getTrendingMarkets(5) as fallback')
          const alt = await gammaApi.getTrendingMarkets(5)
          markets = Array.isArray(alt) ? alt : []
          logger.info(`markets: trending fallback returned count=${markets.length}`)
          if (markets.length) {
            const minLiquidity2 = parseFloat(process.env.MARKET_MIN_LIQUIDITY || '5000')
            const now2 = Date.now()
            markets = markets.filter((m: any)=>{
              const active = m?.active === true
              const closed = m?.closed === true
              const resolved = m?.resolved === true
              const archived = m?.archived === true
              const endIso = m?.end_date_iso || m?.endDateIso || m?.endDate || m?.end_date
              const endTime = endIso ? Date.parse(endIso) : NaN
              const futureEnd = Number.isFinite(endTime) && endTime > now2
              const liq = parseFloat(m?.liquidity || '0')
              const hasLiq = !Number.isNaN(liq) && liq >= minLiquidity2
              return active && !closed && !resolved && !archived && futureEnd && hasLiq
            })
            logger.info(`markets: trending fallback filtered to ${markets.length}`)
          }
        } catch (e: any) {
          logger.error('markets: trending fallback failed', { error: e?.message })
        }
      }

      if (markets.length === 0) {
        await ctx.reply('❌ No active markets right now. Try /markets <query> to find specific markets.');
        return;
      }

      const escapeMd = (s: string) => s.replace(/[\\*_`\[\]()]/g, '\\$&')
      let message = '🔥 Hot Markets\n\n';
      const keyboard: { text: string; callback_data: string }[][] = []

      let idx = 0
      for (const market of markets as any[]) {
        idx += 1
        const title = escapeMd(String(market.question || 'Untitled market'))

        // Parse outcome prices from string array
        let priceNum = NaN
        try {
          const outcomePrices = market?.outcomePrices || market?.tokens?.[0]?.price
          if (typeof outcomePrices === 'string') {
            const prices = JSON.parse(outcomePrices)
            if (Array.isArray(prices) && prices.length > 0) {
              priceNum = parseFloat(prices[0])
            }
          } else if (typeof outcomePrices === 'number') {
            priceNum = outcomePrices
          }
        } catch {}
        const price = isNaN(priceNum) ? 'N/A' : (priceNum * 100).toFixed(1)

        const volNum = typeof market.volume === 'number' ? market.volume : parseFloat(market.volume || '0')
        const volM = isNaN(volNum) ? '—' : (volNum / 1_000_000).toFixed(1)
        const liqNum = typeof market.liquidity === 'number' ? market.liquidity : parseFloat(market.liquidity || '0')
        const liqM = isNaN(liqNum) ? '—' : (liqNum / 1_000_000).toFixed(2)

        // Get condition id (API uses camelCase conditionId)
        let cond: string | null = market?.conditionId || market?.condition_id || null
        if (!cond) {
          try {
            const via = market?.market_slug || market?.slug || title
            cond = await gammaApi.findConditionId(String(via))
          } catch {}
        }

        // Build market URL from API data (prefer events[0].slug)
        const url = getPolymarketMarketUrl(market)
        message += `${idx}. ${title}\n`
        message += `   📊 Price: ${price}%\n`
        message += `   💰 Volume: $${volM}M\n`
        message += `   🧊 Liquidity: $${liqM}M\n`
        if (url) { message += `   🔗 ${url}\n` }
        if (cond) {
          message += `   ➕ Follow: /follow ${cond}\n\n`
        } else {
          message += `   ➕ Follow: /follow <copy market id from event>\n\n`
        }
        // Add one-tap button per market when we have a condition id
        if (cond) {
          try {
            const tok = await actionFollowMarket(cond, market.question || 'Market')
            keyboard.push([{ text: `Follow ${idx}`, callback_data: `act:${tok}` }])
          } catch {}
        }
      }

      message +=
        '💡 How to follow:\n' +
        '• Tap a follow command above to insert it\n' +
        '• Or copy a market id (0x…) from the event\n' +
        '• Browse all: https://polymarket.com/markets';

      await ctx.reply(message, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } as any });
    } catch (error: any) {
      logger.error('Error in markets command', { error: error?.message || error })
      await ctx.reply(
        '❌ Could not fetch markets right now. Please try again soon.\n' +
          'Browse directly: https://polymarket.com/markets'
      );
    }
  });

  // (removed) test_push command

  // Follow command (standardized):
  // /follow 0x<market_id> => market price alerts
  // /follow 0x<wallet> => all whale trades (copy trading)
  // /follow 0x<wallet> 0x<market_id> => wallet whale alerts in specific market
  bot.command('follow', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    const userId = ctx.from!.id
    const looksLikeAddress = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s)
    const looksLikeCond = (s: string) => /^0x[a-fA-F0-9]{64}$/.test(s)

    // Case 1: Follow a market (price alerts)
    if (args.length === 1 && looksLikeCond(args[0])) {
      const marketId = args[0]
      try {
        await ctx.reply('⏳ Setting up price alerts...')
        const market = await gammaApi.getMarket(marketId)
        const now = Date.now()
        const endIso = (market as any)?.end_date_iso || (market as any)?.endDateIso || (market as any)?.endDate || (market as any)?.end_date
        const endTime = endIso ? Date.parse(endIso) : NaN
        // Only reject if explicitly closed/resolved or past end date
        const isClosed = (market as any)?.closed === true
        const isResolved = (market as any)?.resolved === true
        const isArchived = (market as any)?.archived === true
        const isPastEnd = Number.isFinite(endTime) && endTime < now
        if (isClosed || isResolved || isArchived || isPastEnd) {
          await ctx.reply('⚠️ This market is not active. Use /markets to choose an active market.');
          return
        }
        let tokenId = market?.tokens?.[0]?.token_id as string | undefined
        if (!tokenId) { await ctx.reply('❌ This market isn\'t ready for alerts yet. Try /markets for active markets.'); return }
        const ok = wsMonitor.subscribeToMarket(userId, tokenId, market.question, botConfig.websocket.priceChangeThreshold)
        if (!ok) { await ctx.reply('⚠️ You are already following this market.'); return }
        const { addMarketSubscription } = await import('../services/subscriptions')
        await addMarketSubscription(userId, tokenId, market.question, marketId, botConfig.websocket.priceChangeThreshold)
        await ctx.reply(`✅ Price alerts enabled! 🔔\n\nMarket: ${market.question}\n\nYou'll get notified when prices change significantly.`)
      } catch (e: any) {
        logger.error('follow market failed', { marketId, error: e?.message })
        await ctx.reply('❌ Failed to follow market. Use /follow 0x<market_id>.')
      }
      return
    }

    // Case 2: Follow a whale across ALL markets (copy trading)
    if (args.length === 1 && looksLikeAddress(args[0])) {
      const wallet = args[0]
      try {
        await ctx.reply('🔍 Setting up whale alerts...')
        // Subscribe to all whale trades (no specific market filter)
        const ok = wsMonitor.subscribeToWhaleTradesAll(userId, wallet, botConfig.websocket.whaleTrademinSize)
        if (!ok) {
          await ctx.reply('⚠️ You are already following this whale across all markets.');
          return
        }
        const { addWhaleSubscriptionAll } = await import('../services/subscriptions')
        await addWhaleSubscriptionAll(userId, wallet, botConfig.websocket.whaleTrademinSize)
        const shortAddr = wallet.slice(0, 6) + '...' + wallet.slice(-4)
        await ctx.reply(`✅ Following whale ${shortAddr} on all markets! 🔔\n\nYou'll get alerts on every trade they make.`)
      } catch (e: any) {
        logger.error('follow whale all failed', { wallet, error: e?.message })
        await ctx.reply('❌ Failed to follow whale. Use: /follow 0x<wallet_address>.')
      }
      return
    }

    // Case 3: Follow a whale on a specific market
    if (args.length === 2 && looksLikeAddress(args[0]) && looksLikeCond(args[1])) {
      const wallet = args[0]
      const marketId = args[1]
      try {
        await ctx.reply('⏳ Setting up whale alerts...')
        const market = await gammaApi.getMarket(marketId)
        const now = Date.now()
        const endIso = (market as any)?.end_date_iso || (market as any)?.endDateIso || (market as any)?.endDate || (market as any)?.end_date
        const endTime = endIso ? Date.parse(endIso) : NaN
        // Only reject if explicitly closed/resolved or past end date
        const isClosed = (market as any)?.closed === true
        const isResolved = (market as any)?.resolved === true
        const isArchived = (market as any)?.archived === true
        const isPastEnd = Number.isFinite(endTime) && endTime < now
        if (isClosed || isResolved || isArchived || isPastEnd) {
          await ctx.reply('⚠️ This market is not active. Use /markets to choose an active market.');
          return
        }
        let tokenId = market?.tokens?.[0]?.token_id as string | undefined
        if (!tokenId) { await ctx.reply('❌ Unable to resolve token for this market right now. Try again shortly.'); return }
        const ok = wsMonitor.subscribeToWhaleTrades(userId, tokenId, market.question, botConfig.websocket.whaleTrademinSize, wallet)
        if (!ok) { await ctx.reply('⚠️ You are already following this wallet in this market.'); return }
        const { addWhaleSubscription } = await import('../services/subscriptions')
        await addWhaleSubscription(userId, tokenId, market.question, botConfig.websocket.whaleTrademinSize, wallet, marketId)
        const shortAddr = wallet.slice(0, 6) + '...' + wallet.slice(-4)
        await ctx.reply(`✅ Following whale ${shortAddr} on this market! 🔔\n\nMarket: ${market.question}\n\nYou'll get alerts when they trade.`)
      } catch (e: any) {
        logger.error('follow wallet failed', { marketId, error: e?.message })
        await ctx.reply('❌ Failed to follow whale on this market. Use: /follow 0x<wallet> 0x<market_id>.')
      }
      return
    }

    await ctx.reply(
      '📖 Follow Command Usage:\n\n' +
      '🔔 Market price alerts:\n' +
      '• /follow 0x<market_id>\n\n' +
      '🐋 Copy whale trades:\n' +
      '• /follow 0x<wallet> — ALL markets\n' +
      '• /follow 0x<wallet> 0x<market_id> — specific market\n\n' +
      '💡 Get market IDs from /markets'
    )
  })

  // Unfollow (standardized)
  bot.command('unfollow', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    const userId = ctx.from!.id
    const isAddr = (s:string)=>/^0x[a-fA-F0-9]{40}$/.test(s)
    const isCond = (s:string)=>/^0x[a-fA-F0-9]{64}$/.test(s)

    // Case 1: Unfollow a market by market_id
    if (args.length===1 && isCond(args[0])) {
      const marketId = args[0]
      try {
        await ctx.reply('🔍 Looking up market...')
        const m = await gammaApi.getMarket(marketId)
        const tokenId = m?.tokens?.[0]?.token_id
        if (tokenId) {
          const ok = wsMonitor.unsubscribeFromMarket(userId, tokenId)
          const { removeMarketSubscription, removePendingMarketByCondition } = await import('../services/subscriptions')
          if (ok) await removeMarketSubscription(userId, tokenId)
          await removePendingMarketByCondition(userId, marketId)
          await ctx.reply(`✅ Price alerts disabled.\n\nMarket: ${m?.question || marketId}`)
        } else {
          const { removePendingMarketByCondition } = await import('../services/subscriptions')
          const removed = await removePendingMarketByCondition(userId, marketId)
          await ctx.reply(removed>0 ? `✅ Alerts disabled for pending market: ${m?.question || marketId}` : '⚠️ No follow found for this market. Use /list to see active follows.')
        }
      } catch (e:any) {
        logger.error('unfollow market failed', { marketId, error: e?.message })
        await ctx.reply('❌ Failed to unfollow. Ensure format: /unfollow 0x<market_id>.')
      }
      return
    }

    // Case 2: Unfollow a whale from ALL markets
    if (args.length===1 && isAddr(args[0])) {
      const wallet = args[0]
      try {
        const ok = wsMonitor.unsubscribeFromWhaleTradesAll(userId, wallet)
        const { removeWhaleSubscriptionAll } = await import('../services/subscriptions')
        await removeWhaleSubscriptionAll(userId, wallet)
        const shortAddr = wallet.slice(0, 6) + '...' + wallet.slice(-4)
        if (ok) {
          await ctx.reply(`✅ Stopped following whale ${shortAddr} on all markets.`)
        } else {
          await ctx.reply(`✅ Removed whale ${shortAddr} from pending follows.`)
        }
      } catch (e:any) {
        logger.error('unfollow whale all failed', { wallet, error: e?.message })
        await ctx.reply('❌ Failed to unfollow. Ensure format: /unfollow 0x<wallet_address>.')
      }
      return
    }

    // Case 3: Unfollow a whale from a specific market
    if (args.length===2 && isAddr(args[0]) && isCond(args[1])) {
      const wallet = args[0]
      const marketId = args[1]
      try {
        await ctx.reply('🔍 Looking up market...')
        const m = await gammaApi.getMarket(marketId)
        const tokenId = m?.tokens?.[0]?.token_id
        const { removeWhaleSubscription, removePendingWhaleByCondition } = await import('../services/subscriptions')
        if (tokenId) {
          const ok = wsMonitor.unsubscribeFromWhaleTrades(userId, tokenId)
          if (ok) await removeWhaleSubscription(userId, tokenId)
        }
        await removePendingWhaleByCondition(userId, marketId, wallet)
        const shortAddr = wallet.slice(0, 6) + '...' + wallet.slice(-4)
        await ctx.reply(`✅ Stopped following whale ${shortAddr}.\n\nMarket: ${m?.question || marketId}`)
      } catch (e:any) {
        logger.error('unfollow wallet failed', { marketId, error: e?.message })
        await ctx.reply('❌ Failed to unfollow. Ensure format: /unfollow 0x<wallet> 0x<market_id>.')
      }
      return
    }

    await ctx.reply(
      '📖 Unfollow Command Usage:\n\n' +
      '• /unfollow 0x<market_id> — stop market price alerts\n' +
      '• /unfollow 0x<wallet> — stop whale alerts (all markets)\n' +
      '• /unfollow 0x<wallet> 0x<market_id> — stop whale alerts (specific market)'
    )
  })

  // Daily tip command - Get daily rewards from Polymarket
  bot.command('daily_tip', async (ctx) => {
    logger.info('Daily_tip command', { userId: ctx.from?.id });

    try {
      await ctx.reply('🔍 Loading today\'s top reward...');

      const topReward = await getTopRewardMarket();

      if (!topReward) {
        await ctx.reply(
          'ℹ️ Unable to fetch reward markets right now.\n\n' +
            'Browse current rewards here:\n' +
            '• https://polymarket.com/rewards\n' +
            'Learn how liquidity rewards work:\n' +
            '• https://docs.polymarket.com/polymarket-learn/trading/liquidity-rewards'
        );
        return;
      }

      const message = formatRewardInfo(topReward);
      await ctx.reply(message, { parse_mode: 'Markdown' });

      logger.info('Daily_tip sent', {
        userId: ctx.from?.id,
        market: topReward.question,
        rewardRate: topReward.rewardRate,
      });
    } catch (error) {
      logger.error('Error in daily_tip command', error);
      await ctx.reply(
        '❌ Sorry, I encountered an error fetching reward data.\n\n' +
          'Please try again later or visit: https://polymarket.com/rewards'
      );
    }
  });

  // Removed /profile command per product direction focusing on flex cards

  // Profile card — generate a shareable image and send it
  bot.command('profile_card', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    const userId = ctx.from!.id
    let address: string | undefined // Declare outside try block for error logging
    try {
      // Reuse stats resolution for address
      let input = args.join(' ').trim()
      if (!input) {
        const linked = await getLinks(userId)
        if (linked?.polymarket_address) {
          address = linked.polymarket_address
        } else if (linked?.polymarket_username) {
          address = await resolveUsernameToAddress(linked.polymarket_username)
        }

        if (!address) {
          await ctx.reply(
            '❌ No linked Polymarket address found.\n\n' +
            'First link your address:\n' +
            '/link 0x<your_address>\n\n' +
            'Or create a profile card for anyone:\n' +
            '/profile_card 0x<address>\n' +
            '/profile_card @username'
          )
          return
        }
      } else if (/^0x[a-fA-F0-9]{40}$/.test(input)) {
        address = input
        logger.info({ input, address }, 'profile_card: Direct address provided')
      } else if (/^https?:\/\//i.test(input)) {
        const parsed = parsePolymarketProfile(input)
        logger.info({ input, parsed }, 'profile_card: Parsed URL')
        address = parsed?.address
        if (!address && parsed?.username) {
          logger.info({ username: parsed.username }, 'profile_card: Resolving username from URL via findWhaleFuzzy/resolve')
          const res = await findWhaleFuzzy(parsed.username, 1)
          address = res[0]?.user_id
          if (!address) {
            try { address = await resolveUsernameToAddress(parsed.username) } catch {}
          }
          logger.info({ username: parsed.username, results: res.length, address }, 'profile_card: Username resolution result')
        }
      } else {
        const username = input.replace(/^@/, '')
        logger.info({ input, username }, 'profile_card: Resolving username via findWhaleFuzzy/resolve')
        const res = await findWhaleFuzzy(username, 1)
        address = res[0]?.user_id
        if (!address) {
          try { address = await resolveUsernameToAddress(username) } catch {}
        }
        logger.info({ username, results: res.length, address, topResult: res[0] }, 'profile_card: Username resolution result')
      }

      if (!address) {
        logger.warn({ input, userId }, 'profile_card: Could not resolve address')
        await ctx.reply(
          '❌ Could not resolve Polymarket address.\n\n' +
          'Try:\n' +
          '• /profile_card 0x<address>\n' +
          '• /profile_card @username\n' +
          '• /profile_card <profile_url>'
        )
        return
      }

      logger.info({ address, userId }, 'profile_card: Starting card generation')
      await ctx.reply('⏳ Creating your profile card...')

      // Add timeout wrapper to prevent hanging
      const timeout = (ms: number) => new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), ms)
      )

      logger.info({ address }, 'profile_card: Fetching user data from APIs')
      const [value, positions, closed, lb] = await Promise.race([
        Promise.all([
          dataApi.getUserValue(address).catch(e => { logger.error({ err: e, address }, 'getUserValue failed'); throw e; }),
          dataApi.getUserPositions({ user: address, limit: 200 }).catch(e => { logger.error({ err: e, address }, 'getUserPositions failed'); throw e; }),
          dataApi.getClosedPositions(address, 200).catch(e => { logger.error({ err: e, address }, 'getClosedPositions failed'); throw e; }),
          findWhaleFuzzy(address, 1).catch(e => { logger.error({ err: e, address }, 'findWhaleFuzzy failed'); throw e; })
        ]),
        timeout(30000) // 30 second timeout
      ]) as any

      logger.info({
        address,
        valueData: value?.value,
        positionsCount: positions?.length,
        closedCount: closed?.length,
        lbCount: lb?.length
      }, 'profile_card: Data fetched successfully')

      let realized = 0
      for (const p of closed) {
        const rp = (p as any).realizedPnl ?? (p as any).pnl ?? 0
        const n = typeof rp === 'number' ? rp : parseFloat(String(rp))
        if (!isNaN(n)) realized += n
      }
      let openInitial = 0, openCurrent = 0
      for (const p of positions) {
        const curRaw = (p as any).value ?? (p as any).currentValue ?? 0
        const initRaw = (p as any).initial_value ?? (p as any).initialValue ?? 0
        const cur = typeof curRaw === 'number' ? curRaw : parseFloat(String(curRaw)) || 0
        const init = typeof initRaw === 'number' ? initRaw : parseFloat(String(initRaw)) || 0
        if (!isNaN(init)) openInitial += init
        if (!isNaN(cur)) openCurrent += cur
      }
      const unrealized = openCurrent - openInitial
      const pnlTotal = Math.round(realized + unrealized)
      const roi = openInitial>0 ? (((openCurrent-openInitial)/openInitial)*100).toFixed(1)+'%' : '—'
      const rank = lb.length ? String(lb[0].rank) : ''
      const pnlLb = lb.length ? ((lb[0].pnl>=0?'+':'-')+'$'+Math.abs(Math.round(lb[0].pnl)).toLocaleString()) : ''

      // Log success/failure of fetching user PNL
      if ((positions?.length ?? 0) === 0 && (closed?.length ?? 0) === 0) {
        logger.warn({ address, positions: positions?.length || 0, closed: closed?.length || 0 }, 'profile_card: No positions found; user PnL may be zero')
      }
      if (Number.isFinite(pnlTotal)) {
        logger.info({ address, realized, unrealized, pnlTotal }, 'profile_card: Successfully computed user PnL')
      } else {
        logger.error({ address, realized, unrealized, pnlTotal }, 'profile_card: Failed to compute user PnL')
      }

      const base = 'https://smtm.ai'
      const short = address.slice(0,6)+'...'+address.slice(-4)
      // Determine display name (prefer Polymarket username)
      const displayName = (Array.isArray(lb) && lb[0]?.user_name) ? lb[0].user_name : short
      const approxTotalUsers = 120000 // conservative public estimate; override as needed
      const url = `${base}/api/og/profile?address=${encodeURIComponent(address)}&username=${encodeURIComponent(displayName.startsWith('@')?displayName:'@'+displayName)}&title=${encodeURIComponent('Polymarket Profile')}`+
        `&pnl=${encodeURIComponent(String(pnlTotal))}`+
        `&value=${encodeURIComponent(value.value||'0')}&invested=${encodeURIComponent(String(Math.round(openInitial)))}`+
        `&realized=${encodeURIComponent((realized>=0?'+':'-')+'$'+Math.abs(Math.round(realized)).toLocaleString())}`+
        `&unrealized=${encodeURIComponent((unrealized>=0?'+':'-')+'$'+Math.abs(Math.round(unrealized)).toLocaleString())}`+
        `&roi=${encodeURIComponent(roi)}&rank=${encodeURIComponent(rank)}&pnlLb=${encodeURIComponent(pnlLb)}&total=${approxTotalUsers}`

      logger.info({ address, url, realized, unrealized, roi, rank }, 'profile_card: Generated image URL, fetching to verify')

      // Fetch the image first to verify it exists and is valid
      const imageResponse = await fetch(url)
      logger.info({
        address,
        status: imageResponse.status,
        contentType: imageResponse.headers.get('content-type'),
        contentLength: imageResponse.headers.get('content-length')
      }, 'profile_card: Image fetch response')

      if (!imageResponse.ok) {
        throw new Error(`Image generation failed: ${imageResponse.status} ${imageResponse.statusText}`)
      }

      const buffer = Buffer.from(await imageResponse.arrayBuffer())

      if (buffer.length === 0) {
        throw new Error('Image generation returned empty file')
      }

      logger.info({ address, imageSize: buffer.length }, 'profile_card: Image fetched successfully, sending to Telegram')

      await ctx.replyWithPhoto({ source: buffer }, { caption: `👤 Profile — ${short}\nView: https://polymarket.com/profile/${address}` })

      logger.info({ address }, 'profile_card: Successfully sent profile card')
    } catch (e: any) {
      logger.error({
        err: e,
        message: e?.message,
        stack: e?.stack,
        response: e?.response,
        code: e?.code,
        address,
        userId
      }, 'profile_card: Command failed with error')
      console.error('Full profile_card error:', e)
      const errorMsg = e?.message || String(e)
      if (errorMsg.includes('not found') || errorMsg.includes('404')) {
        await ctx.reply('❌ Profile not found. Make sure the address has activity on Polymarket.')
      } else if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
        await ctx.reply('❌ Request timed out. Please try again in a moment.')
      } else {
        await ctx.reply(
          '❌ Failed to create profile card.\n\n' +
          'This may happen if:\n' +
          '• The address has no Polymarket activity\n' +
          '• Polymarket API is temporarily unavailable\n' +
          '• The image generation service is down\n\n' +
          'Please try again in a moment.'
        )
      }
    }
  })

  // (removed) whale_card alias — use /profile_card for all profiles

  // Trade card (user crafts a flex card)
  // Usage: /trade_card <market> <yes|no> <stake_$> [entry_%] [current_%]
  bot.command('trade_card', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    if (args.length < 3) {
      await ctx.reply(
        'Create a trade card to flex your wins! 💪\n\n' +
        'Usage: /trade_card <market> <yes|no> <stake_$> [entry_%] [current_%]\n\n' +
        'Example:\n' +
        '/trade_card 0x123... yes 1000 65 72'
      )
      return
    }
    try {
      const side = args[1].toLowerCase()
      const stakeStr = args[2].replace(/[$,]/g,'')
      const stake = Number(stakeStr)
      if (!Number.isFinite(stake) || stake<=0) { await ctx.reply('❌ Invalid stake.'); return }
      const marketInput = args[0]
      const market = await resolveMarketFromInput(marketInput)
      if (!market) { await ctx.reply('❌ Market not found.'); return }
      let entry = args[3] ? Number(args[3].replace(/[%]/g,''))/100 : NaN
      let exit = args[4] ? Number(args[4].replace(/[%]/g,''))/100 : NaN
      if (!Number.isFinite(exit)) {
        // try current mid
        const tokenId = market.tokens?.[0]?.token_id
        if (tokenId) { const mid = await clobApi.getCurrentPrice(tokenId); if (mid!=null) exit = mid }
      }
      if (!Number.isFinite(entry)) entry = exit // if only one provided, use same
      const pnl = Number.isFinite(entry) && Number.isFinite(exit) ? Math.round((exit-entry)*stake) : 0
      const roi = Number.isFinite(entry) && Number.isFinite(exit) && entry!==0 ? (((exit-entry)/entry)*100).toFixed(1)+'%' : '—'

      const base = 'https://smtm.ai'
      const title = (market.question || 'Trade').slice(0, 110)
      const url = `${base}/api/og/trade?title=${encodeURIComponent(title)}&side=${encodeURIComponent(side)}`+
        `&stake=${encodeURIComponent('$'+Math.round(stake).toLocaleString())}`+
        `&entry=${encodeURIComponent(Number.isFinite(entry)?(entry*100).toFixed(1)+'%':'—')}`+
        `&exit=${encodeURIComponent(Number.isFinite(exit)?(exit*100).toFixed(1)+'%':'—')}`+
        `&pnl=${encodeURIComponent((pnl>=0?'+':'-')+'$'+Math.abs(pnl).toLocaleString())}`+
        `&roi=${encodeURIComponent(roi)}`

      const marketUrl = getPolymarketMarketUrl(market)
      await ctx.replyWithPhoto({ url }, { caption: `🧾 Trade Card — ${title}\n${marketUrl ? '🔗 '+marketUrl : ''}` })
    } catch (e) {
      logger.error('card_trade failed', e)
      await ctx.reply('❌ Failed to create your trade card. Please check your inputs and try again.')
    }
  })

  // (removed) legacy card_* alias commands

  logger.info('Commands registered');
}
