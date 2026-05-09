-- ================================================================
-- FIX: Infinite recursion in staff_records RLS — 2026-05-09
--
-- Root cause:
--   get_my_school_id() is LANGUAGE SQL SECURITY DEFINER and queries
--   public.staff_records. The staff_select_own_school_staff policy
--   on staff_records calls get_my_school_id(). This creates a cycle:
--     staff_records policy → get_my_school_id() → staff_records → ...
--   PostgreSQL throws "infinite recursion detected in policy for
--   relation 'staff_records'" and all logins fail.
--
-- Why SECURITY DEFINER alone wasn't enough:
--   In Supabase Cloud the postgres role may not always have BYPASSRLS
--   in the effective session context, so RLS still fires on the
--   nested staff_records query inside the function.
--
-- Fix:
--   Rewrite get_my_school_id() as LANGUAGE plpgsql with
--   SET row_security = off. That directive explicitly disables RLS
--   for the duration of the function call (allowed because the
--   function owner is postgres, a Supabase superuser).
--   The function still reads staff_records, but without triggering
--   the policy that would cause recursion.
-- ================================================================

-- Replace helper: plpgsql + row_security = off breaks the cycle
CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_school_id UUID;
BEGIN
  SELECT school_id INTO v_school_id
  FROM   public.staff_records
  WHERE  user_id = auth.uid()::text
  LIMIT  1;
  RETURN v_school_id;
END;
$$;

-- Re-create the staff_records policy (idempotent).
-- Belt-and-suspenders: keep the OR user_id = auth.uid()::text fallback
-- so staff can always read their own row even if get_my_school_id()
-- returns NULL (e.g. during first-ever login before school context loads).
DROP POLICY IF EXISTS "staff_select_own_school_staff" ON public.staff_records;

CREATE POLICY "staff_select_own_school_staff"
  ON public.staff_records
  FOR SELECT
  TO authenticated
  USING (
    school_id = public.get_my_school_id()
    OR user_id = auth.uid()::text
  );
