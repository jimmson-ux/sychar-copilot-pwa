-- ================================================================
-- HOD Assignment Permissions + Department Reset
--
-- 1. is_hod_role() helper function
-- 2. staff_records_update_hod — lets HODs assign/unassign teachers
--    (was blocked: only is_admin_role() could update staff_records)
-- 3. Reset department = NULL for principal, deputy_principal,
--    dean_of_students, qaso so they appear in HOD unassigned pool
-- ================================================================

-- ── 1. is_hod_role() ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_hod_role()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
SET row_security = off
AS $$
DECLARE v_role TEXT;
BEGIN
  SELECT sub_role INTO v_role
  FROM   public.staff_records
  WHERE  user_id = auth.uid()::text
  LIMIT  1;
  RETURN COALESCE(v_role LIKE 'hod_%', false);
END;
$$;

-- ── 2. HOD can update any staff record in their school ────────────────────────
-- Scoped to same school via get_my_school_id(). HODs use this to set
-- department on teachers they claim into their subject department.
DROP POLICY IF EXISTS "staff_records_update_hod" ON public.staff_records;

CREATE POLICY "staff_records_update_hod"
  ON public.staff_records
  FOR UPDATE TO authenticated
  USING    (school_id = public.get_my_school_id() AND public.is_hod_role())
  WITH CHECK (school_id = public.get_my_school_id());

-- ── 3. Reset departments so principal/deputy/others appear in HOD pool ────────
-- These roles were seeded with department = 'Administration' (placeholder).
-- HOD unassigned pool filters department IS NULL, so they were invisible.
UPDATE public.staff_records
SET    department = NULL
WHERE  sub_role IN (
         'principal',
         'deputy_principal',
         'dean_of_students',
         'qaso'
       )
  AND  department = 'Administration';
