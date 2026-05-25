-- ============================================================
-- COMBINED MIGRATIONS FOR FIXFLOW A103
-- Generated: 2026-05-12
-- Total migrations: 17
-- Apply via: Supabase Dashboard → SQL Editor → paste → Run
-- ============================================================

-- ============================================================
-- MIGRATION: 20250001000000_functions.sql
-- ============================================================

-- ============================================================================
-- Migration: 20250001000000_functions.sql
-- Purpose: Helper functions used across schema
--   - update_updated_at(): trigger function for auto-updating updated_at
--   - is_manager(): RLS helper, checks if current auth user is a manager
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.is_manager();
--   DROP FUNCTION IF EXISTS public.update_updated_at();
-- ============================================================================

-- Generic trigger function for updated_at columns
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Manager check: looks up manager_profiles by current auth.uid()
-- SECURITY DEFINER so RLS on manager_profiles does not cause recursion
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.manager_profiles WHERE id = auth.uid()
  );
END;
$$;

-- Allow execution from authenticated and anon roles (anon will simply return false)
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_updated_at() TO authenticated, service_role;

-- ============================================================
-- MIGRATION: 20250002000000_residential_complexes.sql
-- ============================================================

-- ============================================================================
-- Migration: 20250002000000_residential_complexes.sql
-- Purpose: residential_complexes table — list of housing complexes (ЖК)
--
-- Rollback:
--   DROP TABLE IF EXISTS public.residential_complexes CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.residential_complexes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  address     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at ON public.residential_complexes;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.residential_complexes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.residential_complexes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers_all_residential_complexes" ON public.residential_complexes;
CREATE POLICY "managers_all_residential_complexes"
  ON public.residential_complexes
  FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ============================================================
-- MIGRATION: 20250003000000_apartments.sql
-- ============================================================

-- ============================================================================
-- Migration: 20250003000000_apartments.sql
-- Purpose: apartments table — apartment registry with owner contact info
--
-- Rollback:
--   DROP TABLE IF EXISTS public.apartments CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.apartments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  complex_id               uuid NOT NULL REFERENCES public.residential_complexes(id) ON DELETE RESTRICT,
  building                 text NOT NULL,
  number                   text NOT NULL,
  owner_name               text,
  owner_phone              text,
  owner_telegram_chat_id   bigint UNIQUE,
  warranty_expires_at      timestamptz,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (complex_id, building, number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_apartments_complex_id
  ON public.apartments(complex_id);

CREATE INDEX IF NOT EXISTS idx_apartments_owner_telegram_chat_id
  ON public.apartments(owner_telegram_chat_id)
  WHERE owner_telegram_chat_id IS NOT NULL;

-- updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at ON public.apartments;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.apartments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.apartments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers_all_apartments" ON public.apartments;
CREATE POLICY "managers_all_apartments"
  ON public.apartments
  FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ============================================================
-- MIGRATION: 20250004000000_contractors.sql
-- ============================================================

-- ============================================================================
-- Migration: 20250004000000_contractors.sql
-- Purpose: contractors table — repair contractors with Telegram channel binding
--
-- Rollback:
--   DROP TABLE IF EXISTS public.contractors CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.contractors (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  telegram_channel_id   bigint NOT NULL UNIQUE,
  phone                 text,
  categories            text[] NOT NULL DEFAULT '{}',
  is_active             boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contractors_categories_valid CHECK (
    categories <@ ARRAY[
      'electrical','plumbing','hvac','structural',
      'windows_doors','finishing','appliances','other'
    ]::text[]
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contractors_categories
  ON public.contractors USING GIN (categories);

CREATE INDEX IF NOT EXISTS idx_contractors_is_active
  ON public.contractors(is_active)
  WHERE is_active = true;

-- updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at ON public.contractors;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.contractors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers_all_contractors" ON public.contractors;
CREATE POLICY "managers_all_contractors"
  ON public.contractors
  FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ============================================================
-- MIGRATION: 20250005000000_apartment_contractors.sql
-- ============================================================

-- ============================================================================
-- Migration: 20250005000000_apartment_contractors.sql
-- Purpose: junction table mapping (apartment_id, category) -> contractor_id
--          Used by AI dispatcher to route requests to the right contractor.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.apartment_contractors CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.apartment_contractors (
  apartment_id   uuid NOT NULL REFERENCES public.apartments(id) ON DELETE CASCADE,
  category       text NOT NULL CHECK (category IN (
    'electrical','plumbing','hvac','structural',
    'windows_doors','finishing','appliances','other'
  )),
  contractor_id  uuid NOT NULL REFERENCES public.contractors(id) ON DELETE RESTRICT,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (apartment_id, category)
);

-- Indexes (on FKs)
CREATE INDEX IF NOT EXISTS idx_apartment_contractors_apartment_id
  ON public.apartment_contractors(apartment_id);

CREATE INDEX IF NOT EXISTS idx_apartment_contractors_contractor_id
  ON public.apartment_contractors(contractor_id);

CREATE INDEX IF NOT EXISTS idx_apartment_contractors_category
  ON public.apartment_contractors(category);

-- RLS
ALTER TABLE public.apartment_contractors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers_all_apartment_contractors" ON public.apartment_contractors;
CREATE POLICY "managers_all_apartment_contractors"
  ON public.apartment_contractors
  FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ============================================================
-- MIGRATION: 20250006000000_requests.sql
-- ============================================================

-- ============================================================================
-- Migration: 20250006000000_requests.sql
-- Purpose: requests table — central table for warranty repair requests.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.requests CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.requests (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id             uuid NOT NULL REFERENCES public.apartments(id) ON DELETE RESTRICT,
  description              text NOT NULL,
  status                   text NOT NULL DEFAULT 'new'
    CHECK (status IN (
      'new','ai_processing','routed','accepted',
      'in_progress','completed','requires_manual_review'
    )),
  priority                 text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  category                 text
    CHECK (category IS NULL OR category IN (
      'electrical','plumbing','hvac','structural',
      'windows_doors','finishing','appliances','other'
    )),
  ai_confidence            numeric(4,3)
    CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
  ai_raw_response          jsonb,
  contractor_id            uuid REFERENCES public.contractors(id) ON DELETE SET NULL,
  deadline                 timestamptz,
  telegram_message_id      bigint,
  requires_manual_review   boolean NOT NULL DEFAULT false,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_requests_status
  ON public.requests(status);

CREATE INDEX IF NOT EXISTS idx_requests_created_at
  ON public.requests(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_requests_deadline
  ON public.requests(deadline);

CREATE INDEX IF NOT EXISTS idx_requests_apartment_id
  ON public.requests(apartment_id);

CREATE INDEX IF NOT EXISTS idx_requests_contractor_id
  ON public.requests(contractor_id)
  WHERE contractor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_requests_contractor_status
  ON public.requests(contractor_id, status);

CREATE INDEX IF NOT EXISTS idx_requests_category
  ON public.requests(category)
  WHERE category IS NOT NULL;

-- Partial index for active (not completed) requests with deadlines
CREATE INDEX IF NOT EXISTS idx_requests_active_deadline
  ON public.requests(status, deadline)
  WHERE status NOT IN ('completed');

-- updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at ON public.requests;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers_all_requests" ON public.requests;
CREATE POLICY "managers_all_requests"
  ON public.requests
  FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ============================================================
-- MIGRATION: 20250007000000_request_photos.sql
-- ============================================================

-- ============================================================================
-- Migration: 20250007000000_request_photos.sql
-- Purpose: request_photos — photos attached to a request by the owner.
--          Files live in Storage bucket 'request-photos'.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.request_photos CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.request_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_request_photos_request_id
  ON public.request_photos(request_id);

-- RLS
ALTER TABLE public.request_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers_all_request_photos" ON public.request_photos;
CREATE POLICY "managers_all_request_photos"
  ON public.request_photos
  FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ============================================================
-- MIGRATION: 20250008000000_request_completion_photos.sql
-- ============================================================

-- ============================================================================
-- Migration: 20250008000000_request_completion_photos.sql
-- Purpose: request_completion_photos — photos uploaded by contractor after fix.
--          Files live in Storage bucket 'completion-photos'.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.request_completion_photos CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.request_completion_photos (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id                  uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  storage_path                text NOT NULL,
  uploaded_by_contractor_id   uuid REFERENCES public.contractors(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_request_completion_photos_request_id
  ON public.request_completion_photos(request_id);

CREATE INDEX IF NOT EXISTS idx_request_completion_photos_contractor_id
  ON public.request_completion_photos(uploaded_by_contractor_id)
  WHERE uploaded_by_contractor_id IS NOT NULL;

-- RLS
ALTER TABLE public.request_completion_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "managers_all_request_completion_photos" ON public.request_completion_photos;
CREATE POLICY "managers_all_request_completion_photos"
  ON public.request_completion_photos
  FOR ALL
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ============================================================
-- MIGRATION: 20250009000000_request_status_history.sql
-- ============================================================

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

-- ============================================================
-- MIGRATION: 20250010000000_manager_profiles.sql
-- ============================================================

-- ============================================================================
-- Migration: 20250010000000_manager_profiles.sql
-- Purpose: manager_profiles — extends auth.users for warranty managers.
--          Presence of a row in this table = "user is a manager"
--          (used by is_manager()).
--
-- Rollback:
--   DROP TABLE IF EXISTS public.manager_profiles CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.manager_profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at ON public.manager_profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.manager_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.manager_profiles ENABLE ROW LEVEL SECURITY;

-- A manager can SELECT/UPDATE their own profile.
-- All managers can see other manager profiles (small team).
DROP POLICY IF EXISTS "managers_select_manager_profiles" ON public.manager_profiles;
CREATE POLICY "managers_select_manager_profiles"
  ON public.manager_profiles
  FOR SELECT
  TO authenticated
  USING (public.is_manager() OR id = auth.uid());

DROP POLICY IF EXISTS "managers_update_own_profile" ON public.manager_profiles;
CREATE POLICY "managers_update_own_profile"
  ON public.manager_profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- INSERT/DELETE only via service_role (no policy → blocked for authenticated)

-- ============================================================
-- MIGRATION: 20250011000000_owner_consents.sql
-- ============================================================

-- ============================================================================
-- Migration: 20250011000000_owner_consents.sql
-- Purpose: owner_consents — 152-ФЗ personal-data consent records.
--          Stores full consent text snapshot at time of acceptance,
--          plus revocation timestamp for opt-out.
--
-- Rollback:
--   DROP TABLE IF EXISTS public.owner_consents CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.owner_consents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  apartment_id        uuid REFERENCES public.apartments(id) ON DELETE SET NULL,
  telegram_chat_id    bigint,
  consent_text        text NOT NULL,
  consented_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at          timestamptz,
  ip_address          inet
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_owner_consents_apartment_id
  ON public.owner_consents(apartment_id)
  WHERE apartment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_owner_consents_telegram_chat_id
  ON public.owner_consents(telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_owner_consents_consented_at
  ON public.owner_consents(consented_at DESC);

-- RLS
ALTER TABLE public.owner_consents ENABLE ROW LEVEL SECURITY;

-- Managers can read all consents (compliance / audit).
DROP POLICY IF EXISTS "managers_select_owner_consents" ON public.owner_consents;
CREATE POLICY "managers_select_owner_consents"
  ON public.owner_consents
  FOR SELECT
  TO authenticated
  USING (public.is_manager());

-- INSERT performed via service_role from Telegram webhook handler
-- (no policy for authenticated → blocked).
-- UPDATE (for revocation) — managers only.
DROP POLICY IF EXISTS "managers_update_owner_consents" ON public.owner_consents;
CREATE POLICY "managers_update_owner_consents"
  ON public.owner_consents
  FOR UPDATE
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

-- ============================================================
-- MIGRATION: 20250012000000_ai_classification_log.sql
-- ============================================================

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

-- ============================================================
-- MIGRATION: 20250013000000_app_settings.sql
-- ============================================================

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

-- ============================================================
-- MIGRATION: 20250014000000_telegram_bot_states.sql
-- ============================================================

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

-- ============================================================
-- MIGRATION: 20250015000000_storage_buckets.sql
-- ============================================================

-- ============================================================================
-- Migration: 20250015000000_storage_buckets.sql
-- Purpose: Create private Storage buckets for owner request photos and
--          contractor completion photos. Both are private; clients access
--          objects only via signed URLs generated server-side.
--
-- Rollback:
--   DELETE FROM storage.buckets WHERE id IN ('request-photos','completion-photos');
-- ============================================================================

-- Create buckets (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('request-photos',    'request-photos',    false, 10485760,
    ARRAY['image/jpeg','image/png','image/webp']),
  ('completion-photos', 'completion-photos', false, 10485760,
    ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- RLS policies on storage.objects
--   - SELECT: managers (via is_manager()) can list/read both buckets so the
--             dashboard can generate signed URLs for previewing.
--   - INSERT/UPDATE/DELETE: NOT permitted from anon/authenticated; only
--             service_role (used by Telegram webhook handlers) can write.
-- ----------------------------------------------------------------------------

-- Managers can read request-photos
DROP POLICY IF EXISTS "managers_read_request_photos" ON storage.objects;
CREATE POLICY "managers_read_request_photos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'request-photos' AND public.is_manager());

-- Managers can read completion-photos
DROP POLICY IF EXISTS "managers_read_completion_photos" ON storage.objects;
CREATE POLICY "managers_read_completion_photos"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'completion-photos' AND public.is_manager());

-- Note: no INSERT/UPDATE/DELETE policies for authenticated → all writes
-- must go through service_role, which bypasses RLS.

-- ============================================================
-- MIGRATION: 20250016000000_seed_dev.sql
-- ============================================================

-- ============================================================================
-- Migration: 20250016000000_seed_dev.sql
-- Purpose: Development seed data. Idempotent (uses fixed UUIDs + ON CONFLICT).
--
--   - 1 ЖК: "ЖК Звёздный"
--   - 3 квартиры (кв. 1, 15, 42)
--   - 2 подрядчика
--       * "ЭлектроПлюс" — electrical, plumbing
--       * "КлиматСтрой" — hvac, structural
--   - apartment_contractors привязки на все 3 квартиры × 4 категории
--
-- WARNING: do NOT run this migration in production.
--          It is intended for local Supabase dev environment only.
--
-- Rollback:
--   DELETE FROM public.apartment_contractors WHERE apartment_id IN (...);
--   DELETE FROM public.apartments            WHERE id IN (...);
--   DELETE FROM public.contractors           WHERE id IN (...);
--   DELETE FROM public.residential_complexes WHERE id IN (...);
-- ============================================================================

-- Fixed UUIDs (kept stable so re-runs are idempotent)
-- Complex
--   c0000001-... — ЖК Звёздный
-- Apartments
--   a0000001-... кв. 1
--   a0000002-... кв. 15
--   a0000003-... кв. 42
-- Contractors
--   b0000001-... ЭлектроПлюс
--   b0000002-... КлиматСтрой

-- ---- Residential complex ----
INSERT INTO public.residential_complexes (id, name, address)
VALUES
  ('c0000001-0000-0000-0000-000000000001',
   'ЖК Звёздный',
   'ул. Звёздная, д. 1, Москва')
ON CONFLICT (id) DO NOTHING;

-- ---- Apartments ----
INSERT INTO public.apartments
  (id, complex_id, building, number, owner_name, owner_phone,
   owner_telegram_chat_id, warranty_expires_at)
VALUES
  ('a0000001-0000-0000-0000-000000000001',
   'c0000001-0000-0000-0000-000000000001',
   '1', '1',
   'Иванов Иван Иванович',  '+79991110001',
   100000001,
   (now() + interval '2 years')),
  ('a0000002-0000-0000-0000-000000000002',
   'c0000001-0000-0000-0000-000000000001',
   '1', '15',
   'Петрова Мария Сергеевна', '+79991110015',
   100000015,
   (now() + interval '1 year')),
  ('a0000003-0000-0000-0000-000000000003',
   'c0000001-0000-0000-0000-000000000001',
   '2', '42',
   'Сидоров Алексей Петрович', '+79991110042',
   100000042,
   (now() + interval '3 years'))
ON CONFLICT (id) DO NOTHING;

-- ---- Contractors ----
INSERT INTO public.contractors
  (id, name, telegram_channel_id, phone, categories, is_active)
VALUES
  ('b0000001-0000-0000-0000-000000000001',
   'ЭлектроПлюс',
   -1001000000001,
   '+79992220001',
   ARRAY['electrical','plumbing']::text[],
   true),
  ('b0000002-0000-0000-0000-000000000002',
   'КлиматСтрой',
   -1001000000002,
   '+79992220002',
   ARRAY['hvac','structural']::text[],
   true)
ON CONFLICT (id) DO NOTHING;

-- ---- Apartment ↔ contractor bindings ----
-- Все 3 квартиры получают одинаковый набор подрядчиков.
INSERT INTO public.apartment_contractors (apartment_id, category, contractor_id)
VALUES
  -- кв. 1
  ('a0000001-0000-0000-0000-000000000001', 'electrical', 'b0000001-0000-0000-0000-000000000001'),
  ('a0000001-0000-0000-0000-000000000001', 'plumbing',   'b0000001-0000-0000-0000-000000000001'),
  ('a0000001-0000-0000-0000-000000000001', 'hvac',       'b0000002-0000-0000-0000-000000000002'),
  ('a0000001-0000-0000-0000-000000000001', 'structural', 'b0000002-0000-0000-0000-000000000002'),
  -- кв. 15
  ('a0000002-0000-0000-0000-000000000002', 'electrical', 'b0000001-0000-0000-0000-000000000001'),
  ('a0000002-0000-0000-0000-000000000002', 'plumbing',   'b0000001-0000-0000-0000-000000000001'),
  ('a0000002-0000-0000-0000-000000000002', 'hvac',       'b0000002-0000-0000-0000-000000000002'),
  ('a0000002-0000-0000-0000-000000000002', 'structural', 'b0000002-0000-0000-0000-000000000002'),
  -- кв. 42
  ('a0000003-0000-0000-0000-000000000003', 'electrical', 'b0000001-0000-0000-0000-000000000001'),
  ('a0000003-0000-0000-0000-000000000003', 'plumbing',   'b0000001-0000-0000-0000-000000000001'),
  ('a0000003-0000-0000-0000-000000000003', 'hvac',       'b0000002-0000-0000-0000-000000000002'),
  ('a0000003-0000-0000-0000-000000000003', 'structural', 'b0000002-0000-0000-0000-000000000002')
ON CONFLICT (apartment_id, category) DO NOTHING;

-- ============================================================
-- MIGRATION: 20250017000000_fix_telegram_bot_states_check.sql
-- ============================================================

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
