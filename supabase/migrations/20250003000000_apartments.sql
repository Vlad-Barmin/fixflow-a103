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
