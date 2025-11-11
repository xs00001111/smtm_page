-- Optional helper: upsert convenience RPC for logging from the bot (if you want to use PostgREST)

-- NOTE: This is optional. If you prefer to write directly to tg_command_logs via REST
-- you can skip creating RPCs. Keeping it here for convenience.

CREATE OR REPLACE FUNCTION public.log_tg_event(
  p_user_id bigint,
  p_chat_id bigint,
  p_event_type tg_event_type,
  p_command text,
  p_normalized text,
  p_args text,
  p_status tg_status,
  p_error text,
  p_duration_ms integer,
  p_message_id bigint,
  p_callback_data text,
  p_action_type text,
  p_app_version text,
  p_meta jsonb
) RETURNS bigint AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO public.tg_command_logs (
    user_id, chat_id, event_type, command, normalized_command, args, status,
    error, duration_ms, message_id, callback_data, action_type, app_version, meta
  ) VALUES (
    p_user_id, p_chat_id, p_event_type, p_command, p_normalized, p_args, p_status,
    p_error, p_duration_ms, p_message_id, p_callback_data, p_action_type, p_app_version, COALESCE(p_meta, '{}'::jsonb)
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Index to speed up distinct users over long ranges
CREATE INDEX IF NOT EXISTS idx_tg_logs_user_created ON public.tg_command_logs (user_id, created_at DESC);

