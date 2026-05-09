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
