-- ============================================================================
-- Migration: 20250017000000_fix_telegram_bot_states_check.sql
-- Purpose: Add missing states used by contractor-handler.ts to the
--          telegram_bot_states.state CHECK constraint:
--            'awaiting_completion_photo' — waiting for completion photo from contractor
--            'idle' — neutral state after a flow is complete (contractor-side)
--
-- Rollback:
--   ALTER TABLE public.telegram_bot_states
--     DROP CONSTRAINT IF EXISTS telegram_bot_states_state_check;
--   ALTER TABLE public.telegram_bot_states
--     ADD CONSTRAINT telegram_bot_states_state_check
--     CHECK (state IN (
--       'awaiting_consent','awaiting_name','awaiting_phone',
--       'awaiting_complex','awaiting_building','awaiting_apartment','registered'
--     ));
-- ============================================================================

ALTER TABLE public.telegram_bot_states
  DROP CONSTRAINT IF EXISTS telegram_bot_states_state_check;

ALTER TABLE public.telegram_bot_states
  ADD CONSTRAINT telegram_bot_states_state_check
  CHECK (state IN (
    'awaiting_consent',
    'awaiting_name',
    'awaiting_phone',
    'awaiting_complex',
    'awaiting_building',
    'awaiting_apartment',
    'registered',
    'awaiting_completion_photo',
    'idle'
  ));
