-- ================================================================
-- GENESIS ACCURACY UPGRADE — 2026-05-16
--
-- 1. Add geofence_radius_m and genesis_sample_count to classrooms
-- 2. Upgrade lat/lng precision: numeric(9,6) → numeric(12,8)
--    6 dp = 11 cm  →  8 dp = 1.1 mm  (matches Kalman centroid precision)
-- 3. Replace refine_gps_drift() with inverse-variance weighted centroid
--    (weight = 1/accuracy²) and accuracy filter (only ≤ 10 m readings)
-- ================================================================

-- ── 1. New columns on classrooms ─────────────────────────────────────────────

ALTER TABLE public.classrooms
  ADD COLUMN IF NOT EXISTS geofence_radius_m    numeric(6,2)  NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS genesis_sample_count integer;

-- Backfill radius for already-locked rooms using genesis_accuracy_m
UPDATE public.classrooms
SET geofence_radius_m = LEAST(40, GREATEST(15,
      COALESCE(genesis_accuracy_m, 5) * 4 + 10
    ))
WHERE is_geofence_locked = true
  AND geofence_radius_m = 20;

-- ── 2. Precision upgrade: numeric(9,6) → numeric(12,8) ───────────────────────
-- classrooms centroid columns

ALTER TABLE public.classrooms
  ALTER COLUMN geo_latitude  TYPE numeric(12,8),
  ALTER COLUMN geo_longitude TYPE numeric(12,8);

-- classroom_gps_logs sample columns

ALTER TABLE public.classroom_gps_logs
  ALTER COLUMN scan_latitude  TYPE numeric(12,8),
  ALTER COLUMN scan_longitude TYPE numeric(12,8);

-- ── 3. Inverse-variance weighted refine_gps_drift() ──────────────────────────
--
-- Previous version used plain AVG(), treating all readings equally.
-- New version: weight = 1/accuracy_meters², so a 3 m fix contributes 11×
-- more than a 10 m fix. Only readings with accuracy ≤ 10 m are used.
-- Combined centroid error = 1/√(Σ weights) — Kalman-style.

CREATE OR REPLACE FUNCTION public.refine_gps_drift(p_classroom_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_count        bigint;
  v_unique_users bigint;
  v_lat          numeric(12,8);
  v_lng          numeric(12,8);
  v_combined_acc numeric(6,2);
BEGIN
  -- Count qualifying (accurate, unused) readings
  SELECT
    COUNT(*),
    COUNT(DISTINCT teacher_id)
  INTO v_count, v_unique_users
  FROM public.classroom_gps_logs
  WHERE classroom_id      = p_classroom_id
    AND used_for_centroid = false
    AND accuracy_meters  IS NOT NULL
    AND accuracy_meters   <= 10;

  -- Need 50 qualifying scans from ≥ 5 unique teachers before refining
  IF v_count < 50 OR v_unique_users < 5 THEN
    RETURN jsonb_build_object(
      'refined',       false,
      'count',         v_count,
      'unique_users',  v_unique_users,
      'needed',        GREATEST(50 - v_count, 0)
    );
  END IF;

  -- Inverse-variance weighted centroid from the 50 most-recent qualifying scans
  SELECT
    SUM(scan_latitude  / POWER(accuracy_meters, 2))
      / SUM(1.0 / POWER(accuracy_meters, 2)),
    SUM(scan_longitude / POWER(accuracy_meters, 2))
      / SUM(1.0 / POWER(accuracy_meters, 2)),
    1.0 / SQRT(SUM(1.0 / POWER(accuracy_meters, 2)))
  INTO v_lat, v_lng, v_combined_acc
  FROM (
    SELECT scan_latitude, scan_longitude, accuracy_meters
    FROM   public.classroom_gps_logs
    WHERE  classroom_id      = p_classroom_id
      AND  used_for_centroid = false
      AND  accuracy_meters  IS NOT NULL
      AND  accuracy_meters   <= 10
    ORDER  BY logged_at DESC
    LIMIT  50
  ) sub;

  -- Update centroid + recompute geofence radius from refined accuracy
  UPDATE public.classrooms
  SET geo_latitude       = v_lat,
      geo_longitude      = v_lng,
      genesis_accuracy_m = v_combined_acc,
      geofence_radius_m  = LEAST(40, GREATEST(15, v_combined_acc * 4 + 10))
  WHERE id = p_classroom_id;

  -- Mark the 50 logs as consumed so they don't feed the next cycle
  UPDATE public.classroom_gps_logs
  SET used_for_centroid = true
  WHERE classroom_id      = p_classroom_id
    AND used_for_centroid = false
    AND accuracy_meters  IS NOT NULL
    AND accuracy_meters   <= 10
    AND id IN (
      SELECT id FROM public.classroom_gps_logs
      WHERE  classroom_id      = p_classroom_id
        AND  used_for_centroid = false
        AND  accuracy_meters  IS NOT NULL
        AND  accuracy_meters   <= 10
      ORDER  BY logged_at DESC
      LIMIT  50
    );

  RETURN jsonb_build_object(
    'refined',             true,
    'new_lat',             v_lat,
    'new_lng',             v_lng,
    'combined_accuracy_m', v_combined_acc,
    'new_geofence_radius', LEAST(40, GREATEST(15, v_combined_acc * 4 + 10)),
    'from_count',          v_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 4. Haversine upgrade: also accept numeric(12,8) args ─────────────────────
-- Re-declare as IMMUTABLE with flexible arg types (numeric is already flexible).
-- No-op if signature unchanged, but ensures search_path is explicit.

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

-- ── Verification ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  r text;
BEGIN
  SELECT data_type INTO r FROM information_schema.columns
  WHERE table_schema='public' AND table_name='classrooms' AND column_name='geo_latitude';
  RAISE NOTICE 'classrooms.geo_latitude type    : %', r;

  SELECT data_type INTO r FROM information_schema.columns
  WHERE table_schema='public' AND table_name='classrooms' AND column_name='geofence_radius_m';
  RAISE NOTICE 'classrooms.geofence_radius_m    : %', COALESCE(r, 'MISSING');

  SELECT data_type INTO r FROM information_schema.columns
  WHERE table_schema='public' AND table_name='classroom_gps_logs' AND column_name='scan_latitude';
  RAISE NOTICE 'classroom_gps_logs.scan_latitude: %', r;

  RAISE NOTICE 'refine_gps_drift (weighted)     : %',
    (SELECT COUNT(*) FROM pg_proc WHERE proname = 'refine_gps_drift')::text;
END $$;
