-- ================================================================
-- STUDENT QR ATTENDANCE — 2026-05-26
--
-- Adds per-student QR token to students table, creates
-- student_qr_attendance table (teacher scans student QR per lesson),
-- and daily_attendance_summary for principal dashboard.
--
-- Architecture:
--   students.qr_token         — HMAC token on student card
--   student_qr_attendance     — scan record per lesson (timetable-validated)
--   daily_attendance_summary  — materialized daily totals per class
--
-- HARD CONSTRAINTS enforced in application layer:
--   - scan rejected if no matching timetable_periods for teacher+class+period+day
--   - scan rejected if current time is outside school_periods window
--   - duplicate scan returned as 'Duplicate' status
--   - scan > 10 min into period returned as 'Late'
-- ================================================================


-- ── 1. ADD QR TOKEN TO STUDENTS ──────────────────────────────────

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS qr_token text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_students_qr_token
  ON public.students (qr_token)
  WHERE qr_token IS NOT NULL;


-- ── 2. STUDENT QR ATTENDANCE ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.student_qr_attendance (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  timetable_period_id  uuid        NOT NULL REFERENCES public.timetable_periods(id) ON DELETE CASCADE,
  student_id           uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id           uuid        NOT NULL REFERENCES public.staff_records(id) ON DELETE SET NULL,
  scanned_at           timestamptz NOT NULL DEFAULT now(),
  -- Computed column so we can put a unique constraint on (slot, student, day)
  scan_date            date        GENERATED ALWAYS AS ((scanned_at AT TIME ZONE 'UTC')::date) STORED,
  scan_status          text        NOT NULL DEFAULT 'Present'
    CHECK (scan_status IN ('Present','Late','Absent','Invalid','Duplicate')),
  device_info          text,
  UNIQUE (timetable_period_id, student_id, scan_date)
);

CREATE INDEX IF NOT EXISTS idx_sqa_school_date   ON public.student_qr_attendance(school_id, scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_sqa_student       ON public.student_qr_attendance(student_id, scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_sqa_slot          ON public.student_qr_attendance(timetable_period_id, scan_date);

ALTER TABLE public.student_qr_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sqa_school_read"    ON public.student_qr_attendance;
DROP POLICY IF EXISTS "sqa_teacher_write"  ON public.student_qr_attendance;
DROP POLICY IF EXISTS "sqa_service"        ON public.student_qr_attendance;

CREATE POLICY "sqa_school_read" ON public.student_qr_attendance
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "sqa_teacher_write" ON public.student_qr_attendance
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.get_my_school_id());

CREATE POLICY "sqa_service" ON public.student_qr_attendance
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 3. DAILY ATTENDANCE SUMMARY ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.daily_attendance_summary (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id         text        NOT NULL,
  class_name       text,
  attendance_date  date        NOT NULL,
  total_students   int         DEFAULT 0,
  present_count    int         DEFAULT 0,
  absent_count     int         DEFAULT 0,
  late_count       int         DEFAULT 0,
  attendance_rate  numeric(5,2),
  recorded_by      uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  finalized_at     timestamptz,
  UNIQUE (school_id, class_id, attendance_date)
);

CREATE INDEX IF NOT EXISTS idx_das_school_date
  ON public.daily_attendance_summary (school_id, attendance_date DESC);

ALTER TABLE public.daily_attendance_summary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "das_school_read"    ON public.daily_attendance_summary;
DROP POLICY IF EXISTS "das_service"        ON public.daily_attendance_summary;

CREATE POLICY "das_school_read" ON public.daily_attendance_summary
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "das_service" ON public.daily_attendance_summary
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 4. ENABLE REALTIME ───────────────────────────────────────────

ALTER TABLE public.student_qr_attendance   REPLICA IDENTITY FULL;
ALTER TABLE public.daily_attendance_summary REPLICA IDENTITY FULL;
