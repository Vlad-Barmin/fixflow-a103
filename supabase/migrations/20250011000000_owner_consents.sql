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
