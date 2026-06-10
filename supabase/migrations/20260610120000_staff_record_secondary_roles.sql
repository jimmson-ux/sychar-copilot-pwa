-- Add secondary_roles (+ assigned_class) to the staff lookup RPC so multi-role
-- staff (e.g. PCEA Upper Matasia's Deputy Principal who is also Bursar + Storekeeper +
-- Subject Teacher) carry every role into the frontend on sign-in. The previous version
-- returned a hand-picked jsonb that dropped secondary_roles, so role-routed nav/dashboards
-- only ever saw the single primary sub_role.
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
    'secondary_roles', v_staff.secondary_roles,
    'assigned_class',  v_staff.assigned_class,
    'employment_type', v_staff.employment_type,
    'is_active',       v_staff.is_active,
    'can_login',       v_staff.can_login
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_staff_record() TO authenticated;
