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
