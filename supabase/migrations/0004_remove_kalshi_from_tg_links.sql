-- Remove Kalshi integration from tg_links table
-- This migration removes the incomplete Kalshi username column

-- Drop the kalshi_username column
ALTER TABLE tg_links DROP COLUMN IF EXISTS kalshi_username;

-- Update the table comment to remove Kalshi reference
COMMENT ON TABLE tg_links IS 'Stores Telegram user profile links to Polymarket accounts';
