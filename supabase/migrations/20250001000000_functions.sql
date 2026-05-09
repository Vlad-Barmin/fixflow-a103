-- ============================================================================
-- Migration: 20250001000000_functions.sql
-- Purpose: Helper functions used across schema
--   - update_updated_at(): trigger function for auto-updating updated_at
--   - is_manager(): RLS helper, checks if current auth user is a manager
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.is_manager();
--   DROP FUNCTION IF EXISTS public.update_updated_at();
-- ============================================================================

-- Generic trigger function for updated_at columns
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Manager check: looks up manager_profiles by current auth.uid()
-- SECURITY DEFINER so RLS on manager_profiles does not cause recursion
CREATE OR REPLACE FUNCTION public.is_manager()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.manager_profiles
    WHERE id = auth.uid()
  );
$$;

-- Allow execution from authenticated and anon roles (anon will simply return false)
GRANT EXECUTE ON FUNCTION public.is_manager() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.update_updated_at() TO authenticated, service_role;
