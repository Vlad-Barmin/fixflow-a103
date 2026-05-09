-- ============================================================================
-- Migration: 20250010000000_manager_profiles.sql
-- Purpose: manager_profiles — extends auth.users for warranty managers.
--          Presence of a row in this table = "user is a manager"
--          (used by is_manager()).
--
-- Rollback:
--   DROP TABLE IF EXISTS public.manager_profiles CASCADE;
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.manager_profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at ON public.manager_profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.manager_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.manager_profiles ENABLE ROW LEVEL SECURITY;

-- A manager can SELECT/UPDATE their own profile.
-- All managers can see other manager profiles (small team).
DROP POLICY IF EXISTS "managers_select_manager_profiles" ON public.manager_profiles;
CREATE POLICY "managers_select_manager_profiles"
  ON public.manager_profiles
  FOR SELECT
  TO authenticated
  USING (public.is_manager() OR id = auth.uid());

DROP POLICY IF EXISTS "managers_update_own_profile" ON public.manager_profiles;
CREATE POLICY "managers_update_own_profile"
  ON public.manager_profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- INSERT/DELETE only via service_role (no policy → blocked for authenticated)
