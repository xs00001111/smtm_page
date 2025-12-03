-- Enrich public.alpha_event with fields needed to render rich cards

-- Ensure table exists
CREATE TABLE IF NOT EXISTS public.alpha_event (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  kind TEXT NOT NULL CHECK (kind IN ('whale','smart_skew','insider')),
  condition_id TEXT,
  token_id TEXT
);

-- Whale/show fields
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS trader_address TEXT;
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS trader_display_name TEXT;
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS side TEXT;
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS price NUMERIC;
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS size NUMERIC;
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS notional_usd NUMERIC;
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS whale_score NUMERIC;
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS recommendation TEXT;

-- Skew/insider fields
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS cluster_count INT;
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS cluster_duration_ms INT;
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS skew NUMERIC;
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS skew_yes NUMERIC;
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS smart_pool_usd NUMERIC;
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS direction TEXT;
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS insider_score INT;

-- Market helpers
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS market_title TEXT;
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS event_slug TEXT;
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS market_slug TEXT;
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS yes_token_id TEXT;
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS no_token_id TEXT;

-- Generic meta
ALTER TABLE public.alpha_event ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_alpha_event_created_at ON public.alpha_event (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alpha_event_condition ON public.alpha_event (condition_id);
CREATE INDEX IF NOT EXISTS idx_alpha_event_token ON public.alpha_event (token_id);
CREATE INDEX IF NOT EXISTS idx_alpha_event_trader ON public.alpha_event (trader_address);

