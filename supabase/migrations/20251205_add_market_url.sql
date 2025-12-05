-- Add missing market_url column for alpha_event and refresh PostgREST schema cache
-- Safe to run multiple times due to IF NOT EXISTS

ALTER TABLE public.alpha_event
  ADD COLUMN IF NOT EXISTS market_url TEXT;

-- Force PostgREST to reload its schema cache so new columns are visible immediately
NOTIFY pgrst, 'reload schema';

