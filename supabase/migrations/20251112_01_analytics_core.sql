-- Core Telegram analytics schema (tables + indexes only)
-- This initial migration creates minimal structures to track unique users,
-- chats, and per-command events. Views, triggers, and helpers will come later.

-- No UUIDs needed; we use Telegram IDs as natural keys

-- Dedicated schema to isolate analytics objects
CREATE SCHEMA IF NOT EXISTS analytics;

-- Users seen by the bot (1 row per Telegram user)
CREATE TABLE IF NOT EXISTS analytics.tg_user (
  telegram_user_id  bigint PRIMARY KEY,
  username          text,
  language_code     text,
  is_bot            boolean NOT NULL DEFAULT false,
  first_seen_at     timestamptz NOT NULL DEFAULT now(),
  last_seen_at      timestamptz NOT NULL DEFAULT now()
);

-- Index to speed up recency queries (DAU/WAU via last_seen)
CREATE INDEX IF NOT EXISTS idx_tg_user_last_seen
  ON analytics.tg_user (last_seen_at DESC);

-- Chats where interactions occur (private/group/supergroup/channel)
CREATE TABLE IF NOT EXISTS analytics.tg_chat (
  telegram_chat_id   bigint PRIMARY KEY,
  type               text NOT NULL CHECK (type IN ('private','group','supergroup','channel')),
  title              text,
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tg_chat_last_seen
  ON analytics.tg_chat (last_seen_at DESC);

-- One row per invoked command (facts)
CREATE TABLE IF NOT EXISTS analytics.command_event (
  id                   bigserial PRIMARY KEY,
  created_at           timestamptz NOT NULL DEFAULT now(),
  user_id              bigint NOT NULL REFERENCES analytics.tg_user(telegram_user_id) ON DELETE CASCADE,
  chat_id              bigint REFERENCES analytics.tg_chat(telegram_chat_id) ON DELETE SET NULL,
  telegram_message_id  bigint,
  command              text NOT NULL,          -- canonical command key (e.g., 'start')
  args                 jsonb,                  -- parsed args or raw tail
  bot_id               text,                   -- optional if multiple bots
  meta                 jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Core indexes to support common queries
CREATE INDEX IF NOT EXISTS idx_cmd_event_created_at
  ON analytics.command_event (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cmd_event_command_created
  ON analytics.command_event (command, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cmd_event_user_created
  ON analytics.command_event (user_id, created_at DESC);
