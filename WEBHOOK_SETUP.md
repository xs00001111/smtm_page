# Telegram Bot Webhook Setup (Render)

## Why Webhooks?

**Problem**: Polling mode causes 409 conflicts during Render deployments because zero-downtime deploys run two instances simultaneously.

**Solution**: Webhook mode - Telegram pushes updates to your server (no polling conflicts).

## Setup Instructions

### 1. Get Your Render Service URL

Your Render service URL should be something like:
```
https://smtm-bot-xyz.onrender.com
```

Find it in: Render Dashboard → Your Service → Settings

### 2. Set Environment Variable

In Render Dashboard → Your Service → Environment:

**Add this variable:**
```
TELEGRAM_WEBHOOK_URL=https://your-service.onrender.com/telegram-webhook
```

Replace `your-service.onrender.com` with your actual Render URL.

### 3. Deploy

Save the environment variable and Render will automatically redeploy.

The bot will now:
- Start in webhook mode (no more 409 conflicts!)
- Listen on port 3000 (or PORT env var)
- Accept POST requests at `/telegram-webhook`

### 4. Verify

Check your logs for:
```
Telegram bot webhook server listening
```

### Troubleshooting

**Webhook not receiving updates?**

1. Check the webhook status:
```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo
```

2. Make sure your Render URL is HTTPS (required by Telegram)

3. Test the endpoint:
```bash
curl https://your-service.onrender.com/telegram-webhook
```
Should return: `ok`

**Switch back to polling?**

Remove the `TELEGRAM_WEBHOOK_URL` environment variable.

## Current Temporary Fix

If you must use polling mode, the code now:
- Detects Render environment
- Waits 15 seconds before starting
- Allows old instance to shutdown first
- Reduces (but doesn't eliminate) 409 conflicts
