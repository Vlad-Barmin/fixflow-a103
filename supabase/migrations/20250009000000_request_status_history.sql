-- ============================================================================
-- Migration: 20250009000000_request_status_history.sql
-- Purpose: request_status_history — audit trail of status changes on requests.
--          Inserted on every status change by API/cron/AI handlers.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.request_status_history CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.request_status_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  old_status   text,
  new_status   text NOT NULL,
  changed_by   text,  -- 'manager' | 'contractor' | 'system' | 'ai'
  reason       text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_request_status_history_request_id
  ON public.request_status_history(request_id);

CREATE INDEX IF NOT EXISTS idx_request_status_history_created_at
  ON public.request_status_history(created_at DESC);

-- RLS
ALTER TABLE public.request_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers_all_request_status_history" ON public.request_status_history;
CREATE POLICY "managers_all_request_status_history"
  ON public.request_status_history
  FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());
