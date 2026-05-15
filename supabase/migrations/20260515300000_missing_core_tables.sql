-- Migration: missing core tables needed by nkoroimixed dashboards
-- Fixes: counselor_notes, fee_payments, geofences, qr_clock_tokens,
--        staff_attendance, geofence_verifications, attendance_adjustments,
--        token_print_log, user_admin_audit

-- ── 1. counselor_notes ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS counselor_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id      text NOT NULL,
  counselor_id    uuid NOT NULL REFERENCES staff_records(id) ON DELETE CASCADE,
  body            text NOT NULL,
  severity        text NOT NULL DEFAULT 'normal'
                  CHECK (severity IN ('low', 'normal', 'high', 'critical')),
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE counselor_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "counselor_notes_school" ON counselor_notes
  USING (school_id = get_my_school_id());
CREATE POLICY "counselor_notes_insert" ON counselor_notes
  FOR INSERT WITH CHECK (school_id = get_my_school_id());

-- ── 2. fee_payments ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fee_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  amount          numeric(10,2) NOT NULL,
  payment_method  text,
  mpesa_code      text,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE fee_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fee_payments_school" ON fee_payments
  USING (school_id = get_my_school_id());
CREATE POLICY "fee_payments_insert" ON fee_payments
  FOR INSERT WITH CHECK (school_id = get_my_school_id());

-- ── 3. geofences ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geofences (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name            text NOT NULL,
  center_lat      float8 NOT NULL,
  center_lng      float8 NOT NULL,
  radius_m        float8 NOT NULL DEFAULT 200,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "geofences_school" ON geofences
  USING (school_id = get_my_school_id());

-- Seed Nkoroi Mixed School campus geofence (Nkoroi, Kajiado County, Kenya)
-- Coordinates: approx -1.5465, 36.7712 — update via school settings if needed
INSERT INTO geofences (school_id, name, center_lat, center_lng, radius_m, is_active)
VALUES (
  '68bd8d34-f2f0-4297-bd18-093328824d84',
  'Nkoroi Mixed Campus',
  -1.5465,
  36.7712,
  250,
  true
)
ON CONFLICT DO NOTHING;

-- Also update tenant_configs with these coords so heartbeat route works
UPDATE tenant_configs
SET school_lat = -1.5465, school_lng = 36.7712
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND school_lat IS NULL;

-- ── 4. qr_clock_tokens ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qr_clock_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  station_label   text NOT NULL,
  token           text NOT NULL UNIQUE,
  expires_at      timestamptz NOT NULL,
  geofence_id     uuid REFERENCES geofences(id) ON DELETE SET NULL,
  rotated_from    uuid,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE qr_clock_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "qr_clock_tokens_school_read" ON qr_clock_tokens
  FOR SELECT USING (school_id = get_my_school_id());
CREATE POLICY "qr_clock_tokens_anon_read" ON qr_clock_tokens
  FOR SELECT USING (true);
CREATE POLICY "qr_clock_tokens_insert" ON qr_clock_tokens
  FOR INSERT WITH CHECK (school_id = get_my_school_id());
CREATE POLICY "qr_clock_tokens_delete" ON qr_clock_tokens
  FOR DELETE USING (school_id = get_my_school_id());

-- ── 5. staff_attendance (staff clock-in — separate from student attendance) ─
CREATE TABLE IF NOT EXISTS staff_attendance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id        uuid NOT NULL REFERENCES staff_records(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('in', 'out')),
  method          text NOT NULL DEFAULT 'gps'
                  CHECK (method IN ('gps', 'qr', 'manual')),
  captured_at     timestamptz NOT NULL DEFAULT now(),
  lat             float8,
  lng             float8,
  accuracy_m      float8,
  geofence_id     uuid REFERENCES geofences(id) ON DELETE SET NULL,
  qr_token_id     uuid REFERENCES qr_clock_tokens(id) ON DELETE SET NULL,
  inside_geofence boolean,
  distance_m      float8,
  device_label    text,
  notes           text,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_attendance_school_read" ON staff_attendance
  FOR SELECT USING (school_id = get_my_school_id());
CREATE POLICY "staff_attendance_own_insert" ON staff_attendance
  FOR INSERT WITH CHECK (
    school_id = get_my_school_id()
    AND staff_id = (
      SELECT id FROM staff_records WHERE user_id = (auth.uid())::text LIMIT 1
    )
  );
CREATE POLICY "staff_attendance_manual_insert" ON staff_attendance
  FOR INSERT WITH CHECK (school_id = get_my_school_id());

-- ── 6. attendance_today view ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW attendance_today AS
SELECT
  sa.id,
  sa.staff_id,
  sr.full_name,
  sr.sub_role,
  sa.kind,
  sa.method,
  sa.captured_at,
  sa.lat,
  sa.lng,
  sa.inside_geofence,
  sa.distance_m,
  sa.school_id
FROM staff_attendance sa
JOIN staff_records sr ON sr.id = sa.staff_id
WHERE sa.captured_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Nairobi');

-- ── 7. geofence_verifications ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geofence_verifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id        uuid REFERENCES staff_records(id) ON DELETE SET NULL,
  geofence_id     uuid REFERENCES geofences(id) ON DELETE SET NULL,
  verdict         text NOT NULL
                  CHECK (verdict IN ('allowed', 'allowed_with_warning', 'rejected')),
  inside          boolean,
  distance_m      float8,
  accuracy_m      float8,
  lat             float8,
  lng             float8,
  device_label    text,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE geofence_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "geofence_verifications_school" ON geofence_verifications
  USING (school_id = get_my_school_id());
CREATE POLICY "geofence_verifications_insert" ON geofence_verifications
  FOR INSERT WITH CHECK (school_id = get_my_school_id());

-- ── 8. attendance_adjustments ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_adjustments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  attendance_id   uuid REFERENCES staff_attendance(id) ON DELETE CASCADE,
  staff_id        uuid REFERENCES staff_records(id) ON DELETE SET NULL,
  action          text NOT NULL,
  reason          text,
  performed_by    uuid REFERENCES staff_records(id) ON DELETE SET NULL,
  after_state     jsonb,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE attendance_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_adjustments_school" ON attendance_adjustments
  USING (school_id = get_my_school_id());
CREATE POLICY "attendance_adjustments_insert" ON attendance_adjustments
  FOR INSERT WITH CHECK (school_id = get_my_school_id());

-- ── 9. token_print_log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_print_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id        uuid NOT NULL REFERENCES qr_clock_tokens(id) ON DELETE CASCADE,
  printed_by_name text,
  reason          text,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE token_print_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "token_print_log_read" ON token_print_log
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "token_print_log_insert" ON token_print_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ── 10. user_admin_audit ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_admin_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  target_staff_id uuid REFERENCES staff_records(id) ON DELETE SET NULL,
  performed_by    uuid REFERENCES staff_records(id) ON DELETE SET NULL,
  action          text NOT NULL,
  before_state    jsonb,
  after_state     jsonb,
  reason          text,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE user_admin_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_admin_audit_school" ON user_admin_audit
  USING (school_id = get_my_school_id());
CREATE POLICY "user_admin_audit_insert" ON user_admin_audit
  FOR INSERT WITH CHECK (school_id = get_my_school_id());
