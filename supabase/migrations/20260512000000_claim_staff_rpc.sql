-- ================================================================
-- auto_claim_staff_record() — SECURITY DEFINER RPC
--
-- Problem: staff_records RLS SELECT policy only matches rows where
-- user_id = auth.uid(). Unlinked rows (user_id IS NULL) are invisible
-- to the authenticated user, so fetchStaff() returns null, triggering
-- an infinite /auth/link → /login redirect loop.
--
-- Fix: This SECURITY DEFINER function runs with row_security = off,
-- finds the unlinked staff record by the caller's JWT email, sets
-- user_id = auth.uid()::text, then returns. Subsequent fetchStaff()
-- calls succeed because the row is now visible via the SELECT policy.
-- ================================================================

CREATE OR REPLACE FUNCTION public.auto_claim_staff_record()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_user_id    text;
  v_user_email text;
  v_staff_id   uuid;
BEGIN
  v_user_id    := auth.uid()::text;
  v_user_email := auth.jwt() ->> 'email';

  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  IF v_user_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_email_in_jwt');
  END IF;

  -- Already linked? Return early — nothing to do.
  IF EXISTS (
    SELECT 1 FROM public.staff_records WHERE user_id = v_user_id LIMIT 1
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already_linked', true);
  END IF;

  -- Find an unlinked staff record whose email matches the JWT email.
  SELECT id INTO v_staff_id
  FROM   public.staff_records
  WHERE  LOWER(email) = LOWER(v_user_email)
    AND  (user_id IS NULL OR user_id = '')
  LIMIT  1;

  IF v_staff_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_record');
  END IF;

  -- Claim the row.
  UPDATE public.staff_records
  SET    user_id = v_user_id
  WHERE  id = v_staff_id;

  RETURN jsonb_build_object('ok', true, 'already_linked', false, 'staff_id', v_staff_id);
END;
$$;

-- Only authenticated (signed-in) users may call this.
GRANT EXECUTE ON FUNCTION public.auto_claim_staff_record() TO authenticated;
