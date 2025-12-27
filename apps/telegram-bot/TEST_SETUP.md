# Local Test Environment Setup

## Quick Start

### 1. Set up environment variables

```bash
# Copy the template (already has all prod credentials!)
cp .env.local .env

# Edit .env and fill in ONLY:
# - TELEGRAM_BOT_TOKEN (your test bot token)
# - ALPHA_ALERTS_WHITELIST (your telegram user ID)
```

All other credentials (Supabase, CLOB API) are already copied from production!

### 2. Find your Telegram User ID

**Option A: Check database**
Go to Supabase → Table Editor → `analytics.tg_user` → Find your row

**Option B: Use the bot**
```bash
# Start the test bot locally
npm run dev

# In Telegram, chat with @TradeWithSMTM_dev_bot
# Send: /start

# Check the terminal logs for:
# "userId": YOUR_ID_HERE
```

### 3. Update .env with your user ID

```bash
# Edit .env
ALPHA_ALERTS_WHITELIST=YOUR_USER_ID_HERE
```

### 4. Remove hardcoded disable in code

**IMPORTANT:** Before running locally, you need to enable the harvester:

Edit `services/alpha-harvester.ts`:
```typescript
export function startAlphaHarvester() {
  // COMMENT OUT THIS LINE:
  // logger.info('alpha.harvester HARDCODED DISABLED - not starting')
  // return

  // Then the harvester will run
```

### 5. Run the test bot

```bash
cd apps/telegram-bot
npm run dev
```

### 6. Test alpha alerts

**Wait for harvester to run (~3 minutes)** and you should receive a test alert!

Or test immediately with `/alpha` command:
- Chat with @TradeWithSMTM_dev_bot
- Send: `/alpha`
- Should see recent alpha trades

## Verify Setup

Check logs for:
```
✅ "alpha.import ✅ COMPLETE - Supabase users imported"
✅ "alpha.harvester starting"
✅ "alpha.harvester run.begin"
✅ "whitelistedUsers": 1
```

## Common Issues

### Issue: "enabledUsers": 0
**Fix:** Make sure you've chatted with @TradeWithSMTM_dev_bot at least once

### Issue: No alerts received
**Fix:** Check ALPHA_ALERTS_WHITELIST has your correct user ID

### Issue: Harvester not starting
**Fix:** Remove the hardcoded `return` at the top of `startAlphaHarvester()`

### Issue: Market question shows "Unknown Market"
**Fix:** Check CLOB_API credentials are correct

## Push to Production

When ready to deploy your changes:

1. **Re-enable hardcoded disable:**
   ```typescript
   export function startAlphaHarvester() {
     logger.info('alpha.harvester HARDCODED DISABLED - not starting')
     return
     // ... rest of code
   }
   ```

2. **Commit and push:**
   ```bash
   git add .
   git commit -m "feat: your changes here"
   git push origin main
   ```

3. **When ready to launch to all users:**
   - Remove the hardcoded disable
   - Remove ALPHA_ALERTS_WHITELIST env var in Render
   - Push to production

## Files Overview

- `.env` - Local environment variables (gitignored)
- `.env.local` - Template with test bot token
- `services/alpha-harvester.ts` - Alpha scanning and alert logic
- `services/alpha-alerts.ts` - Alert sending and whitelist logic
