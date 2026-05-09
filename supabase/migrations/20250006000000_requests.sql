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
