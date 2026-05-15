-- Fix: staff_records has no 'role' column; map sub_role → role in output.
CREATE OR REPLACE FUNCTION public.get_current_staff_record()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_staff public.staff_records;
BEGIN
  SELECT *
  INTO   v_staff
  FROM   public.staff_records
  WHERE  user_id = (auth.uid())::text
  LIMIT  1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id',              v_staff.id,
    'user_id',         v_staff.user_id,
    'school_id',       v_staff.school_id,
    'full_name',       v_staff.full_name,
    'email',           v_staff.email,
    'phone',           v_staff.phone,
    'department',      v_staff.department,
    'sub_role',        v_staff.sub_role,
    'role',            v_staff.sub_role,
    'employment_type', v_staff.employment_type,
    'is_active',       v_staff.is_active,
    'can_login',       v_staff.can_login
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_staff_record() TO authenticated;
