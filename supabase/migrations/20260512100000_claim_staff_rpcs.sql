-- ================================================================
-- claim_staff_record(p_id_number text)
--
-- Called from the Lovable app when a staff member enters their
-- national ID on the /auth/link page. Finds the unlinked row by
-- id_number, sets user_id = auth.uid(), and returns ok/error.
-- ================================================================

CREATE OR REPLACE FUNCTION public.claim_staff_record(p_id_number text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_user_id  text;
  v_staff_id uuid;
BEGIN
  v_user_id := auth.uid()::text;

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Already linked?
  IF EXISTS (
    SELECT 1 FROM public.staff_records WHERE user_id = v_user_id LIMIT 1
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_linked', true);
  END IF;

  -- Find unlinked row whose id_number matches
  SELECT id INTO v_staff_id
  FROM   public.staff_records
  WHERE  TRIM(COALESCE(id_number, '')) = TRIM(p_id_number)
    AND  (user_id IS NULL OR user_id = '')
  LIMIT  1;

  IF v_staff_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_record');
  END IF;

  UPDATE public.staff_records
  SET    user_id = v_user_id
  WHERE  id = v_staff_id;

  RETURN jsonb_build_object('ok', true, 'already_linked', false, 'staff_id', v_staff_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_staff_record(text) TO authenticated;

-- ================================================================
-- verify_staff_login(p_email, p_tsc_number, p_id_number)
--
-- Called server-side by the parents PWA TanStack server function.
-- Verifies email + TSC number OR national ID without exposing the
-- stored values to the client (SECURITY DEFINER, row_security off).
-- Returns staff record data if credentials match, error otherwise.
-- ================================================================

CREATE OR REPLACE FUNCTION public.verify_staff_login(
  p_email      text,
  p_tsc_number text DEFAULT NULL,
  p_id_number  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_staff   public.staff_records;
  v_tenant  public.tenant_configs;
  v_tsc_ok  boolean := false;
  v_id_ok   boolean := false;
BEGIN
  IF TRIM(p_email) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_required');
  END IF;
  IF (p_tsc_number IS NULL OR TRIM(p_tsc_number) = '')
     AND (p_id_number IS NULL OR TRIM(p_id_number) = '') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tsc_or_id_required');
  END IF;

  -- Find the staff record by email (case-insensitive)
  SELECT * INTO v_staff
  FROM   public.staff_records
  WHERE  LOWER(TRIM(email)) = LOWER(TRIM(p_email))
  LIMIT  1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_staff.is_active = false OR v_staff.can_login = false THEN
    RETURN jsonb_build_object('ok', false, 'error', 'account_inactive');
  END IF;

  -- Verify second factor
  IF p_tsc_number IS NOT NULL AND TRIM(p_tsc_number) != '' AND v_staff.tsc_number IS NOT NULL THEN
    v_tsc_ok := LOWER(TRIM(v_staff.tsc_number)) = LOWER(TRIM(p_tsc_number));
  END IF;
  IF p_id_number IS NOT NULL AND TRIM(p_id_number) != '' AND v_staff.id_number IS NOT NULL THEN
    v_id_ok := TRIM(v_staff.id_number) = TRIM(p_id_number);
  END IF;

  IF NOT (v_tsc_ok OR v_id_ok) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'credentials_mismatch');
  END IF;

  -- Resolve school name
  SELECT * INTO v_tenant
  FROM   public.tenant_configs
  WHERE  school_id = v_staff.school_id
  LIMIT  1;

  RETURN jsonb_build_object(
    'ok',          true,
    'staff_id',    v_staff.id,
    'school_id',   v_staff.school_id,
    'full_name',   v_staff.full_name,
    'sub_role',    COALESCE(v_staff.sub_role::text, v_staff.role),
    'class_id',    v_staff.class_id,
    'photo_url',   v_staff.photo_url,
    'school_name', COALESCE(v_tenant.name, 'Your School'),
    'user_id',     v_staff.user_id
  );
END;
$$;

-- Callable by anon (no Supabase session needed — used from a server function)
GRANT EXECUTE ON FUNCTION public.verify_staff_login(text, text, text) TO anon, authenticated;
