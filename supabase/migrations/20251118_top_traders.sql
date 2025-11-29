-- Public tables to store daily top traders and their most recent trades (public read)

-- 1) Daily top traders snapshot (by PnL/volume from Polymarket leaderboard)
CREATE TABLE IF NOT EXISTS public.top_trader_daily (
  id           bigserial PRIMARY KEY,
  day_utc      date NOT NULL,
  rank         int NOT NULL,
  wallet       text NOT NULL,
  user_name    text,
  pnl          numeric,
  vol          numeric,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_top_trader_daily_day_rank
  ON public.top_trader_daily (day_utc DESC, rank ASC);
CREATE INDEX IF NOT EXISTS idx_top_trader_daily_wallet_day
  ON public.top_trader_daily (wallet, day_utc DESC);

ALTER TABLE public.top_trader_daily ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='top_trader_daily' AND policyname='top_trader_daily_select'
  ) THEN
    CREATE POLICY top_trader_daily_select ON public.top_trader_daily FOR SELECT USING (true);
  END IF;
END $$;
GRANT SELECT ON public.top_trader_daily TO anon, authenticated;

-- 2) Per-wallet most recent trade observed from CLOB (by scan or WS)
CREATE TABLE IF NOT EXISTS public.trader_recent_trade (
  wallet       text PRIMARY KEY,
  token_id     text,
  market_id    text,
  ts           timestamptz,
  price        numeric,
  size         numeric,
  notional     numeric,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trader_recent_trade_ts
  ON public.trader_recent_trade (updated_at DESC);

ALTER TABLE public.trader_recent_trade ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='trader_recent_trade' AND policyname='trader_recent_trade_select'
  ) THEN
    CREATE POLICY trader_recent_trade_select ON public.trader_recent_trade FOR SELECT USING (true);
  END IF;
END $$;
GRANT SELECT ON public.trader_recent_trade TO anon, authenticated;

