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
