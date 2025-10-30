import { Telegraf } from 'telegraf';
import { logger } from '../utils/logger';
import { getTopRewardMarket, formatRewardInfo } from '../services/rewards';
import { findMarket, findMarketFuzzy, findWhaleFuzzy, gammaApi, dataApi } from '@smtm/data';
import { wsMonitor } from '../index';
import { botConfig } from '../config/bot';

export function registerCommands(bot: Telegraf) {
  // Start command
  bot.command('start', async (ctx) => {
    logger.info('User started bot', { userId: ctx.from?.id });
    await ctx.reply(
      'Welcome to SMTM Bot! 🎯\n\n' +
        '🔍 Discovery:\n' +
        '• /markets — Browse hot markets\n' +
        '• /whales — Top traders leaderboard\n' +
        '• /search markets <query> — Find markets\n' +
        '• /search whales <name> — Find traders\n' +
        '• /price <market> — Get market price\n\n' +
        '🔥 Alerts:\n' +
        '• /follow 0x<market_id> — Market price alerts\n' +
        '• /follow 0x<wallet> — Copy whale (all markets)\n' +
        '• /follow 0x<wallet> 0x<market_id> — Whale on specific market\n' +
        '• /list — View your follows\n\n' +
        '💡 Tip: Use /markets to get market IDs!'
    );
  });

  // Help command
  bot.command('help', async (ctx) => {
    await ctx.reply(
      '📚 SMTM Bot Help\n\n' +
        '🔍 Discovery:\n' +
        '/markets — Browse hot markets\n' +
        '/whales — Top traders leaderboard\n' +
        '/search markets <query> — Search markets\n' +
        '/search whales <name> — Search traders\n' +
        '/price <market> — Get market price\n' +
        '/whales_top 24h|7d|30d — Top whales\n\n' +
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
      // Build URL - strip date suffixes for grouped markets and numeric suffixes
      let urlSlug = market.slug || market.market_slug || '';
      // Remove date patterns like -october-31, -november-5, etc. (for market groups)
      urlSlug = urlSlug.replace(/-(january|february|march|april|may|june|july|august|september|october|november|december)-\d+$/i, '');
      // Remove numeric suffixes like -493
      urlSlug = urlSlug.replace(/-\d+$/, '');
      if (urlSlug) {
        message += `🔗 Trade: https://polymarket.com/event/${urlSlug}\n`;
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

        results.forEach((market, i) => {
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
          // Build URL - strip date suffixes for grouped markets and numeric suffixes
          let slug = market.slug || market.market_slug || '';
          slug = slug.replace(/-(january|february|march|april|may|june|july|august|september|october|november|december)-\d+$/i, '');
          slug = slug.replace(/-\d+$/, '');
          if (slug) {
            message += `   🔗 https://polymarket.com/event/${slug}\n`;
          }
          if (conditionId) {
            message += `   /price ${conditionId}\n`;
          }
          message += '\n';
        });

        message += '💡 Use /price <market_id> for details';

        await ctx.reply(message);

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

        results.forEach((whale, i) => {
          const name = whale.user_name || 'Anonymous';
          const short = whale.user_id.slice(0, 6) + '...' + whale.user_id.slice(-4);
          const pnl = whale.pnl > 0
            ? `+$${Math.round(whale.pnl).toLocaleString()}`
            : `-$${Math.abs(Math.round(whale.pnl)).toLocaleString()}`;
          const vol = `$${Math.round(whale.vol).toLocaleString()}`;

          message += `${i + 1}. ${name} (${short})\n`;
          message += `   💰 PnL: ${pnl} | Vol: ${vol}\n`;
          message += `   Rank: #${whale.rank}\n`;
          message += `   🔗 https://polymarket.com/user/${whale.user_id}\n\n`;
        });

        message += '💡 Use /whales to see full leaderboard';

        await ctx.reply(message);

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

  // Whales leaderboard (aggregate or by market)
  bot.command('whales', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    const looksLikeCond = (s: string) => /^0x[a-fA-F0-9]{64}$/.test(s)
    const minBalanceDefault = 50
    let minBalance = minBalanceDefault

    try {
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
          leaderboard.forEach((entry, i) => {
            const short = entry.user_id.slice(0,6)+'...'+entry.user_id.slice(-4)
            const name = entry.user_name || 'Anonymous'
            const pnl = entry.pnl > 0 ? `+$${Math.round(entry.pnl).toLocaleString()}` : `-$${Math.abs(Math.round(entry.pnl)).toLocaleString()}`
            const vol = `$${Math.round(entry.vol).toLocaleString()}`
            msg += `${i+1}. ${name} (${short})\n`
            msg += `   💰 PnL: ${pnl} | Vol: ${vol}\n`
            msg += `   🔗 https://polymarket.com/user/${entry.user_id}\n\n`
          })
          msg += '💡 How to follow a whale:\n'
          msg += '• /follow <whale_address> — copy ALL their trades\n'
          msg += '• /follow <whale_address> <market_id> — track on specific market'
          await ctx.reply(msg)
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
      whales.forEach(([addr, bal], i) => {
        const short = addr.slice(0,6)+'...'+addr.slice(-4)
        msg += `${i+1}. ${short}  — balance: ${Math.round(bal)}\n`
        msg += `   🔗 https://polymarket.com/user/${addr}\n`
        msg += `   Follow all: /follow ${addr}\n`
        msg += `   Follow here: /follow ${addr} ${market.condition_id}\n`
      })
      msg += `\n💡 Follow market price: /follow ${market.condition_id}`
      await ctx.reply(msg)
    } catch (err) {
      logger.error('Error in whales command', err)
      await ctx.reply('❌ Unable to load whales. Try /markets for active markets or check your connection.')
    }
  })

  // List subscriptions command
  bot.command('list', async (ctx) => {
    const userId = ctx.from!.id;
    logger.info('List command', { userId });

    try {
      const { getUserRows } = await import('../services/subscriptions')
      const rows = getUserRows(userId)
      if (rows.length === 0) {
        await ctx.reply('📭 No follows yet! Get started:\n\n• /markets — Browse markets\n• /whales — Find top traders\n• /follow <market_id> — Set up alerts')
        return
      }
      let i=0
      let msg = '📋 Your Follows\n\n'
      for (const r of rows) {
        i+=1
        const mid = r.market_condition_id || '—'
        if (r.type === 'market') {
          msg += `${i}. 📈 ${r.market_name}\n   Market ID: ${mid}\n   ➖ Unfollow: /unfollow ${mid}\n\n`
        } else if (r.type === 'whale_all') {
          const w = r.address_filter ? r.address_filter : 'wallet'
          const short = w.length > 10 ? w.slice(0,6)+'...'+w.slice(-4) : w
          msg += `${i}. 🐋 ${short} — ALL markets\n   ➖ Unfollow: /unfollow ${w}\n\n`
        } else {
          const w = r.address_filter ? r.address_filter : 'wallet'
          const short = w.length > 10 ? w.slice(0,6)+'...'+w.slice(-4) : w
          msg += `${i}. 🐋 ${r.market_name} — ${short}\n   Market ID: ${mid}\n   ➖ Unfollow: /unfollow ${w} ${mid}\n\n`
        }
      }
      await ctx.reply(msg)
    } catch (error) {
      logger.error('Error in list command', error);
      await ctx.reply('❌ Unable to load your follows. Please try again or contact support if this persists.');
    }
  });

  // Top whales over time windows (24h, 7d, 30d)
  bot.command('whales_top', async (ctx) => {
    const arg = ctx.message.text.split(' ').slice(1)[0] || '24h'
    let windowMs = 24*60*60*1000
    let label = 'last 24h'
    if (arg.toLowerCase().startsWith('7')) { windowMs = 7*24*60*60*1000; label = 'last 7d' }
    else if (arg.toLowerCase().startsWith('30') || arg.toLowerCase().includes('month')) { windowMs = 30*24*60*60*1000; label = 'last 30d' }

    try {
      const { whaleAggregator } = await import('../services/whale-aggregator')
      const res = whaleAggregator.getTop(windowMs, 10)
      if (!res.list.length) {
        await ctx.reply('❌ No whales observed in this window yet. Try again later or subscribe to whale alerts for a specific market with /whale 0x<market_id>.')
        return
      }
      let msg = `🐋 Top whales (${label})\n` + `Observed markets: ${res.markets}\nUpdated: ${new Date(res.updatedAt).toUTCString()}\n\n`
      res.list.forEach(([addr, val], i) => {
        const short = addr.slice(0,6)+'...'+addr.slice(-4)
        msg += `${i+1}. ${short} — $${Math.round(val)}\n`
        msg += `   Follow: /follow ${addr} <market_id>\n`
      })
      await ctx.reply(msg)
    } catch (e) {
      logger.error('whales_top error', e)
      await ctx.reply('❌ Unable to load top whales. Try /whales for the leaderboard instead.')
    }
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

        // Build URL - strip date suffixes for grouped markets and numeric suffixes
        let slug = market?.slug || market?.market_slug || '';
        slug = slug.replace(/-(january|february|march|april|may|june|july|august|september|october|november|december)-\d+$/i, '');
        slug = slug.replace(/-\d+$/, '');
        message += `${idx}. ${title}\n`
        message += `   📊 Price: ${price}%\n`
        message += `   💰 Volume: $${volM}M\n`
        message += `   🧊 Liquidity: $${liqM}M\n`
        if (slug) {
          message += `   🔗 https://polymarket.com/event/${slug}\n`
        }
        if (cond) {
          message += `   ➕ Follow: /follow ${cond}\n\n`
        } else {
          message += `   ➕ Follow: /follow <copy market id from event>\n\n`
        }
      }

      message +=
        '💡 How to follow:\n' +
        '• Tap a follow command above to insert it\n' +
        '• Or copy a market id (0x…) from the event\n' +
        '• Browse all: https://polymarket.com/markets';

      await ctx.reply(message, { parse_mode: 'Markdown' });
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

  logger.info('Commands registered');
}
