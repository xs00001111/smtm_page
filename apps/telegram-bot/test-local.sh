#!/bin/bash
# Quick script to run test bot locally

echo "🧪 Starting TEST bot locally..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
  echo "❌ .env file not found!"
  echo ""
  echo "Please run:"
  echo "  cp .env.local .env"
  echo ""
  echo "Then edit .env and fill in your Supabase & CLOB credentials"
  exit 1
fi

# Check if TELEGRAM_BOT_TOKEN is set to test bot
if ! grep -q "8405614111" .env; then
  echo "⚠️  Warning: .env doesn't contain test bot token"
  echo "Make sure TELEGRAM_BOT_TOKEN=8405614111:AAHcrD77H5YL5YSfonwgNfE1AtdarRvnnKY"
  echo ""
fi

# Remind about hardcoded disable
echo "⚠️  REMINDER: Did you remove the hardcoded disable?"
echo "In services/alpha-harvester.ts, comment out the return statement"
echo ""
echo "Press Enter to continue or Ctrl+C to cancel..."
read

# Run the bot
npm run dev
