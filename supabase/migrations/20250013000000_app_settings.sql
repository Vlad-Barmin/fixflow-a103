-- ============================================================================
-- Migration: 20250013000000_app_settings.sql
-- Purpose: app_settings — key/value table for runtime-configurable settings
--          (SLA days, AI confidence threshold, rate limits, etc.)
--
-- Rollback:
--   DROP TABLE IF EXISTS public.app_settings CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  key          text PRIMARY KEY,
  value        text NOT NULL,
  description  text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at ON public.app_settings;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Seed defaults (idempotent)
INSERT INTO public.app_settings (key, value, description) VALUES
  ('ai_daily_limit',         '200',  'Hard daily cap on Claude classification calls'),
  ('ai_confidence_threshold','0.5',  'Min AI confidence to auto-route; below → manual review'),
  ('business_hours_start',   '9',    'Business day start hour (MSK)'),
  ('business_hours_end',     '18',   'Business day end hour / SLA cutoff (MSK)'),
  ('sla_days',               '5',    'SLA business days for deadline calculation'),
  ('sla_business_days',      '5',    'Alias for sla_days (kept for compatibility)'),
  ('sla_deadline_hour',      '18',   'Deadline cutoff hour (MSK, 24h)'),
  ('overdue_notification_cooldown_hours','6','Min hours between repeated overdue alerts')
ON CONFLICT (key) DO NOTHING;

-- RLS
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers_all_app_settings" ON public.app_settings;
CREATE POLICY "managers_all_app_settings"
  ON public.app_settings
  FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());
