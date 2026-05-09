-- ============================================================================
-- Migration: 20250014000000_telegram_bot_states.sql
-- Purpose: telegram_bot_states — conversation state machine for owner bot
--          registration flow (consent → name → phone → complex → building →
--          apartment → registered).
--
-- IMPORTANT: RLS is intentionally DISABLED on this table.
--            Access is restricted to service_role only (Telegram webhook
--            handlers in /api/telegram/*). The anon key cannot reach this
--            table because the API never exposes it.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.telegram_bot_states CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.telegram_bot_states (
  chat_id     bigint PRIMARY KEY,
  state       text NOT NULL DEFAULT 'awaiting_consent'
    CHECK (state IN (
      'awaiting_consent',
      'awaiting_name',
      'awaiting_phone',
      'awaiting_complex',
      'awaiting_building',
      'awaiting_apartment',
      'registered'
    )),
  data        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_telegram_bot_states_state
  ON public.telegram_bot_states(state);

-- updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at ON public.telegram_bot_states;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.telegram_bot_states
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS DISABLED — service_role only.
ALTER TABLE public.telegram_bot_states DISABLE ROW LEVEL SECURITY;

-- Defensive: revoke any default grants from anon/authenticated.
REVOKE ALL ON public.telegram_bot_states FROM anon, authenticated;
GRANT  ALL ON public.telegram_bot_states TO service_role;
