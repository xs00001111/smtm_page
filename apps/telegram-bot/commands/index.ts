import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger';
import { getTopRewardMarket, formatRewardInfo } from '../services/rewards';
import { findMarket, findMarketFuzzy, findWhaleFuzzy, gammaApi, dataApi, clobApi } from '@smtm/data';
import { wsMonitor } from '../index';
import { botConfig } from '../config/bot';
import { linkPolymarketAddress, linkPolymarketUsername, linkKalshiUsername, unlinkAll, getLinks, parsePolymarketProfile } from '../services/links';
import { actionFollowMarket, actionFollowWhaleAll, actionFollowWhaleMarket, resolveAction, actionUnfollowMarket, actionUnfollowWhaleAll, actionUnfollowWhaleMarket } from '../services/actions';

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
      'Welcome to SMTM Bot! 🎯\n\n' +
        '🔍 Discovery:\n' +
        '• /markets — Browse hot markets\n' +
        '• /whales — Top traders leaderboard\n' +
        '• /whales <market_id> — Whales for specific market\n' +
        '• /search markets <query> — Find markets\n' +
        '• /search whales <name> — Find traders\n' +
        '• /price <market> — Get market price\n' +
        '• /net <market> — Net positions by user\n' +
        '• /overview <market> — Sides, totals, pricing\n' +
        '• /profile_card — Create your profile card\n' +
        '• /trade_card — Create a trade card\n\n' +
        '👤 Profile:\n' +
        '• /link <address|@username|url> — Link your Polymarket profile\n' +
        '• /unlink — Remove link\n' +
        '• /stats [id|url|username] — Show profile stats\n\n' +
        '🔥 Alerts:\n' +
        '• /follow 0x<market_id> — Market price alerts\n' +
        '• /follow 0x<wallet> — Copy whale (all markets)\n' +
        '• /follow 0x<wallet> 0x<market_id> — Whale on specific market\n' +
        '• /list — View your follows\n\n' +
        '💡 Tip: Use /markets to get market IDs!'
    );
  });

  // Inline button handler for one‑tap follow actions
  bot.on('callback_query', async (ctx) => {
    try {
      const data = (ctx.callbackQuery as any)?.data as string | undefined
      if (!data || !data.startsWith('act:')) return
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
      '📚 SMTM Bot Help\n\n' +
        '🔍 Discovery:\n' +
        '/markets — Browse hot markets\n' +
        '/whales — Top traders leaderboard\n' +
        '/whales <market_id> — Whales for specific market\n' +
        '/search markets <query> — Search markets\n' +
        '/search whales <name> — Search traders\n' +
        '/price <market> — Get market price\n' +
        '/net <market_url|id|slug> — Net positions by user\n' +
        '/overview <market_url|id|slug> — Sides, totals, pricing\n' +
        '/profile_card — Create your profile card\n' +
        '/profile_card <address|@user> — Create a profile card for anyone\n' +
        '/trade_card <market> <yes|no> <stake_$> [entry_%] [current_%] — Create a trade card\n\n' +
        '👤 Profile:\n' +
        '/link <address|@username|url> — Link your Polymarket profile\n' +
        '/unlink — Remove link\n' +
        '/stats [id|url|username] — Show stats for any user\n\n' +
        '🔔 Alerts:\n' +
        '/follow 0x<market_id> — Market price alerts\n' +
        '/follow 0x<wallet> — Copy whale (all markets)\n' +
        '/follow 0x<wallet> 0x<market_id> — Whale on specific market\n' +
        '/unfollow … — Stop follows\n' +
        '/list — View follows\n\n' +
        '⚙️ System:\n' +
        '/status — Connection status\n' +
        '/test_push — Test alerts\n\n' +
        '💡 Pro Tips:\n' +
        '• Use /markets to get market IDs\n' +
        '• Follow whales without market_id for copy trading all their moves!'
    );
  });

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

  // Stats command — show full profile for Polymarket; Kalshi placeholder
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
        '• /stats <polymarket_username>\n' +
        '• /stats <kalshi_username> (limited)\n\n' +
        'Tip: /link saves your profile so you can run /stats without arguments.'
      )
    }

    try {
      let mode: 'poly_address'|'poly_username'|'kalshi'|null = null
      let polyAddress: string | undefined
      let polyUsername: string | undefined
      let kalshiUser: string | undefined

      if (!inputRaw) {
        const linked = await getLinks(userId)
        if (!linked) { await replyUsage(); return }
        if (linked.polymarket_address) { mode = 'poly_address'; polyAddress = linked.polymarket_address }
        else if (linked.polymarket_username) { mode = 'poly_username'; polyUsername = linked.polymarket_username }
        else if (linked.kalshi_username) { mode = 'kalshi'; kalshiUser = linked.kalshi_username }
        else { await replyUsage(); return }
      } else {
        const input = inputRaw
        if (/^0x[a-fA-F0-9]{40}$/.test(input)) { mode = 'poly_address'; polyAddress = input }
        else if (/^https?:\/\//i.test(input)) {
          const parsed = parsePolymarketProfile(input)
          if (parsed?.address) { mode = 'poly_address'; polyAddress = parsed.address }
          else if (parsed?.username) { mode = 'poly_username'; polyUsername = parsed.username }
          else { mode = 'kalshi'; kalshiUser = input }
        } else if (/^[a-zA-Z0-9_\-]+$/.test(input)) {
          // Username; default to Polymarket username first
          polyUsername = input.replace(/^@/, '')
          mode = 'poly_username'
        } else {
          await replyUsage(); return
        }
      }

      if (mode === 'kalshi') {
        const { getKalshiUserStats } = await import('../services/kalshi')
        const stats = await getKalshiUserStats(kalshiUser!)
        if (!stats) {
          await ctx.reply('ℹ️ Kalshi user stats require an authenticated API and are not available without a key. Your link is saved for future features.')
          return
        }
        // If a public API becomes available, format and return here
      }

      // Resolve username -> address via leaderboard fuzzy search
      if (mode === 'poly_username' && polyUsername) {
        const results = await findWhaleFuzzy(polyUsername, 1)
        if (results.length && results[0]?.user_id) {
          polyAddress = results[0].user_id
        }
      }

      if (!polyAddress && (mode === 'poly_address' || mode === 'poly_username')) {
        // Try fuzzy search on whales by inputRaw as fallback
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
        const n = parseFloat(p.pnl || '0')
        if (!isNaN(n)) realizedPnl += n
      }

      // Unrealized PnL on opens (best-effort)
      let openInitial = 0
      let openCurrent = 0
      for (const p of openPositions) {
        const cur = parseFloat(p.value || '0')
        const init = parseFloat(p.initial_value || '0')
        if (!isNaN(cur)) openCurrent += cur
        if (!isNaN(init)) openInitial += init
      }
      const unrealizedPnl = openCurrent - openInitial

      // Top positions by current value
      const byValue = [...openPositions].sort((a,b)=>parseFloat(b.value||'0')-parseFloat(a.value||'0')).slice(0,5)

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
          const v = Math.round(parseFloat(p.value||'0'))
          const iv = Math.round(parseFloat(p.initial_value||'0') || 0)
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

  // Search command - Fuzzy search for markets and whales
  bot.command('search', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      await ctx.reply(
        '🔍 Search Command\n\n' +
        'Usage:\n' +
        '• /search markets <query> — search for markets\n' +
        '• /search whales <query> — search for top traders\n\n' +
        'Examples:\n' +
        '• /search markets trump election\n' +
        '• /search whales lirenTadd'
      );
      return;
    }

    const type = args[0].toLowerCase();
    const query = args.slice(1).join(' ');

    if (!query) {
      await ctx.reply('❌ Please provide a search query.\n\nExample: /search markets trump');
      return;
    }

    const userId = ctx.from?.id;
    logger.info('Search command', { userId, type, query });

    try {
      if (type === 'markets' || type === 'market') {
        // Search markets
        await ctx.reply('🔍 Searching...');

        const results = await findMarketFuzzy(query, 5);

        if (results.length === 0) {
          await ctx.reply(
            `❌ No matches for "${query}"\n\n` +
            'Try:\n' +
            '• Different keywords (e.g., "election", "crypto")\n' +
            '• /markets to browse trending'
          );
          return;
        }

        let message = `🔍 Search Results (${results.length})\n\n`;
        const keyboard: { text: string; callback_data: string }[][] = []

        for (let i=0;i<results.length;i++) {
          const market = results[i]
          const title = market.question || 'Untitled';
          const conditionId = market.condition_id || market.conditionId;

          // Parse price
          let priceStr = 'N/A';
          try {
            if (market.outcomePrices) {
              const prices = typeof market.outcomePrices === 'string'
                ? JSON.parse(market.outcomePrices)
                : market.outcomePrices;
              if (Array.isArray(prices) && prices.length > 0) {
                priceStr = `${(parseFloat(prices[0]) * 100).toFixed(1)}%`;
              }
            }
          } catch {}

          message += `${i + 1}. ${title.slice(0, 80)}${title.length > 80 ? '...' : ''}\n`;
          message += `   Price: ${priceStr}\n`;

          // Add market URL from API
          const marketUrl = getPolymarketMarketUrl(market);
          if (marketUrl) {
            message += `   🔗 ${marketUrl}\n`;
          }

          if (conditionId) {
            message += `   /price ${conditionId}\n`;
            try { const tok = await actionFollowMarket(conditionId, title); keyboard.push([{ text: `Follow ${i+1}`, callback_data: `act:${tok}` }]) } catch {}
          }
          message += '\n';
        }

        message += '💡 Use /price <market_id> for details';
        await ctx.reply(message, { reply_markup: { inline_keyboard: keyboard } as any });

      } else if (type === 'whales' || type === 'whale') {
        // Search whales
        await ctx.reply('🔍 Searching...');

        const results = await findWhaleFuzzy(query, 5);

        if (results.length === 0) {
          await ctx.reply(
            `❌ No traders match "${query}"\n\n` +
            'Try:\n' +
            '• Different search terms\n' +
            '• /whales for leaderboard'
          );
          return;
        }

        let message = `🐋 Search Results (${results.length})\n\n`;
        const keyboard: { text: string; callback_data: string }[][] = []

        for (let i=0;i<results.length;i++) {
          const whale = results[i]
          const name = whale.user_name || 'Anonymous';
          const short = whale.user_id.slice(0, 6) + '...' + whale.user_id.slice(-4);
          const pnl = whale.pnl > 0
            ? `+$${Math.round(whale.pnl).toLocaleString()}`
            : `-$${Math.abs(Math.round(whale.pnl)).toLocaleString()}`;
          const vol = `$${Math.round(whale.vol).toLocaleString()}`;
          const profileUrl = getPolymarketProfileUrl(whale.user_name, whale.user_id);

          message += `${i + 1}. ${name} (${short})\n`;
          message += `   ID: ${whale.user_id}\n`;
          message += `   💰 PnL: ${pnl} | Vol: ${vol}\n`;
          message += `   Rank: #${whale.rank}\n`;
          message += `   🔗 ${profileUrl}\n\n`;
          try { const tok = await actionFollowWhaleAll(whale.user_id); keyboard.push([{ text: `Follow ${i+1}`, callback_data: `act:${tok}` }]) } catch {}
        }

        message += '💡 Use /whales to see full leaderboard';
        await ctx.reply(message, { reply_markup: { inline_keyboard: keyboard } as any });

      } else {
        await ctx.reply(
          '❌ Invalid search type. Use:\n' +
          '• /search markets <query>\n' +
          '• /search whales <query>'
        );
      }

    } catch (error: any) {
      logger.error('Error in search command', { error: error?.message || error });
      await ctx.reply('❌ Search unavailable. Try /markets to browse instead.');
    }
  });

  // Subscribe (deprecated) -> instruct to use /follow
  bot.command('subscribe', async (ctx) => {
    await ctx.reply('This command is deprecated. Use /follow instead.\nExamples:\n• /follow 0x<market_id> (market price alerts)\n• /follow 0x<wallet> (copy whale all markets)\n• /follow 0x<wallet> 0x<market_id> (whale on specific market)')
  });

  // Unsubscribe command
  bot.command('unsubscribe', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1);
    if (args.length === 0) {
      await ctx.reply(
        '❓ Please specify a market.\n\n' +
          'Example: /unsubscribe trump 2024\n\n' +
          'Use /list to see your subscriptions'
      );
      return;
    }

    const looksLikeCond = (s: string) => /^0x[a-fA-F0-9]{64}$/.test(s)
    const first = args[0]
    const query = args.join(' ');
    const userId = ctx.from!.id;
    logger.info('Unsubscribe command', { userId, query });

    try {
      await ctx.reply('🔍 Looking up market...');

      // Resolve market id or search with logs
      let market: any = null
      if (looksLikeCond(first)) {
        try {
          market = await gammaApi.getMarket(first)
          logger.info('unsubscribe: resolved by condition id', { conditionId: first, tokens: market?.tokens?.length || 0 })
        } catch (e: any) {
          logger.error('unsubscribe: getMarket failed', { conditionId: first, error: e?.message })
        }
      }
      if (!market) {
        try {
          market = await findMarket(query)
          logger.info('unsubscribe: resolved by search', { query, conditionId: market?.condition_id })
        } catch (e: any) {
          logger.error('unsubscribe: findMarket failed', { query, error: e?.message })
        }
      }
      if (!market) {
        await ctx.reply(
          `❌ Could not find market matching "${query}".\n\n` +
            'Use /list to see your current subscriptions.'
        );
        return;
      }

      const tokenId = market.tokens?.[0]?.token_id;
      if (!tokenId) {
        await ctx.reply('❌ This market isn\'t ready for alerts yet. Try /markets for active markets.');
        return;
      }

      // Unsubscribe from alerts
      const success = wsMonitor.unsubscribeFromMarket(userId, tokenId);
      if (!success) {
        await ctx.reply('⚠️ You are not subscribed to this market.');
        return;
      }

      await ctx.reply(
        `✅ Unsubscribed from alerts!\n\n` +
          `📊 Market: ${market.question}\n\n` +
          `You will no longer receive price alerts for this market.`
      );

      logger.info('User unsubscribed from market', { userId, tokenId });
      const { removeMarketSubscription } = await import('../services/subscriptions')
      await removeMarketSubscription(userId, tokenId)
    } catch (error) {
      logger.error('Error in unsubscribe command', error);
      await ctx.reply('❌ Unable to unsubscribe. Try /list to see your follows, then /unfollow instead.');
    }
  });

  // Whale trade alerts command (deprecated) -> instruct to use /follow
  bot.command('whale', async (ctx) => {
    await ctx.reply('This command is deprecated. Use /follow instead.\nExamples:\n• /follow 0x<wallet> (copy whale all markets)\n• /follow 0x<wallet> 0x<market_id> (whale on specific market)')
  });

  // Whales leaderboard (global or by market)
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
          logger.info('whales: fetching leaderboard')
          const leaderboard = await dataApi.getLeaderboard({ limit: 10 })
          logger.info('whales: leaderboard returned', { count: leaderboard.length })

          if (leaderboard.length === 0) {
            await ctx.reply('❌ No whales found. Try a specific market: `/whales 0x<market_id>`', { parse_mode: 'Markdown' })
            return
          }

          let msg = '🐋 Top Traders (by PnL)\n\n'
          const keyboard: { text: string; callback_data: string }[][] = []
          leaderboard.forEach(async (entry, i) => {
            const short = entry.user_id.slice(0,6)+'...'+entry.user_id.slice(-4)
            const name = entry.user_name || 'Anonymous'
            const pnl = entry.pnl > 0 ? `+$${Math.round(entry.pnl).toLocaleString()}` : `-$${Math.abs(Math.round(entry.pnl)).toLocaleString()}`
            const vol = `$${Math.round(entry.vol).toLocaleString()}`
            const profileUrl = getPolymarketProfileUrl(entry.user_name, entry.user_id)
            msg += `${i+1}. ${name} (${short})\n`
            msg += `   ID: ${entry.user_id}\n`
            msg += `   💰 PnL: ${pnl} | Vol: ${vol}\n`
            msg += `   🔗 ${profileUrl}\n`
            msg += `   ${'<code>'+esc(`/follow ${entry.user_id}`)+'</code>'}\n\n`
            try {
              const tok = await actionFollowWhaleAll(entry.user_id)
              keyboard.push([{ text: `Follow ${short} (All)`, callback_data: `act:${tok}` }])
            } catch {}
          })
          msg += '💡 Tip: For a specific market, run <code>/whales &lt;market_id&gt;</code> to list whales there with a market-specific follow command.'
          await ctx.reply(msg, { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } as any })
          return
        } catch (e: any) {
          logger.error('whales: leaderboard failed', { error: e?.message })
          await ctx.reply('❌ Unable to load leaderboard. Try a specific market: `/whales 0x<market_id>`', { parse_mode: 'Markdown' })
          return
        }
      }

      // By market
      const q = args.join(' ')
      await ctx.reply('🔍 Loading market whales...')
      const first = args[0]
      const market = looksLikeCond(first) ? await gammaApi.getMarket(first) : await findMarket(q)
      if (!market) {
        await ctx.reply('❌ Market not found. Try /markets to browse or use full market ID (0x...).')
        return
      }
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

  // Markets command - Show trending markets with subscribe buttons
  bot.command('markets', async (ctx) => {
    const userId = ctx.from?.id;
    logger.info('Markets command', { userId });

    try {
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
        await ctx.reply('❌ No active markets right now. Try /search markets <query> to find specific markets.');
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

  // Test push delivery (sends sample price + whale alerts if subscribed)
  bot.command('test_push', async (ctx) => {
    const userId = ctx.from!.id
    try {
      const priceSent = await wsMonitor.debugSendPrice(userId)
      const whaleSent = await wsMonitor.debugSendWhale(userId)

      if (!priceSent && !whaleSent) {
        await ctx.reply(
          '⚠️ Can\'t send test - no active follows!\n\nTo test alerts:\n1. /markets to find a market\n2. /follow <market_id> to enable alerts\n3. /test_push to test'
        )
        return
      }

      let msg = '🧪 Test push sent:\n'
      if (priceSent) msg += '• Price alert ✅\n'
      if (whaleSent) msg += '• Whale alert ✅\n'
      await ctx.reply(msg)
    } catch (err) {
      await ctx.reply('❌ Failed to send test push. Please try again.')
    }
  })

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

  // Profile command - Open profile card mini app
  bot.command('profile', async (ctx) => {
    logger.info('Profile command', { userId: ctx.from?.id });

    try {
      const userId = ctx.from?.id;
      const miniAppUrl = `https://smtm.ai/mini/profile${userId ? `?user=${userId}` : ''}`;

      await ctx.reply(
        '👤 View your SMTM profile card with stats, badges, and shareable image!',
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: '🎯 Open Profile Card',
                  web_app: { url: miniAppUrl },
                },
              ],
            ],
          },
        }
      );
    } catch (error) {
      logger.error('Error in profile command', error);
      await ctx.reply('❌ Unable to load profile. Please try again or contact support if this persists.');
    }
  });

  // Profile card — generate a shareable image and send it
  bot.command('profile_card', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    const userId = ctx.from!.id
    try {
      // Reuse stats resolution for address
      let input = args.join(' ').trim()
      let address: string | undefined
      if (!input) {
        const linked = await getLinks(userId)
        if (linked?.polymarket_address) {
          address = linked.polymarket_address
        } else if (linked?.polymarket_username) {
          const res = await findWhaleFuzzy(linked.polymarket_username, 1)
          address = res[0]?.user_id
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
      } else if (/^https?:\/\//i.test(input)) {
        const parsed = parsePolymarketProfile(input)
        address = parsed?.address
        if (!address && parsed?.username) {
          const res = await findWhaleFuzzy(parsed.username, 1)
          address = res[0]?.user_id
        }
      } else {
        const res = await findWhaleFuzzy(input.replace(/^@/, ''), 1)
        address = res[0]?.user_id
      }

      if (!address) {
        await ctx.reply(
          '❌ Could not resolve Polymarket address.\n\n' +
          'Try:\n' +
          '• /profile_card 0x<address>\n' +
          '• /profile_card @username\n' +
          '• /profile_card <profile_url>'
        )
        return
      }

      await ctx.reply('⏳ Creating your profile card...')

      const [value, positions, closed, lb] = await Promise.all([
        dataApi.getUserValue(address),
        dataApi.getUserPositions({ user: address, limit: 200 }),
        dataApi.getClosedPositions(address, 200),
        findWhaleFuzzy(address, 1)
      ])

      let realized = 0
      for (const p of closed) { const n = parseFloat(p.pnl||'0'); if (!isNaN(n)) realized += n }
      let openInitial = 0, openCurrent = 0
      for (const p of positions) {
        const cur = parseFloat(p.value||'0') || 0
        const init = parseFloat(p.initial_value||'0') || 0
        openInitial += init; openCurrent += cur
      }
      const unrealized = openCurrent - openInitial
      const roi = openInitial>0 ? (((openCurrent-openInitial)/openInitial)*100).toFixed(1)+'%' : '—'
      const rank = lb.length ? String(lb[0].rank) : ''
      const pnlLb = lb.length ? ((lb[0].pnl>=0?'+':'-')+'$'+Math.abs(Math.round(lb[0].pnl)).toLocaleString()) : ''

      const base = 'https://smtm.ai'
      const short = address.slice(0,6)+'...'+address.slice(-4)
      const url = `${base}/api/og/profile?address=${encodeURIComponent(short)}&title=${encodeURIComponent('Polymarket Profile')}`+
        `&value=${encodeURIComponent(value.value||'0')}&realized=${encodeURIComponent((realized>=0?'+':'-')+'$'+Math.abs(Math.round(realized)).toLocaleString())}`+
        `&unrealized=${encodeURIComponent((unrealized>=0?'+':'-')+'$'+Math.abs(Math.round(unrealized)).toLocaleString())}`+
        `&roi=${encodeURIComponent(roi)}&rank=${encodeURIComponent(rank)}&pnlLb=${encodeURIComponent(pnlLb)}`

      await ctx.replyWithPhoto({ url }, { caption: `👤 Profile — ${short}\nView: https://polymarket.com/profile/${address}` })
    } catch (e: any) {
      logger.error('card_profile failed', e)
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

  // Whale card (alias to profile with whale flair later)
  bot.command('whale_card', async (ctx) => {
    await ctx.reply('ℹ️ Whale cards use the profile card format for now.\n\nTry: /profile_card <address>')
  })

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

  // Backwards compatibility aliases for old command names
  bot.command('card_profile', async (ctx) => {
    await ctx.reply('ℹ️ This command has been renamed to /profile_card\n\nTry: /profile_card')
  })
  bot.command('card_trade', async (ctx) => {
    await ctx.reply('ℹ️ This command has been renamed to /trade_card\n\nTry: /trade_card <market> <yes|no> <stake_$> [entry_%] [current_%]')
  })
  bot.command('card_whale', async (ctx) => {
    await ctx.reply('ℹ️ This command has been renamed to /whale_card\n\nTry: /whale_card')
  })

  logger.info('Commands registered');
}
