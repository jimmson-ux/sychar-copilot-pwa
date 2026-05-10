-- ================================================================
-- TEACHER ATTENDANCE QR + LESSON TIMETABLE — 2026-05-10
--
-- Architecture:
--   timetable_periods     — the definitive lesson schedule
--   class_qr_tokens       — one static anti-cheat QR per class
--                           (exclusive: deputy OR dean generates, not both)
--   teacher_attendance_scans — teacher scan-in records per period
--   lesson_heartbeats     — presence pings (backend verifies teacher
--                           did not leave before lesson end)
--
-- Security model:
--   The QR payload embeds a HMAC-SHA256 token
--   (school_id:class_id:seq, server secret).  Even with a perfect
--   photocopy the backend rejects scans that don't match the
--   authenticated teacher's timetable assignment for the current period.
-- ================================================================


-- ── 1. TIMETABLE PERIODS ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.timetable_periods (
  id              uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id       uuid          NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year   integer       NOT NULL,
  term            integer       NOT NULL CHECK (term BETWEEN 1 AND 3),
  class_id        text          NOT NULL,   -- e.g. "grade-10-winners"
  class_name      text          NOT NULL,   -- display: "Grade 10 Winners"
  subject         text          NOT NULL,
  teacher_id      uuid          REFERENCES public.staff_records(id) ON DELETE SET NULL,
  teacher_name    text,
  day_of_week     integer       NOT NULL CHECK (day_of_week BETWEEN 1 AND 5), -- 1=Mon
  period_number   integer       NOT NULL CHECK (period_number BETWEEN 1 AND 16),
  start_time      time          NOT NULL,
  end_time        time          NOT NULL,
  period_type     text          NOT NULL DEFAULT 'lesson'
                  CHECK (period_type IN ('lesson','break','assembly','games','prep')),
  is_double       boolean       DEFAULT false,
  room            text,
  ai_generated    boolean       DEFAULT false,
  created_by      uuid          REFERENCES public.staff_records(id) ON DELETE SET NULL,
  created_at      timestamptz   DEFAULT now(),
  updated_at      timestamptz   DEFAULT now(),
  CONSTRAINT timetable_no_overlap
    UNIQUE (school_id, academic_year, term, class_id, day_of_week, period_number)
);

ALTER TABLE public.timetable_periods
  ADD COLUMN IF NOT EXISTS academic_year integer,
  ADD COLUMN IF NOT EXISTS term          integer,
  ADD COLUMN IF NOT EXISTS class_id      text,
  ADD COLUMN IF NOT EXISTS class_name    text,
  ADD COLUMN IF NOT EXISTS subject       text,
  ADD COLUMN IF NOT EXISTS teacher_id    uuid,
  ADD COLUMN IF NOT EXISTS teacher_name  text,
  ADD COLUMN IF NOT EXISTS day_of_week   integer,
  ADD COLUMN IF NOT EXISTS period_number integer,
  ADD COLUMN IF NOT EXISTS start_time    time,
  ADD COLUMN IF NOT EXISTS end_time      time,
  ADD COLUMN IF NOT EXISTS period_type   text DEFAULT 'lesson',
  ADD COLUMN IF NOT EXISTS is_double     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS room          text,
  ADD COLUMN IF NOT EXISTS ai_generated  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by    uuid,
  ADD COLUMN IF NOT EXISTS created_at    timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_tp_school_class_day
  ON public.timetable_periods (school_id, class_id, day_of_week, period_number);
CREATE INDEX IF NOT EXISTS idx_tp_teacher_day
  ON public.timetable_periods (teacher_id, day_of_week, start_time);
CREATE INDEX IF NOT EXISTS idx_tp_school_term
  ON public.timetable_periods (school_id, academic_year, term);

ALTER TABLE public.timetable_periods ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tp_school_read"    ON public.timetable_periods;
DROP POLICY IF EXISTS "tp_deputy_write"   ON public.timetable_periods;
DROP POLICY IF EXISTS "tp_service"        ON public.timetable_periods;

CREATE POLICY "tp_school_read" ON public.timetable_periods
  FOR SELECT TO authenticated
  USING (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "tp_deputy_write" ON public.timetable_periods
  FOR ALL TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN (
      'deputy_principal','deputy_principal_academic','dean_of_studies',
      'principal','super_admin'
    )
  )
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN (
      'deputy_principal','deputy_principal_academic','dean_of_studies',
      'principal','super_admin'
    )
  );

CREATE POLICY "tp_service" ON public.timetable_periods
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Trigger: keep updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_timetable_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_tp_updated ON public.timetable_periods;
CREATE TRIGGER trg_tp_updated
  BEFORE UPDATE ON public.timetable_periods
  FOR EACH ROW EXECUTE FUNCTION public.touch_timetable_updated_at();


-- ── 2. CLASS QR TOKENS — one per class, exclusive generation ────

CREATE TABLE IF NOT EXISTS public.class_qr_tokens (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id         text        NOT NULL,   -- "grade-10-winners"
  class_name       text        NOT NULL,
  token_hash       text        NOT NULL,   -- HMAC-SHA256 hex; server recomputes on scan
  generation_seq   integer     NOT NULL DEFAULT 1,  -- increments on regeneration
  qr_payload       text        NOT NULL,   -- JSON string encoded into QR image
  generated_by     uuid        NOT NULL REFERENCES public.staff_records(id),
  generator_role   text        NOT NULL
                   CHECK (generator_role IN (
                     'deputy_principal','deputy_principal_academic','dean_of_studies'
                   )),
  is_active        boolean     DEFAULT true,
  generated_at     timestamptz DEFAULT now(),
  deactivated_at   timestamptz,
  deactivated_by   uuid        REFERENCES public.staff_records(id),
  scan_count       integer     DEFAULT 0,
  last_scanned_at  timestamptz,
  CONSTRAINT one_active_qr_per_class
    UNIQUE (school_id, class_id)  -- enforces single QR per class
);

ALTER TABLE public.class_qr_tokens
  ADD COLUMN IF NOT EXISTS school_id       uuid,
  ADD COLUMN IF NOT EXISTS class_id        text,
  ADD COLUMN IF NOT EXISTS class_name      text,
  ADD COLUMN IF NOT EXISTS token_hash      text,
  ADD COLUMN IF NOT EXISTS generation_seq  integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS qr_payload      text,
  ADD COLUMN IF NOT EXISTS generated_by    uuid,
  ADD COLUMN IF NOT EXISTS generator_role  text,
  ADD COLUMN IF NOT EXISTS is_active       boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS generated_at    timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deactivated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS deactivated_by  uuid,
  ADD COLUMN IF NOT EXISTS scan_count      integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_scanned_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_qr_school    ON public.class_qr_tokens (school_id, is_active);
CREATE INDEX IF NOT EXISTS idx_qr_token     ON public.class_qr_tokens (token_hash) WHERE is_active = true;

ALTER TABLE public.class_qr_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "qr_deputy_all"     ON public.class_qr_tokens;
DROP POLICY IF EXISTS "qr_teacher_read"   ON public.class_qr_tokens;
DROP POLICY IF EXISTS "qr_service"        ON public.class_qr_tokens;

CREATE POLICY "qr_deputy_all" ON public.class_qr_tokens
  FOR ALL TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN (
      'deputy_principal','deputy_principal_academic','dean_of_studies',
      'principal','super_admin'
    )
  )
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN (
      'deputy_principal','deputy_principal_academic','dean_of_studies',
      'principal','super_admin'
    )
  );

-- Teachers can see QR tokens for their assigned classes (to render QR on their device)
CREATE POLICY "qr_teacher_read" ON public.class_qr_tokens
  FOR SELECT TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND is_active = true
  );

CREATE POLICY "qr_service" ON public.class_qr_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 3. TEACHER ATTENDANCE SCANS ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teacher_attendance_scans (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id            uuid        NOT NULL,
  class_id             text        NOT NULL,
  class_name           text        NOT NULL,
  subject              text,
  teacher_id           uuid        NOT NULL REFERENCES public.staff_records(id),
  teacher_name         text,
  timetable_period_id  uuid        REFERENCES public.timetable_periods(id),
  qr_token_id          uuid        REFERENCES public.class_qr_tokens(id),
  scan_date            date        NOT NULL DEFAULT CURRENT_DATE,
  expected_start       time        NOT NULL,
  expected_end         time        NOT NULL,
  scanned_at           timestamptz DEFAULT now(),
  late_minutes         integer     DEFAULT 0,
  status               text        NOT NULL DEFAULT 'present'
                       CHECK (status IN (
                         'present','late','left_early','absent','incomplete'
                       )),
  device_info          text,
  ip_address           text,
  last_heartbeat_at    timestamptz,
  lesson_completed_at  timestamptz,
  left_early_at        timestamptz,
  left_early_minutes   integer,
  alert_sent           boolean     DEFAULT false,
  notes                text,
  UNIQUE (teacher_id, timetable_period_id, scan_date) -- no double-scan per period
);

ALTER TABLE public.teacher_attendance_scans
  ADD COLUMN IF NOT EXISTS school_id           uuid,
  ADD COLUMN IF NOT EXISTS class_id            text,
  ADD COLUMN IF NOT EXISTS class_name          text,
  ADD COLUMN IF NOT EXISTS subject             text,
  ADD COLUMN IF NOT EXISTS teacher_id          uuid,
  ADD COLUMN IF NOT EXISTS teacher_name        text,
  ADD COLUMN IF NOT EXISTS timetable_period_id uuid,
  ADD COLUMN IF NOT EXISTS qr_token_id         uuid,
  ADD COLUMN IF NOT EXISTS scan_date           date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS expected_start      time,
  ADD COLUMN IF NOT EXISTS expected_end        time,
  ADD COLUMN IF NOT EXISTS scanned_at          timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS late_minutes        integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status              text DEFAULT 'present',
  ADD COLUMN IF NOT EXISTS device_info         text,
  ADD COLUMN IF NOT EXISTS ip_address          text,
  ADD COLUMN IF NOT EXISTS last_heartbeat_at   timestamptz,
  ADD COLUMN IF NOT EXISTS lesson_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS left_early_at       timestamptz,
  ADD COLUMN IF NOT EXISTS left_early_minutes  integer,
  ADD COLUMN IF NOT EXISTS alert_sent          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notes               text;

CREATE INDEX IF NOT EXISTS idx_tas_teacher_date
  ON public.teacher_attendance_scans (teacher_id, scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_tas_school_date
  ON public.teacher_attendance_scans (school_id, scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_tas_status
  ON public.teacher_attendance_scans (school_id, status, scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_tas_heartbeat
  ON public.teacher_attendance_scans (school_id, last_heartbeat_at)
  WHERE status = 'present';

ALTER TABLE public.teacher_attendance_scans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tas_school_read"    ON public.teacher_attendance_scans;
DROP POLICY IF EXISTS "tas_teacher_own"    ON public.teacher_attendance_scans;
DROP POLICY IF EXISTS "tas_service"        ON public.teacher_attendance_scans;

CREATE POLICY "tas_school_read" ON public.teacher_attendance_scans
  FOR SELECT TO authenticated
  USING (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "tas_teacher_own" ON public.teacher_attendance_scans
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND teacher_id::text IN (
      SELECT id::text FROM public.staff_records
      WHERE user_id = auth.uid()::text
    )
  );

CREATE POLICY "tas_service" ON public.teacher_attendance_scans
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Supabase Realtime — principal dashboard subscribes to this
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'teacher_attendance_scans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_attendance_scans;
  END IF;
END $$;


-- ── 4. LESSON HEARTBEATS ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lesson_heartbeats (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id      uuid        NOT NULL REFERENCES public.teacher_attendance_scans(id) ON DELETE CASCADE,
  teacher_id   uuid        NOT NULL,
  school_id    uuid        NOT NULL,
  heartbeat_at timestamptz DEFAULT now(),
  seq          integer     NOT NULL DEFAULT 1  -- counter per scan session
);

ALTER TABLE public.lesson_heartbeats
  ADD COLUMN IF NOT EXISTS scan_id      uuid,
  ADD COLUMN IF NOT EXISTS teacher_id   uuid,
  ADD COLUMN IF NOT EXISTS school_id    uuid,
  ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS seq          integer DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_hb_scan
  ON public.lesson_heartbeats (scan_id, heartbeat_at DESC);
CREATE INDEX IF NOT EXISTS idx_hb_school_recent
  ON public.lesson_heartbeats (school_id, heartbeat_at DESC);

ALTER TABLE public.lesson_heartbeats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hb_teacher_insert" ON public.lesson_heartbeats;
DROP POLICY IF EXISTS "hb_school_read"    ON public.lesson_heartbeats;
DROP POLICY IF EXISTS "hb_service"        ON public.lesson_heartbeats;

CREATE POLICY "hb_teacher_insert" ON public.lesson_heartbeats
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND teacher_id::text IN (
      SELECT id::text FROM public.staff_records WHERE user_id = auth.uid()::text
    )
  );

CREATE POLICY "hb_school_read" ON public.lesson_heartbeats
  FOR SELECT TO authenticated
  USING (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "hb_service" ON public.lesson_heartbeats
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'lesson_heartbeats'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lesson_heartbeats;
  END IF;
END $$;


-- ── 5. HELPER: get_active_period_for_class ──────────────────────
--
-- Returns the timetable period that should be running right now
-- for a given class, based on current server time (EAT = UTC+3).

CREATE OR REPLACE FUNCTION public.get_active_period_for_class(
  p_school_id uuid,
  p_class_id  text,
  p_term      integer DEFAULT NULL,
  p_year      integer DEFAULT NULL
) RETURNS TABLE (
  period_id    uuid,
  subject      text,
  teacher_id   uuid,
  teacher_name text,
  start_time   time,
  end_time     time,
  period_type  text,
  late_window  interval  -- how far past start_time we still allow scan
) AS $$
DECLARE
  v_now_eat  timestamptz := now() AT TIME ZONE 'Africa/Nairobi';
  v_time     time        := v_now_eat::time;
  v_dow      integer     := EXTRACT(ISODOW FROM v_now_eat);  -- 1=Mon
  v_year     integer     := COALESCE(p_year,  EXTRACT(YEAR  FROM v_now_eat)::integer);
  v_term     integer     := COALESCE(p_term, 1);
BEGIN
  RETURN QUERY
  SELECT
    tp.id,
    tp.subject,
    tp.teacher_id,
    tp.teacher_name,
    tp.start_time,
    tp.end_time,
    tp.period_type,
    INTERVAL '10 minutes'   -- 10-minute grace window after lesson start
  FROM public.timetable_periods tp
  WHERE tp.school_id    = p_school_id
    AND tp.class_id     = p_class_id
    AND tp.academic_year = v_year
    AND tp.term         = v_term
    AND tp.day_of_week  = v_dow
    AND tp.period_type  = 'lesson'
    AND v_time BETWEEN tp.start_time AND tp.end_time
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ── 6. HELPER: get_teacher_workload_summary ─────────────────────
--
-- Per-teacher lesson count per week for workload balancing.

CREATE OR REPLACE FUNCTION public.get_teacher_workload_summary(
  p_school_id  uuid,
  p_year       integer,
  p_term       integer
) RETURNS TABLE (
  teacher_id     uuid,
  teacher_name   text,
  total_lessons  bigint,
  lessons_mon    bigint,
  lessons_tue    bigint,
  lessons_wed    bigint,
  lessons_thu    bigint,
  lessons_fri    bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    tp.teacher_id,
    tp.teacher_name,
    COUNT(*) FILTER (WHERE tp.period_type = 'lesson') AS total_lessons,
    COUNT(*) FILTER (WHERE tp.day_of_week = 1 AND tp.period_type = 'lesson') AS lessons_mon,
    COUNT(*) FILTER (WHERE tp.day_of_week = 2 AND tp.period_type = 'lesson') AS lessons_tue,
    COUNT(*) FILTER (WHERE tp.day_of_week = 3 AND tp.period_type = 'lesson') AS lessons_wed,
    COUNT(*) FILTER (WHERE tp.day_of_week = 4 AND tp.period_type = 'lesson') AS lessons_thu,
    COUNT(*) FILTER (WHERE tp.day_of_week = 5 AND tp.period_type = 'lesson') AS lessons_fri
  FROM public.timetable_periods tp
  WHERE tp.school_id    = p_school_id
    AND tp.academic_year = p_year
    AND tp.term         = p_term
    AND tp.teacher_id IS NOT NULL
  GROUP BY tp.teacher_id, tp.teacher_name
  ORDER BY total_lessons DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ── Verification ─────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'timetable_periods        : %',
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='timetable_periods');
  RAISE NOTICE 'class_qr_tokens          : %',
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='class_qr_tokens');
  RAISE NOTICE 'teacher_attendance_scans : %',
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='teacher_attendance_scans');
  RAISE NOTICE 'lesson_heartbeats        : %',
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='lesson_heartbeats');
  RAISE NOTICE 'get_active_period_for_class  fn: %',
    (SELECT COUNT(*) FROM pg_proc WHERE proname='get_active_period_for_class');
  RAISE NOTICE 'get_teacher_workload_summary fn: %',
    (SELECT COUNT(*) FROM pg_proc WHERE proname='get_teacher_workload_summary');
END $$;
