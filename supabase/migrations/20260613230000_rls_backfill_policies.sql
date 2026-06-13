-- ================================================================
-- RLS POLICY BACKFILL — tenancy isolation across all tables
-- 2026-06-13
--
-- Audit found 5 tables with RLS ENABLED but ZERO policies (deny-all = safe but
-- broken). Add school_id-scoped policies so school staff read only their own
-- tenant's rows, with service_role for server-side functions. (All 23 flagged
-- views are already security_invoker=on, so they inherit underlying-table RLS.)
--
-- auth_rate_limits holds OTP codes → service_role ONLY (never authenticated).
-- ================================================================

-- Helper note: get_my_school_id()/get_my_role() already exist (used platform-wide).

-- ── auth_rate_limits — sensitive (OTP). Service-role only. ───────
ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auth_rate_limits_service ON public.auth_rate_limits;
CREATE POLICY auth_rate_limits_service ON public.auth_rate_limits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Generic school-scoped read + service-role write for the rest ─
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'lesson_absence_reasons','meeting_minutes','parent_meetings','parent_meeting_rsvps'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- school staff read only their own tenant's rows
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_read ON public.%I FOR SELECT TO authenticated
      USING (school_id::text = public.get_my_school_id()::text)
    $f$, t, t);

    -- leadership/secretary may manage (writes also flow via service-role fns)
    EXECUTE format('DROP POLICY IF EXISTS %I_manage ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_manage ON public.%I FOR ALL TO authenticated
      USING (school_id::text = public.get_my_school_id()::text
             AND public.get_my_role() IN ('secretary','principal','deputy_principal',
                 'deputy_principal_academic','deputy_principal_admin','super_admin',
                 'dean_of_studies','dean_of_students'))
      WITH CHECK (school_id::text = public.get_my_school_id()::text
             AND public.get_my_role() IN ('secretary','principal','deputy_principal',
                 'deputy_principal_academic','deputy_principal_admin','super_admin',
                 'dean_of_studies','dean_of_students'))
    $f$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I_service ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_service ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;
