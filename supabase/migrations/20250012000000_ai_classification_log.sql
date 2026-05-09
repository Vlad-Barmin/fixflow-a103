-- ============================================================================
-- Migration: 20250012000000_ai_classification_log.sql
-- Purpose: ai_classification_log — record of every Claude classification call.
--          Used for cost tracking, debugging, daily rate-limit enforcement.
--
-- Retention: rows older than 90 days must be purged (152-ФЗ requirement).
--   See trailing pg_cron section. If pg_cron is not enabled in Supabase,
--   set up a Vercel cron hitting a /api/cron/* endpoint that runs:
--     DELETE FROM public.ai_classification_log
--     WHERE created_at < now() - interval '90 days';
--
-- Rollback:
--   DROP TABLE IF EXISTS public.ai_classification_log CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_classification_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        uuid REFERENCES public.requests(id) ON DELETE SET NULL,
  model             text NOT NULL,
  input_tokens      integer,
  output_tokens     integer,
  cost_usd          numeric(10,6),
  confidence        numeric(4,3)
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  category_result   text,
  priority_result   text,
  latency_ms        integer,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ai_classification_log_request_id
  ON public.ai_classification_log(request_id)
  WHERE request_id IS NOT NULL;

-- For purge job and daily-limit COUNT(*) WHERE created_at >= today
CREATE INDEX IF NOT EXISTS idx_ai_classification_log_created_at
  ON public.ai_classification_log(created_at DESC);

-- RLS
ALTER TABLE public.ai_classification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers_select_ai_classification_log" ON public.ai_classification_log;
CREATE POLICY "managers_select_ai_classification_log"
  ON public.ai_classification_log
  FOR SELECT
  TO authenticated
  USING (public.is_manager());

-- INSERT/DELETE only via service_role (AI classifier server-side code).

-- ----------------------------------------------------------------------------
-- 90-day purge via pg_cron (best-effort: only registers if pg_cron available)
-- If this DO block fails silently, schedule the purge via Vercel cron instead.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purge_ai_classification_log')
      WHERE EXISTS (
        SELECT 1 FROM cron.job WHERE jobname = 'purge_ai_classification_log'
      );
    PERFORM cron.schedule(
      'purge_ai_classification_log',
      '0 3 * * *',  -- daily at 03:00 UTC
      $cron$
        DELETE FROM public.ai_classification_log
        WHERE created_at < now() - interval '90 days';
      $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not available or insufficient privileges; fall back to Vercel cron.
  RAISE NOTICE 'pg_cron purge job not registered: %', SQLERRM;
END $$;
