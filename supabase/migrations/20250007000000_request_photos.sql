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
