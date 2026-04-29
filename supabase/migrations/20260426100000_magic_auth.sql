-- ============================================================
-- Magic Auth + Push Subscriptions + PostGIS Helpers
-- ============================================================

-- ── magic_links ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.magic_links (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL,
  school_id   uuid        NOT NULL,
  token       text        UNIQUE NOT NULL,
  token_type  text        DEFAULT 'magic_link'
              CHECK (token_type IN ('magic_link','emergency_otp','qr_recovery','push_approval')),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  is_used     boolean     DEFAULT false,
  device_hint text,
  action_link text,       -- Supabase magic link URL (populated on consume)
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_magic_links_token
  ON public.magic_links(token) WHERE is_used = false;
CREATE INDEX IF NOT EXISTS idx_magic_links_user
  ON public.magic_links(user_id, created_at DESC);

ALTER TABLE public.magic_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "magic_service" ON public.magic_links;
CREATE POLICY "magic_service" ON public.magic_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── push_subscriptions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      text        NOT NULL,
  school_id    uuid        NOT NULL,
  subscription jsonb       NOT NULL,
  device_name  text,
  created_at   timestamptz DEFAULT now(),
  last_used_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user
  ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "push_service" ON public.push_subscriptions;
CREATE POLICY "push_service" ON public.push_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── staff_records: add totp_secret column ─────────────────────────────────────
ALTER TABLE public.staff_records
  ADD COLUMN IF NOT EXISTS totp_secret text;

-- ── consume_magic_link ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.consume_magic_link(p_token text)
RETURNS TABLE(user_id uuid, school_id uuid, success boolean) AS $$
BEGIN
  RETURN QUERY
  UPDATE public.magic_links
  SET is_used = true
  WHERE token = p_token
    AND is_used = false
    AND expires_at > now()
  RETURNING magic_links.user_id, magic_links.school_id, true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── generate_emergency_otp ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_emergency_otp(p_user_id uuid)
RETURNS text AS $$
DECLARE
  v_otp       text;
  v_school_id uuid;
BEGIN
  SELECT school_id::uuid INTO v_school_id
  FROM public.staff_records
  WHERE user_id = p_user_id::text
  LIMIT 1;

  v_otp := LPAD(floor(random() * 900000 + 100000)::text, 6, '0');

  INSERT INTO public.magic_links (user_id, school_id, token, token_type, expires_at)
  VALUES (p_user_id, COALESCE(v_school_id, '00000000-0000-0000-0000-000000000000'::uuid),
          v_otp, 'emergency_otp', now() + interval '5 minutes')
  ON CONFLICT (token) DO UPDATE
    SET expires_at = now() + interval '5 minutes', is_used = false;

  RETURN v_otp;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Student home location (for PostGIS analysis) ──────────────────────────────
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS home_lat  double precision,
  ADD COLUMN IF NOT EXISTS home_lng  double precision,
  ADD COLUMN IF NOT EXISTS home_area text;

-- ── tenant_configs: add school GPS coordinates ────────────────────────────────
ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS school_lat double precision,
  ADD COLUMN IF NOT EXISTS school_lng double precision;

-- ── postgis_distance_meters helper (Haversine, no PostGIS extension needed) ───
CREATE OR REPLACE FUNCTION public.postgis_distance_meters(
  lat1 double precision, lng1 double precision,
  lat2 double precision, lng2 double precision
)
RETURNS double precision AS $$
DECLARE
  R double precision := 6371000; -- Earth radius in metres
  phi1 double precision := radians(lat1);
  phi2 double precision := radians(lat2);
  dphi double precision := radians(lat2 - lat1);
  dlam double precision := radians(lng2 - lng1);
  a    double precision;
BEGIN
  a := sin(dphi/2)^2 + cos(phi1)*cos(phi2)*sin(dlam/2)^2;
  RETURN R * 2 * atan2(sqrt(a), sqrt(1-a));
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

-- ── get_fee_arrears_density ───────────────────────────────────────────────────
-- Groups students with arrears into geographic clusters (~1 km radius)
CREATE OR REPLACE FUNCTION public.get_fee_arrears_density(p_school_id uuid)
RETURNS TABLE(
  center_lat    double precision,
  center_lng    double precision,
  student_count integer,
  total_arrears numeric,
  area_name     text
) AS $$
  SELECT
    ROUND(AVG(s.home_lat)::numeric, 5)::double precision AS center_lat,
    ROUND(AVG(s.home_lng)::numeric, 5)::double precision AS center_lng,
    COUNT(*)::integer AS student_count,
    COALESCE(SUM(fb.balance_due), 0) AS total_arrears,
    MODE() WITHIN GROUP (ORDER BY s.home_area) AS area_name
  FROM public.students s
  LEFT JOIN LATERAL (
    SELECT balance_due FROM public.fee_balances
    WHERE student_id = s.id
    ORDER BY updated_at DESC NULLS LAST LIMIT 1
  ) fb ON true
  WHERE s.school_id::text = p_school_id::text
    AND s.home_lat IS NOT NULL
    AND s.home_lng IS NOT NULL
    AND COALESCE(fb.balance_due, 0) > 0
  GROUP BY
    ROUND(s.home_lat / 0.009, 0),   -- ~1 km buckets (0.009° ≈ 1 km)
    ROUND(s.home_lng / 0.009, 0)
  HAVING COALESCE(SUM(fb.balance_due), 0) > 5000
  ORDER BY total_arrears DESC;
$$ LANGUAGE SQL SECURITY DEFINER;

-- ── get_travel_fatigue_students ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_travel_fatigue_students(p_school_id uuid)
RETURNS TABLE(
  student_id          uuid,
  student_name        text,
  distance_km         double precision,
  fatigue_zone        text,
  recommendation      text
) AS $$
  SELECT
    s.id AS student_id,
    s.full_name AS student_name,
    ROUND((public.postgis_distance_meters(
      s.home_lat, s.home_lng,
      COALESCE(tc.school_lat, 0), COALESCE(tc.school_lng, 0)
    ) / 1000)::numeric, 1)::double precision AS distance_km,
    CASE
      WHEN public.postgis_distance_meters(s.home_lat, s.home_lng,
           COALESCE(tc.school_lat,0), COALESCE(tc.school_lng,0)) < 2000 THEN 'near'
      WHEN public.postgis_distance_meters(s.home_lat, s.home_lng,
           COALESCE(tc.school_lat,0), COALESCE(tc.school_lng,0)) < 5000 THEN 'moderate'
      WHEN public.postgis_distance_meters(s.home_lat, s.home_lng,
           COALESCE(tc.school_lat,0), COALESCE(tc.school_lng,0)) < 10000 THEN 'far'
      ELSE 'very_far'
    END AS fatigue_zone,
    CASE
      WHEN public.postgis_distance_meters(s.home_lat, s.home_lng,
           COALESCE(tc.school_lat,0), COALESCE(tc.school_lng,0)) > 10000
        THEN 'Consider bus route allocation'
      WHEN public.postgis_distance_meters(s.home_lat, s.home_lng,
           COALESCE(tc.school_lat,0), COALESCE(tc.school_lng,0)) > 5000
        THEN 'Monitor morning performance'
      ELSE 'Within normal range'
    END AS recommendation
  FROM public.students s
  JOIN public.tenant_configs tc ON tc.school_id::text = s.school_id::text
  WHERE s.school_id::text = p_school_id::text
    AND s.home_lat IS NOT NULL
    AND s.home_lng IS NOT NULL
  ORDER BY distance_km DESC;
$$ LANGUAGE SQL SECURITY DEFINER;

-- ── GPS columns on nts_attendance_log ────────────────────────────────────────
ALTER TABLE public.nts_attendance_log
  ADD COLUMN IF NOT EXISTS gps_accuracy_m  numeric,
  ADD COLUMN IF NOT EXISTS gps_altitude_m  numeric,
  ADD COLUMN IF NOT EXISTS gps_speed_mps   numeric,
  ADD COLUMN IF NOT EXISTS integrity_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS integrity_flags jsonb   DEFAULT '[]';

-- ── GPS integrity scorer ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.score_gps_integrity(
  p_lat        double precision,
  p_lng        double precision,
  p_accuracy_m numeric,
  p_altitude_m numeric,
  p_speed_mps  numeric,
  p_staff_id   uuid,
  p_school_id  uuid
)
RETURNS TABLE(score integer, flags jsonb, is_valid boolean) AS $$
DECLARE
  v_score  integer := 100;
  v_flags  jsonb   := '[]'::jsonb;
  v_prev   RECORD;
  v_dist   double precision;
  v_elapsed double precision;
BEGIN
  -- Check 1: Accuracy too perfect (real GPS 5-50m; spoofed often 0-1m)
  IF p_accuracy_m IS NULL THEN
    v_score := v_score - 20;
    v_flags := v_flags || '["Missing GPS accuracy metadata"]'::jsonb;
  ELSIF p_accuracy_m < 1.0 THEN
    v_score := v_score - 25;
    v_flags := v_flags || '["Suspicious: GPS accuracy too perfect (<1m)"]'::jsonb;
  END IF;

  -- Check 2: Missing altitude (fake GPS apps often omit)
  IF p_altitude_m IS NULL THEN
    v_score := v_score - 15;
    v_flags := v_flags || '["Missing altitude — possible fake GPS"]'::jsonb;
  END IF;

  -- Check 3: Teleportation detection
  SELECT lat, lng, created_at
  INTO v_prev
  FROM public.nts_attendance_log
  WHERE staff_id = p_staff_id::text
    AND school_id = p_school_id
  ORDER BY created_at DESC LIMIT 1;

  IF v_prev IS NOT NULL AND v_prev.lat IS NOT NULL THEN
    v_dist    := public.postgis_distance_meters(p_lat, p_lng, v_prev.lat, v_prev.lng);
    v_elapsed := EXTRACT(EPOCH FROM (now() - v_prev.created_at));
    -- > 200 km/h (55 m/s) = physically impossible foot travel
    IF v_elapsed > 0 AND (v_dist / v_elapsed) > 55 THEN
      v_score := v_score - 40;
      v_flags := v_flags || '["ALERT: Impossible movement speed detected"]'::jsonb;
    END IF;
  END IF;

  -- Check 4: Suspiciously round coordinates (manually typed)
  IF p_lat = ROUND(p_lat::numeric, 0)::double precision
  OR p_lng = ROUND(p_lng::numeric, 0)::double precision THEN
    v_score := v_score - 30;
    v_flags := v_flags || '["Suspicious: coordinates are whole-number values"]'::jsonb;
  END IF;

  score    := GREATEST(0, v_score);
  flags    := v_flags;
  is_valid := score >= 50;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add lat/lng to nts_attendance_log if not present (needed for GPS checks)
ALTER TABLE public.nts_attendance_log
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision;
