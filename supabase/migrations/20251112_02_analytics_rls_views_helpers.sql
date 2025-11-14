-- RLS, views, and helper RPCs for analytics schema
-- Scope: enable row-level security, add reporting views, and provide a
-- SECURITY DEFINER helper to log command events with user/chat upserts.

-- 1) Enable RLS on core tables (deny by default: no permissive policies)
ALTER TABLE analytics.tg_user ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.tg_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics.command_event ENABLE ROW LEVEL SECURITY;

-- Optional: You can add explicit policies later if you want to expose
-- read access to authenticated users. Service role bypasses RLS.

-- 2) Views for common analytics
CREATE OR REPLACE VIEW analytics.v_daily_active_users_commands AS
SELECT
  date_trunc('day', ce.created_at)::date AS day,
  count(DISTINCT ce.user_id)             AS dau
FROM analytics.command_event ce
GROUP BY 1
ORDER BY 1 DESC;

CREATE OR REPLACE VIEW analytics.v_command_usage_daily AS
SELECT
  date_trunc('day', ce.created_at)::date AS day,
  ce.command                              AS command,
  count(*)                                 AS uses
FROM analytics.command_event ce
GROUP BY 1, 2
ORDER BY 1 DESC, uses DESC;

CREATE OR REPLACE VIEW analytics.v_new_users_daily AS
SELECT
  date_trunc('day', u.first_seen_at)::date AS day,
  count(*)                                  AS new_users
FROM analytics.tg_user u
GROUP BY 1
ORDER BY 1 DESC;

CREATE OR REPLACE VIEW analytics.v_top_commands_30d AS
SELECT
  ce.command,
  count(*) AS uses
FROM analytics.command_event ce
WHERE ce.created_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY uses DESC;

-- 3) Helper: single-call logger with upserts
-- Place in public schema for PostgREST RPC exposure; operates on analytics tables.
CREATE OR REPLACE FUNCTION public.analytics_log_command(
  p_telegram_user_id     bigint,
  p_username             text,
  p_language_code        text,
  p_is_bot               boolean,
  p_telegram_chat_id     bigint,
  p_chat_type            text,           -- private|group|supergroup|channel
  p_chat_title           text,
  p_command              text,
  p_args                 jsonb,
  p_bot_id               text,
  p_telegram_message_id  bigint,
  p_meta                 jsonb
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = analytics, public
AS $$
DECLARE
  v_event_id bigint;
BEGIN
  -- Upsert user
  INSERT INTO analytics.tg_user (
    telegram_user_id, username, language_code, is_bot, first_seen_at, last_seen_at
  ) VALUES (
    p_telegram_user_id, p_username, p_language_code, COALESCE(p_is_bot, false), now(), now()
  ) ON CONFLICT (telegram_user_id) DO UPDATE
    SET username      = COALESCE(EXCLUDED.username, analytics.tg_user.username),
        language_code = COALESCE(EXCLUDED.language_code, analytics.tg_user.language_code),
        is_bot        = COALESCE(EXCLUDED.is_bot, analytics.tg_user.is_bot),
        last_seen_at  = GREATEST(analytics.tg_user.last_seen_at, now());

  -- Upsert chat (if provided)
  IF p_telegram_chat_id IS NOT NULL THEN
    INSERT INTO analytics.tg_chat (
      telegram_chat_id, type, title, first_seen_at, last_seen_at
    ) VALUES (
      p_telegram_chat_id, p_chat_type, p_chat_title, now(), now()
    ) ON CONFLICT (telegram_chat_id) DO UPDATE
      SET type        = COALESCE(EXCLUDED.type, analytics.tg_chat.type),
          title       = COALESCE(EXCLUDED.title, analytics.tg_chat.title),
          last_seen_at= GREATEST(analytics.tg_chat.last_seen_at, now());
  END IF;

  -- Insert command event
  INSERT INTO analytics.command_event (
    created_at, user_id, chat_id, telegram_message_id, command, args, bot_id, meta
  ) VALUES (
    now(), p_telegram_user_id, p_telegram_chat_id, p_telegram_message_id, p_command,
    p_args, p_bot_id, COALESCE(p_meta, '{}'::jsonb)
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- Expose function to common API roles (adjust as needed)
GRANT EXECUTE ON FUNCTION public.analytics_log_command(
  bigint, text, text, boolean, bigint, text, text, text, jsonb, text, bigint, jsonb
) TO service_role;
