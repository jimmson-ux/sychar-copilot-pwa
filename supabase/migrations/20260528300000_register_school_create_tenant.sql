-- Fix register_school() to auto-create tenant_configs with a unique school_short_code.
-- Previously the RPC only created schools + staff_records, leaving tenant_configs empty,
-- so onboarded schools had null short_code and the slug UPDATE was a silent no-op.

CREATE OR REPLACE FUNCTION public.register_school(
  p_school_name   text,
  p_county        text,
  p_admin_user_id uuid,
  p_admin_name    text,
  p_admin_email   text,
  p_admin_role    text DEFAULT 'principal'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
BEGIN
  -- Create the school
  INSERT INTO public.schools (name, county)
  VALUES (p_school_name, p_county)
  RETURNING id INTO v_school_id;

  -- Create the first admin staff record
  INSERT INTO public.staff_records
    (school_id, user_id, full_name, email, sub_role, can_login, is_active)
  VALUES
    (v_school_id, p_admin_user_id, p_admin_name, p_admin_email, p_admin_role, true, true);

  -- Create tenant_configs with auto-generated 4-digit code
  INSERT INTO public.tenant_configs (school_id, school_short_code)
  VALUES (v_school_id, public.generate_school_short_code())
  ON CONFLICT (school_id) DO NOTHING;

  RETURN v_school_id;
END;
$$;
