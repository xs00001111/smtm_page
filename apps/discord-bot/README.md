# SMTM Discord Bot (Scaffold)

This is a minimal scaffold for a Discord bot that mirrors the Telegram experience:
- Discovery: /markets, /price, /whales, /whales_top, /search
- Profile: /link, /unlink, /stats
- Summaries: /net, /overview
- Shareable Cards: /card_profile, /card_trade, /card_whale
- Alerts: /follow, /unfollow, /list, /status (optional)

## Setup
1. Create a Discord Application and Bot: https://discord.com/developers/applications
2. Enable Privileged Intents: Message Content + Server Members (as needed)
3. Invite the bot with scopes `bot applications.commands` and permission to send messages/embeds.
4. Add a bot token to env: `DISCORD_BOT_TOKEN=...`

## Run (local)
- `npm run dev:discord`

## Deploy
- Deploy `apps/discord-bot` on Render.
- Provide `DISCORD_BOT_TOKEN` in environment variables.

