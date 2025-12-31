-- Daily GTM game snapshot storage
-- Stores the selected 10 traders (5 good, 5 bad) as JSON per day

CREATE TABLE IF NOT EXISTS public.gtm_game_snapshot (
  id         BIGSERIAL PRIMARY KEY,
  day_utc    DATE NOT NULL UNIQUE,
  traders    JSONB NOT NULL,
  seed       TEXT NULL,
  meta       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gtm_game_snapshot_created ON public.gtm_game_snapshot (created_at DESC);

-- Open read access via RLS policy for anonymous (public) reads
ALTER TABLE public.gtm_game_snapshot ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'gtm_game_snapshot' AND policyname = 'gtm_game_select_all'
  ) THEN
    CREATE POLICY gtm_game_select_all ON public.gtm_game_snapshot FOR SELECT USING (true);
  END IF;
END $$;

GRANT SELECT ON public.gtm_game_snapshot TO anon, authenticated;

