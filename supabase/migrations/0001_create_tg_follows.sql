-- Create table to record Telegram user follows/unfollows for markets and whale alerts
-- This schema matches usages in apps/telegram-bot/services/subscriptions.ts

create table if not exists public.tg_follows (
  id bigserial primary key,
  created_at timestamptz not null default now(),

  -- Telegram user id (int64 range)
  user_id bigint not null,

  -- Type of follow: 'market' | 'whale' | 'whale_all'
  kind text not null check (kind in ('market','whale','whale_all')),

  -- For resolved subscriptions; null while pending on condition
  token_id text null,

  -- Pending subscription key to resolve token later
  market_condition_id text null,

  -- Human-friendly market name stored for convenience
  market_name text not null default ''::text,

  -- Thresholds used by bot logic (integers in code)
  threshold integer null,
  min_trade_size integer null,

  -- Optional wallet/address filter (for whale_all and whale)
  address_filter text null
);

-- Unique constraint used by PostgREST upsert (on_conflict=user_id,kind,token_id,market_condition_id,address_filter)
-- Note: in Postgres, NULLs are not equal, so rows with all-null conflict cols do not conflict.
alter table public.tg_follows
  add constraint tg_follows_uniq unique (user_id, kind, token_id, market_condition_id, address_filter);

-- Helpful indexes to speed up common filters used by the app
create index if not exists idx_tg_follows_user_kind_token
  on public.tg_follows (user_id, kind, token_id);

create index if not exists idx_tg_follows_user_kind_cond_nulltoken
  on public.tg_follows (user_id, kind, market_condition_id)
  where token_id is null;

create index if not exists idx_tg_follows_user_kind_addr
  on public.tg_follows (user_id, kind, address_filter);

-- Enable RLS; service role key bypasses RLS, anon will be blocked unless policies added.
alter table public.tg_follows enable row level security;

-- No anon policies by default (server uses service role). Add policies if client access is needed.

