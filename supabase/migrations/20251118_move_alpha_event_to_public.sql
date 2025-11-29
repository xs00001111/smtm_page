-- Move alpha_event to public schema for open read access via PostgREST
-- 1) Create table in public mirroring analytics.alpha_event
CREATE TABLE IF NOT EXISTS public.alpha_event (
  id               bigserial PRIMARY KEY,
  created_at       timestamptz NOT NULL DEFAULT now(),
  kind             text NOT NULL CHECK (kind IN ('whale','smart_skew','insider')),
  condition_id     text,
  yes_token_id     text,
  no_token_id      text,
  token_id         text,
  wallet           text,
  alpha            int  NOT NULL,
  whale_score      int,
  recommendation   text,
  notional_usd     numeric(18,2),
  cluster_count    int,
  cluster_duration_ms int,
  skew_yes         numeric(8,6),
  skew             numeric(8,6),
  smart_pool_usd   numeric(18,2),
  direction        text CHECK (direction IN ('YES','NO')),
  insider_score    int,
  meta             jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- 2) Copy data from analytics if it exists (best-effort)
INSERT INTO public.alpha_event
  (id, created_at, kind, condition_id, yes_token_id, no_token_id, token_id, wallet, alpha,
   whale_score, recommendation, notional_usd, cluster_count, cluster_duration_ms,
   skew_yes, skew, smart_pool_usd, direction, insider_score, meta)
SELECT
  id, created_at, kind, condition_id, yes_token_id, no_token_id, token_id, wallet, alpha,
  whale_score, recommendation, notional_usd, cluster_count, cluster_duration_ms,
  skew_yes, skew, smart_pool_usd, direction, insider_score, meta
FROM analytics.alpha_event
ON CONFLICT DO NOTHING;

-- 3) Helpful indexes
CREATE INDEX IF NOT EXISTS idx_public_alpha_event_created
  ON public.alpha_event (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_alpha_event_kind_created
  ON public.alpha_event (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_alpha_event_condition_created
  ON public.alpha_event (condition_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_public_alpha_event_wallet_created
  ON public.alpha_event (wallet, created_at DESC);

-- 4) Enable public read access (RLS + permissive select)
ALTER TABLE public.alpha_event ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'alpha_event' AND policyname = 'alpha_event_select_all'
  ) THEN
    CREATE POLICY alpha_event_select_all ON public.alpha_event
      FOR SELECT USING (true);
  END IF;
END $$;
GRANT SELECT ON public.alpha_event TO anon, authenticated;

-- 5) Optionally drop the old analytics table (safe if empty)
-- DROP TABLE IF EXISTS analytics.alpha_event;

