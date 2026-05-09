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
