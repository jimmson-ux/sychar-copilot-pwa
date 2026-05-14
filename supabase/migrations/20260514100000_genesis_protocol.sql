-- ================================================================
-- GENESIS PROTOCOL — Automatic GPS Room Mapping
-- 2026-05-14
--
-- Adds self-configuring geofence to classrooms:
--   1. Genesis columns on classrooms (is_geofence_locked, etc.)
--   2. classroom_gps_logs — successful scan location history
--   3. refine_gps_drift() — centroid self-heal after 50 scans/5 users
--   4. RLS policies for classrooms
-- ================================================================

-- ── 1. Genesis columns on classrooms ────────────────────────────

ALTER TABLE public.classrooms
  ADD COLUMN IF NOT EXISTS is_geofence_locked  boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_by_user_id   uuid        REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS locked_at_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS genesis_accuracy_m  numeric(6,2);
-- geo_latitude and geo_longitude are already nullable (no NOT NULL in original DDL)

-- ── 2. GPS scan log for drift refinement ────────────────────────

CREATE TABLE IF NOT EXISTS public.classroom_gps_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id     uuid        NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  school_id        uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id       uuid        NOT NULL REFERENCES public.staff_records(id) ON DELETE CASCADE,
  scan_latitude    numeric(9,6) NOT NULL,
  scan_longitude   numeric(9,6) NOT NULL,
  accuracy_meters  numeric(6,2),
  distance_to_center_m numeric(8,2),
  used_for_centroid boolean    NOT NULL DEFAULT false,
  logged_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gps_logs_classroom
  ON public.classroom_gps_logs (classroom_id, used_for_centroid, logged_at DESC);
CREATE INDEX IF NOT EXISTS idx_gps_logs_teacher
  ON public.classroom_gps_logs (teacher_id, logged_at DESC);

ALTER TABLE public.classroom_gps_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gps_logs_school_read"     ON public.classroom_gps_logs;
DROP POLICY IF EXISTS "gps_logs_teacher_insert"  ON public.classroom_gps_logs;
DROP POLICY IF EXISTS "gps_logs_service"         ON public.classroom_gps_logs;

CREATE POLICY "gps_logs_school_read" ON public.classroom_gps_logs
  FOR SELECT TO authenticated
  USING (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "gps_logs_teacher_insert" ON public.classroom_gps_logs
  FOR INSERT TO authenticated
  WITH CHECK (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "gps_logs_service" ON public.classroom_gps_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3. RLS on classrooms (admin write, school read) ─────────────

ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "classrooms_school_read"  ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_admin_write"  ON public.classrooms;
DROP POLICY IF EXISTS "classrooms_service"      ON public.classrooms;

CREATE POLICY "classrooms_school_read" ON public.classrooms
  FOR SELECT TO authenticated
  USING (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "classrooms_admin_write" ON public.classrooms
  FOR ALL TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN (
      'principal','deputy_principal','deputy_principal_academic',
      'deputy_principal_admin','super_admin'
    )
  )
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN (
      'principal','deputy_principal','deputy_principal_academic',
      'deputy_principal_admin','super_admin'
    )
  );

CREATE POLICY "classrooms_service" ON public.classrooms
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 4. refine_gps_drift — centroid self-heal ────────────────────
--
-- Called by trigger after each GPS log insert.
-- Once a room accumulates 50 valid scans from ≥ 5 unique teachers,
-- calculates the mathematical centroid and updates classroom coords.

CREATE OR REPLACE FUNCTION public.refine_gps_drift(p_classroom_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_count        bigint;
  v_unique_users bigint;
  v_lat          numeric(9,6);
  v_lng          numeric(9,6);
BEGIN
  SELECT
    COUNT(*),
    COUNT(DISTINCT teacher_id)
  INTO v_count, v_unique_users
  FROM public.classroom_gps_logs
  WHERE classroom_id = p_classroom_id
    AND used_for_centroid = false;

  -- Threshold: 50 successful scans from at least 5 different teachers
  IF v_count < 50 OR v_unique_users < 5 THEN
    RETURN jsonb_build_object(
      'refined', false,
      'count', v_count,
      'unique_users', v_unique_users,
      'needed', GREATEST(50 - v_count, 0)
    );
  END IF;

  -- Compute centroid from the 50 most recent qualifying scans
  SELECT AVG(scan_latitude), AVG(scan_longitude)
  INTO v_lat, v_lng
  FROM (
    SELECT scan_latitude, scan_longitude
    FROM public.classroom_gps_logs
    WHERE classroom_id = p_classroom_id AND used_for_centroid = false
    ORDER BY logged_at DESC
    LIMIT 50
  ) sub;

  -- Update the master classroom coordinates to the refined centroid
  UPDATE public.classrooms
  SET geo_latitude  = v_lat,
      geo_longitude = v_lng
  WHERE id = p_classroom_id;

  -- Mark the 50 logs as consumed
  UPDATE public.classroom_gps_logs
  SET used_for_centroid = true
  WHERE classroom_id = p_classroom_id
    AND used_for_centroid = false;

  RETURN jsonb_build_object(
    'refined', true,
    'new_lat', v_lat,
    'new_lng', v_lng,
    'from_count', v_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 5. Trigger: auto-run drift refinement on every GPS log ───────

CREATE OR REPLACE FUNCTION public.trg_refine_gps_after_log()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.refine_gps_drift(NEW.classroom_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS auto_refine_gps_drift ON public.classroom_gps_logs;
CREATE TRIGGER auto_refine_gps_drift
  AFTER INSERT ON public.classroom_gps_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_refine_gps_after_log();

-- ── 6. Helper: haversine distance in metres (pure SQL) ──────────

CREATE OR REPLACE FUNCTION public.haversine_meters(
  lat1 numeric, lon1 numeric,
  lat2 numeric, lon2 numeric
) RETURNS numeric AS $$
DECLARE
  R  constant numeric := 6371000;
  p1 numeric := lat1 * PI() / 180;
  p2 numeric := lat2 * PI() / 180;
  dp numeric := (lat2 - lat1) * PI() / 180;
  dl numeric := (lon2 - lon1) * PI() / 180;
  a  numeric;
BEGIN
  a := SIN(dp/2)^2 + COS(p1) * COS(p2) * SIN(dl/2)^2;
  RETURN R * 2 * ATAN2(SQRT(a), SQRT(1 - a));
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = public;

-- ── Verification ─────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'classrooms.is_geofence_locked : %',
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='classrooms' AND column_name='is_geofence_locked');
  RAISE NOTICE 'classroom_gps_logs table      : %',
    (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema='public' AND table_name='classroom_gps_logs');
  RAISE NOTICE 'refine_gps_drift function     : %',
    (SELECT COUNT(*) FROM pg_proc WHERE proname='refine_gps_drift');
  RAISE NOTICE 'haversine_meters function     : %',
    (SELECT COUNT(*) FROM pg_proc WHERE proname='haversine_meters');
END $$;
