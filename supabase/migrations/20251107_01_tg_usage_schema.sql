-- Telegram analytics schema for SMTM bot
-- Tracks unique users, chats, and per-event command usage

-- 1) Enumerations
DO $$ BEGIN
  CREATE TYPE tg_event_type AS ENUM ('command','callback','inline_query','system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tg_status AS ENUM ('ok','error');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Dimension tables
CREATE TABLE IF NOT EXISTS public.tg_users (
  user_id         bigint PRIMARY KEY,
  username        text,
  first_name      text,
  last_name       text,
  language_code   text,
  is_bot          boolean DEFAULT false,
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_command_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tg_users_last_seen_at ON public.tg_users (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.tg_chats (
  chat_id       bigint PRIMARY KEY,
  chat_type     text,          -- private | group | supergroup | channel
  title         text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tg_chats_last_seen_at ON public.tg_chats (last_seen_at DESC);

-- 3) Fact table: one row per handled Telegram event (command, callback, etc.)
CREATE TABLE IF NOT EXISTS public.tg_command_logs (
  id                 bigserial PRIMARY KEY,
  created_at         timestamptz NOT NULL DEFAULT now(),
  user_id            bigint NOT NULL REFERENCES public.tg_users(user_id) ON DELETE CASCADE,
  chat_id            bigint REFERENCES public.tg_chats(chat_id) ON DELETE SET NULL,
  event_type         tg_event_type NOT NULL DEFAULT 'command',
  command            text,           -- raw command (e.g., '/whales')
  normalized_command text,           -- canonical command key (e.g., 'whales')
  args               text,           -- raw args string (optional)
  status             tg_status NOT NULL DEFAULT 'ok',
  error              text,           -- error message snapshot if any
  duration_ms        integer,        -- optional timing captured by app
  message_id         bigint,         -- original Telegram message id (if available)
  callback_data      text,           -- callback payload (if applicable)
  action_type        text,           -- high-level action (e.g., follow_market)
  app_version        text,           -- optional release version/commit
  meta               jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_tg_logs_created_at ON public.tg_command_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tg_logs_user ON public.tg_command_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_tg_logs_cmd ON public.tg_command_logs (normalized_command);
CREATE INDEX IF NOT EXISTS idx_tg_logs_event_type ON public.tg_command_logs (event_type);

-- 4) Helper functions + triggers to keep dimensions fresh
-- Touch/Upsert user based on an event row
CREATE OR REPLACE FUNCTION public.tg_touch_user() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.tg_users (user_id, username, first_name, last_name, language_code, first_seen_at, last_seen_at, last_command_at)
  VALUES (NEW.user_id,
          COALESCE(NEW.meta->>'username', NULL),
          COALESCE(NEW.meta->>'first_name', NULL),
          COALESCE(NEW.meta->>'last_name', NULL),
          COALESCE(NEW.meta->>'language_code', NULL),
          NEW.created_at,
          NEW.created_at,
          CASE WHEN NEW.event_type = 'command' THEN NEW.created_at ELSE NULL END)
  ON CONFLICT (user_id) DO UPDATE
    SET username        = COALESCE(EXCLUDED.username, public.tg_users.username),
        first_name      = COALESCE(EXCLUDED.first_name, public.tg_users.first_name),
        last_name       = COALESCE(EXCLUDED.last_name, public.tg_users.last_name),
        language_code   = COALESCE(EXCLUDED.language_code, public.tg_users.language_code),
        last_seen_at    = GREATEST(public.tg_users.last_seen_at, NEW.created_at),
        last_command_at = CASE WHEN NEW.event_type = 'command'
                               THEN GREATEST(COALESCE(public.tg_users.last_command_at, to_timestamp(0)), NEW.created_at)
                               ELSE public.tg_users.last_command_at END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Touch/Upsert chat based on an event row
CREATE OR REPLACE FUNCTION public.tg_touch_chat() RETURNS trigger AS $$
BEGIN
  IF NEW.chat_id IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.tg_chats (chat_id, chat_type, title, first_seen_at, last_seen_at)
  VALUES (NEW.chat_id,
          COALESCE(NEW.meta->>'chat_type', NULL),
          COALESCE(NEW.meta->>'chat_title', NULL),
          NEW.created_at,
          NEW.created_at)
  ON CONFLICT (chat_id) DO UPDATE
    SET chat_type   = COALESCE(EXCLUDED.chat_type, public.tg_chats.chat_type),
        title       = COALESCE(EXCLUDED.title, public.tg_chats.title),
        last_seen_at= GREATEST(public.tg_chats.last_seen_at, NEW.created_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tg_logs_touch_user ON public.tg_command_logs;
CREATE TRIGGER trg_tg_logs_touch_user
AFTER INSERT ON public.tg_command_logs
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_user();

DROP TRIGGER IF EXISTS trg_tg_logs_touch_chat ON public.tg_command_logs;
CREATE TRIGGER trg_tg_logs_touch_chat
AFTER INSERT ON public.tg_command_logs
FOR EACH ROW EXECUTE FUNCTION public.tg_touch_chat();

-- 5) Convenience aggregates
CREATE OR REPLACE VIEW public.vw_tg_usage_daily AS
SELECT
  date_trunc('day', created_at) AS day,
  count(*)                      AS events,
  count(*) FILTER (WHERE event_type = 'command') AS command_events,
  count(DISTINCT user_id)       AS dau,
  count(DISTINCT CASE WHEN event_type = 'command' THEN user_id END) AS dau_commands
FROM public.tg_command_logs
GROUP BY 1
ORDER BY 1 DESC;

CREATE OR REPLACE VIEW public.vw_tg_top_commands_30d AS
SELECT
  normalized_command,
  count(*) AS uses
FROM public.tg_command_logs
WHERE created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY uses DESC;

