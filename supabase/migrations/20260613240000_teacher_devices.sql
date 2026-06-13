-- ================================================================
-- TEACHER DEVICE REGISTRATION (anti-proxy lesson scanning) — all schools
-- 2026-06-13 · Sprint 2 (QR hardening)
--
-- The QR stack already enforces timetable + geofence + one-scan-per-period +
-- presence sampling (lesson_heartbeats) + missed-lesson alerts (flag_lesson_absence).
-- The missing layer is DEVICE REGISTRATION: bind a teacher to approved device(s) so a
-- colleague's phone can't proxy-scan. A new device is recorded as PENDING and flagged;
-- if tenant_configs.features.strict_device = true, an unapproved device is rejected.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.teacher_devices (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id         uuid        NOT NULL REFERENCES public.staff_records(id) ON DELETE CASCADE,
  device_fingerprint text        NOT NULL,
  device_label       text,                                  -- "Samsung A35", etc.
  is_approved        boolean     NOT NULL DEFAULT false,
  approved_by        uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  approved_at        timestamptz,
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at         timestamptz,
  UNIQUE (school_id, teacher_id, device_fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_teacher_devices_lookup
  ON public.teacher_devices (school_id, teacher_id, device_fingerprint);

ALTER TABLE public.teacher_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teacher_devices_self ON public.teacher_devices;
DROP POLICY IF EXISTS teacher_devices_manage ON public.teacher_devices;
DROP POLICY IF EXISTS teacher_devices_service ON public.teacher_devices;

-- A teacher sees their own devices; leadership sees all in their school.
CREATE POLICY teacher_devices_self ON public.teacher_devices
  FOR SELECT TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND (
      teacher_id IN (SELECT id FROM public.staff_records WHERE user_id = auth.uid()::text)
      OR public.get_my_role() IN ('principal','deputy_principal','deputy_principal_academic',
          'deputy_principal_admin','super_admin','dean_of_studies')
    )
  );

-- Leadership approve/revoke devices.
CREATE POLICY teacher_devices_manage ON public.teacher_devices
  FOR UPDATE TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('principal','deputy_principal','deputy_principal_academic',
        'deputy_principal_admin','super_admin','dean_of_studies')
  );

CREATE POLICY teacher_devices_service ON public.teacher_devices
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Record/refresh a device sighting for the current staff member; returns its approval
-- state. First sighting auto-creates a PENDING row. SECURITY DEFINER so the scan path
-- (and the teacher) can upsert without broad table grants.
CREATE OR REPLACE FUNCTION public.touch_teacher_device(
  p_teacher_id uuid, p_school_id uuid, p_fingerprint text, p_label text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_approved boolean;
BEGIN
  INSERT INTO public.teacher_devices (school_id, teacher_id, device_fingerprint, device_label)
  VALUES (p_school_id, p_teacher_id, p_fingerprint, p_label)
  ON CONFLICT (school_id, teacher_id, device_fingerprint)
  DO UPDATE SET last_seen_at = now(),
               device_label = COALESCE(EXCLUDED.device_label, public.teacher_devices.device_label)
  RETURNING is_approved INTO v_approved;
  RETURN COALESCE(v_approved, false);
END $$;

REVOKE ALL ON FUNCTION public.touch_teacher_device(uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.touch_teacher_device(uuid, uuid, text, text) TO authenticated, service_role;
