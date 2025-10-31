-- Action tokens for one‑tap inline buttons (Telegram callback_data <= 64 bytes)
-- Server resolves short token to structured action and executes it.

create table if not exists public.tg_actions (
  id text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  type text not null,
  data jsonb not null
);

create index if not exists idx_tg_actions_expires on public.tg_actions (expires_at);

alter table public.tg_actions enable row level security;
-- Service role is used; no anon policies by default.

