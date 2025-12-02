-- Create analytics.alpha_view to track per-user alpha views
-- This complements public.alpha_event (signal records) and analytics.alpha_click (clicks)

-- 1) Ensure analytics schema exists
CREATE SCHEMA IF NOT EXISTS analytics;

-- 2) Create table (idempotent)
CREATE TABLE IF NOT EXISTS analytics.alpha_view (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  seen_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id          BIGINT NOT NULL,      -- Telegram user id
  chat_id          BIGINT,               -- Telegram chat id (optional)
  alpha_event_id   BIGINT REFERENCES public.alpha_event(id) ON DELETE SET NULL,
  context          JSONB  NOT NULL DEFAULT '{}'::jsonb
);

-- 3) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_alpha_view_seen_at      ON analytics.alpha_view (seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_alpha_view_user         ON analytics.alpha_view (user_id);
CREATE INDEX IF NOT EXISTS idx_alpha_view_alpha_event  ON analytics.alpha_view (alpha_event_id);

-- Notes:
-- - RLS is left disabled by default since the bot uses a service key. Enable and add policies if desired.
-- - This table is intended for analytics; signals are stored in public.alpha_event.

