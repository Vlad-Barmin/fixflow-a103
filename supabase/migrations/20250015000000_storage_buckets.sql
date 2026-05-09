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
