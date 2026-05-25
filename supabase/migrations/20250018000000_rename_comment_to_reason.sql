-- ============================================================================
-- Migration: 20250018000000_rename_comment_to_reason.sql
-- Purpose: Fix column name mismatch in request_status_history.
--          The column was created as `comment` but all application code
--          and TypeScript types reference it as `reason`. This rename
--          makes the schema match the code, fixing 404 on /dashboard/requests/[id].
--
-- Rollback:
--   ALTER TABLE public.request_status_history RENAME COLUMN reason TO comment;
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'request_status_history'
      AND column_name  = 'comment'
  ) THEN
    ALTER TABLE public.request_status_history RENAME COLUMN comment TO reason;
  END IF;
END $$;
