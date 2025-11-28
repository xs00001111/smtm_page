-- Alpha analytics schema for whale/smart-skew/insider signals
-- Creates fact tables and helpful indexes for reporting and channel feed ops

CREATE SCHEMA IF NOT EXISTS analytics;

-- Normalized alpha events emitted by the bot/services
CREATE TABLE IF NOT EXISTS analytics.alpha_event (
  id               bigserial PRIMARY KEY,
  created_at       timestamptz NOT NULL DEFAULT now(),
  kind             text NOT NULL CHECK (kind IN ('whale','smart_skew','insider')),
  condition_id     text,            -- Polymarket condition id
  yes_token_id     text,
  no_token_id      text,
  token_id         text,            -- representative token for event
  wallet           text,            -- whale wallet when applicable
  alpha            int  NOT NULL,   -- 0..100
  -- whale fields
  whale_score      int,             -- 0..100
  recommendation   text,            -- copy|counter|neutral
  notional_usd     numeric(18,2),
  cluster_count    int,
  cluster_duration_ms int,
  -- smart-skew fields
  skew_yes         numeric(8,6),
  skew             numeric(8,6),
  smart_pool_usd   numeric(18,2),
  direction        text CHECK (direction IN ('YES','NO')),
  -- insider fields
  insider_score    int,
  meta             jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_alpha_event_created
  ON analytics.alpha_event (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alpha_event_kind_created
  ON analytics.alpha_event (kind, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alpha_event_condition_created
  ON analytics.alpha_event (condition_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alpha_event_wallet_created
  ON analytics.alpha_event (wallet, created_at DESC);

-- Track /alpha consumption and button pagination
CREATE TABLE IF NOT EXISTS analytics.alpha_click (
  id               bigserial PRIMARY KEY,
  created_at       timestamptz NOT NULL DEFAULT now(),
  user_id          bigint NOT NULL REFERENCES analytics.tg_user(telegram_user_id) ON DELETE CASCADE,
  chat_id          bigint REFERENCES analytics.tg_chat(telegram_chat_id) ON DELETE SET NULL,
  alpha_event_id   bigint,
  kind             text CHECK (kind IN ('view','more','copy','counter','share')),
  context          jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_alpha_click_created
  ON analytics.alpha_click (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alpha_click_user_created
  ON analytics.alpha_click (user_id, created_at DESC);

-- Optional: raw whale trades (cluster-level) to validate thresholds
CREATE TABLE IF NOT EXISTS analytics.whale_trade (
  id               bigserial PRIMARY KEY,
  created_at       timestamptz NOT NULL DEFAULT now(),
  token_id         text NOT NULL,
  condition_id     text,
  wallet           text NOT NULL,
  price            numeric(10,6) NOT NULL,
  size_shares      numeric(18,6) NOT NULL,
  notional_usd     numeric(18,2) NOT NULL,
  cluster_count    int DEFAULT 1,
  cluster_duration_ms int DEFAULT 0,
  meta             jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_whale_trade_created
  ON analytics.whale_trade (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whale_trade_wallet_created
  ON analytics.whale_trade (wallet, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whale_trade_token_created
  ON analytics.whale_trade (token_id, created_at DESC);

