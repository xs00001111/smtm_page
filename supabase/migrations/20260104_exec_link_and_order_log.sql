-- Phase 2 — Supabase Schema (metadata only; RLS ON)
-- Creates metadata tables for execution linking and order logs.
-- This migration is idempotent where possible and safe to run multiple times.

-- Requirements for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Table: public.exec_link
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'exec_link'
  ) THEN
    CREATE TABLE public.exec_link (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      telegram_user_id bigint NOT NULL,
      polymarket_user_id text,
      secret_ref text NOT NULL,
      scopes jsonb NOT NULL DEFAULT '["trade"]'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz,
      last_used_at timestamptz
    );
  END IF;
END$$;

-- Unique active link per Telegram user (allow multiple historical rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ux_exec_link_active_by_tg'
  ) THEN
    CREATE UNIQUE INDEX ux_exec_link_active_by_tg
      ON public.exec_link (telegram_user_id)
      WHERE revoked_at IS NULL;
  END IF;
END$$;

-- Enable RLS (deny by default)
ALTER TABLE public.exec_link ENABLE ROW LEVEL SECURITY;

-- Policy: a caller with JWT claim telegram_user_id can read/update only their own row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exec_link' AND policyname='exec_link_select_own'
  ) THEN
    CREATE POLICY exec_link_select_own ON public.exec_link
      FOR SELECT
      USING (
        telegram_user_id = NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_user_id'),'')::bigint
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exec_link' AND policyname='exec_link_update_own'
  ) THEN
    CREATE POLICY exec_link_update_own ON public.exec_link
      FOR UPDATE
      USING (
        telegram_user_id = NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_user_id'),'')::bigint
      )
      WITH CHECK (
        telegram_user_id = NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_user_id'),'')::bigint
      );
  END IF;
END$$;

-- 2) Table: public.exec_order_log
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'exec_order_log'
  ) THEN
    CREATE TABLE public.exec_order_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      telegram_user_id bigint NOT NULL,
      condition_id text NOT NULL,
      side text NOT NULL,
      price numeric NOT NULL,
      size numeric NOT NULL,
      notional numeric,
      status text NOT NULL,
      tx jsonb,
      meta jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END$$;

-- Index for reads by user and recency
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ix_exec_order_log_tg_created'
  ) THEN
    CREATE INDEX ix_exec_order_log_tg_created
      ON public.exec_order_log (telegram_user_id, created_at DESC);
  END IF;
END$$;

-- Enable RLS (deny by default)
ALTER TABLE public.exec_order_log ENABLE ROW LEVEL SECURITY;

-- Policy: a caller with JWT claim telegram_user_id can read only their own logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='exec_order_log' AND policyname='exec_order_log_select_own'
  ) THEN
    CREATE POLICY exec_order_log_select_own ON public.exec_order_log
      FOR SELECT
      USING (
        telegram_user_id = NULLIF((current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_user_id'),'')::bigint
      );
  END IF;
END$$;

-- Notes:
-- - Service role key bypasses RLS and can insert/update both tables.
-- - If you do not plan to impersonate users via a custom JWT claim 'telegram_user_id',
--   the policies above will result in no access for anon/auth. That's intentional for now.
-- - To allow reads with a different claim name, edit the ->> 'telegram_user_id' key accordingly.

