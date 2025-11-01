-- Create tg_links table for storing user profile links
CREATE TABLE IF NOT EXISTS tg_links (
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id BIGINT NOT NULL,
  polymarket_address TEXT,
  polymarket_username TEXT,
  kalshi_username TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tg_links_user_id ON tg_links(user_id);
CREATE INDEX IF NOT EXISTS idx_tg_links_polymarket_address ON tg_links(polymarket_address) WHERE polymarket_address IS NOT NULL;

-- Update updated_at on changes
CREATE OR REPLACE FUNCTION update_tg_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tg_links_updated_at_trigger
  BEFORE UPDATE ON tg_links
  FOR EACH ROW
  EXECUTE FUNCTION update_tg_links_updated_at();

-- Comments
COMMENT ON TABLE tg_links IS 'Stores Telegram user profile links to Polymarket/Kalshi accounts';
COMMENT ON COLUMN tg_links.user_id IS 'Telegram user ID';
COMMENT ON COLUMN tg_links.polymarket_address IS 'Linked Polymarket wallet address (0x...)';
COMMENT ON COLUMN tg_links.polymarket_username IS 'Linked Polymarket username';
COMMENT ON COLUMN tg_links.kalshi_username IS 'Linked Kalshi username';
