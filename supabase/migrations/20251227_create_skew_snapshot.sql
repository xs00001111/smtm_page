-- Skew snapshot persistence for holder/trade based skew
-- Stores periodic snapshots so reads can serve from DB for hours without recompute

-- 1) Create table (public schema for easy PostgREST reads)
CREATE TABLE IF NOT EXISTS public.skew_snapshot (
  id                 BIGSERIAL PRIMARY KEY,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Market identity
  condition_id       TEXT NOT NULL,
  yes_token_id       TEXT,
  no_token_id        TEXT,

  -- Source of computation (holder snapshot vs recent trades)
  source             TEXT NOT NULL CHECK (source IN ('holders','trades')),

  -- Core metrics
  skew_yes           NUMERIC(8,6),           -- 0..1 fraction toward YES
  skew               NUMERIC(8,6),           -- max(skew_yes, 1 - skew_yes)
  direction          TEXT CHECK (direction IN ('YES','NO')),
  smart_pool_usd     NUMERIC(18,2),          -- total USD volume used for skew calc (smart side only)

  -- Provenance / tuning
  wallets_evaluated  INT,
  whale_threshold    INT,                    -- score threshold used to classify smart money
  params_hash        TEXT,                   -- optional hash of config params

  -- Freshness windows
  computed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ,            -- optional hard expiry for snapshot

  -- Open-ended metadata for debugging and UI
  meta               JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 2) Helpful indexes for fast latest-per-market reads
CREATE INDEX IF NOT EXISTS idx_skew_snapshot_condition_source_time
  ON public.skew_snapshot (condition_id, source, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_skew_snapshot_created
  ON public.skew_snapshot (created_at DESC);

-- Optional: enforce at most one row per hour per (condition_id, source)
-- Use a trigger-populated column (not a generated column) to avoid IMMUTABLE requirements
ALTER TABLE public.skew_snapshot
  ADD COLUMN IF NOT EXISTS computed_hour TIMESTAMPTZ;

-- Upsert trigger function to keep computed_hour in sync with computed_at
CREATE OR REPLACE FUNCTION public.skew_snapshot_set_computed_hour()
RETURNS TRIGGER AS $$
BEGIN
  NEW.computed_hour := date_trunc('hour', NEW.computed_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if missing
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'skew_snapshot_set_computed_hour_tr'
  ) THEN
    CREATE TRIGGER skew_snapshot_set_computed_hour_tr
      BEFORE INSERT OR UPDATE ON public.skew_snapshot
      FOR EACH ROW
      EXECUTE FUNCTION public.skew_snapshot_set_computed_hour();
  END IF;
END $$;

-- Unique one snapshot per (condition, source, hour)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ux_skew_snapshot_hourly'
  ) THEN
    CREATE UNIQUE INDEX ux_skew_snapshot_hourly
      ON public.skew_snapshot (condition_id, source, computed_hour);
  END IF;
END $$;

-- 3) Public read access, RLS disabled (non-sensitive data)
ALTER TABLE public.skew_snapshot DISABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.skew_snapshot TO anon, authenticated;

-- 4) Convenience view to get latest snapshot per (condition_id, source)
CREATE OR REPLACE VIEW public.skew_latest AS
SELECT DISTINCT ON (condition_id, source)
  condition_id,
  source,
  id,
  created_at,
  yes_token_id,
  no_token_id,
  skew_yes,
  skew,
  direction,
  smart_pool_usd,
  wallets_evaluated,
  whale_threshold,
  params_hash,
  computed_at,
  expires_at,
  meta
FROM public.skew_snapshot
ORDER BY condition_id, source, computed_at DESC;
