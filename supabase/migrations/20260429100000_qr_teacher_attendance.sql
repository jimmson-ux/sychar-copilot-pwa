-- ============================================================
-- QR Teacher Time Attendance — timetable-aware check-in system
-- Principle: timetable is the single source of truth.
-- A teacher can only check in to a lesson that EXISTS in their
-- timetable for that exact day + period.
-- ============================================================

-- ── Extend timetable with room_name ──────────────────────────────────────────
ALTER TABLE public.timetable
  ADD COLUMN IF NOT EXISTS room_name text;

-- ── Extend lesson_sessions for QR attendance ─────────────────────────────────
ALTER TABLE public.lesson_sessions
  ADD COLUMN IF NOT EXISTS timetable_entry_id  uuid,
  ADD COLUMN IF NOT EXISTS qr_room_name        text,
  ADD COLUMN IF NOT EXISTS checkin_time        timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_time       timestamptz,
  ADD COLUMN IF NOT EXISTS checkout_lat        double precision,
  ADD COLUMN IF NOT EXISTS checkout_lng        double precision,
  ADD COLUMN IF NOT EXISTS compliance_score    integer DEFAULT 0
    CHECK (compliance_score BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS session_status      text DEFAULT 'pending'
    CHECK (session_status IN ('pending','checked_in','missed','completed','overridden')),
  ADD COLUMN IF NOT EXISTS override_by         text,
  ADD COLUMN IF NOT EXISTS override_reason     text;

-- ── room_qr_codes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.room_qr_codes (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id   uuid        NOT NULL,
  room_name   text        NOT NULL,
  qr_token    text        NOT NULL,
  qr_url      text,
  is_active   boolean     DEFAULT true,
  created_by  text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(school_id, room_name)
);

ALTER TABLE public.room_qr_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "room_qr_select" ON public.room_qr_codes;
CREATE POLICY "room_qr_select" ON public.room_qr_codes
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "room_qr_manage" ON public.room_qr_codes;
CREATE POLICY "room_qr_manage" ON public.room_qr_codes
  FOR ALL TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND EXISTS (
      SELECT 1 FROM public.staff_records sr
      WHERE sr.user_id::text = auth.uid()::text
        AND sr.sub_role IN ('principal','deputy_principal','deputy_principal_admin',
                            'deputy_principal_academics','deputy_principal_academic')
        AND sr.school_id = public.room_qr_codes.school_id
    )
  )
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND EXISTS (
      SELECT 1 FROM public.staff_records sr
      WHERE sr.user_id::text = auth.uid()::text
        AND sr.sub_role IN ('principal','deputy_principal','deputy_principal_admin',
                            'deputy_principal_academics','deputy_principal_academic')
        AND sr.school_id = public.room_qr_codes.school_id
    )
  );

DROP POLICY IF EXISTS "room_qr_service" ON public.room_qr_codes;
CREATE POLICY "room_qr_service" ON public.room_qr_codes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── lesson_sessions: service bypass + indexes ─────────────────────────────────
DROP POLICY IF EXISTS "lesson_sessions_service" ON public.lesson_sessions;
CREATE POLICY "lesson_sessions_service" ON public.lesson_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_lesson_sessions_timetable
  ON public.lesson_sessions(timetable_entry_id);
CREATE INDEX IF NOT EXISTS idx_lesson_sessions_teacher_date
  ON public.lesson_sessions(teacher_id, date, session_status);
CREATE INDEX IF NOT EXISTS idx_lesson_sessions_school_date
  ON public.lesson_sessions(school_id, date, session_status);
CREATE INDEX IF NOT EXISTS idx_lesson_heartbeats_session
  ON public.lesson_heartbeats(lesson_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_room_qr_school
  ON public.room_qr_codes(school_id, is_active);

-- ── get_current_lesson_for_teacher ───────────────────────────────────────────
-- Returns the timetable row whose day + time window covers now().
-- Uses Africa/Nairobi timezone. Grace window: start-20min to end+10min.
CREATE OR REPLACE FUNCTION public.get_current_lesson_for_teacher(
  p_staff_id  uuid,
  p_school_id uuid
)
RETURNS TABLE (
  entry_id      uuid,
  class_name    text,
  subject       text,
  period_number integer,
  start_time    time,
  end_time      time,
  room_name     text,
  teacher_name  text,
  day           text,
  term          text,
  academic_year text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_day      text;
  v_now_time time;
BEGIN
  v_day      := trim(to_char(now() AT TIME ZONE 'Africa/Nairobi', 'Day'));
  v_now_time := (now() AT TIME ZONE 'Africa/Nairobi')::time;

  RETURN QUERY
  SELECT
    t.id           AS entry_id,
    t.class_name,
    t.subject,
    t.period_number,
    t.start_time,
    t.end_time,
    t.room_name,
    t.teacher_name,
    t.day,
    t.term,
    t.academic_year
  FROM public.timetable t
  WHERE t.teacher_id = p_staff_id
    AND t.school_id::uuid = p_school_id
    AND UPPER(trim(t.day)) = UPPER(v_day)
    AND t.is_active = true
    AND t.start_time IS NOT NULL
    AND t.end_time IS NOT NULL
    AND v_now_time BETWEEN (t.start_time - interval '20 minutes')
                       AND (t.end_time   + interval '10 minutes')
  ORDER BY t.start_time
  LIMIT 1;
END;
$$;

-- ── get_teacher_day_schedule ─────────────────────────────────────────────────
-- Full day schedule for a teacher with live session status.
CREATE OR REPLACE FUNCTION public.get_teacher_day_schedule(
  p_staff_id  uuid,
  p_school_id uuid,
  p_date      date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  entry_id      uuid,
  class_name    text,
  subject       text,
  period_number integer,
  start_time    time,
  end_time      time,
  room_name     text,
  day           text,
  term          text,
  academic_year text,
  session_id    uuid,
  session_status text,
  checkin_time  timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_day text;
BEGIN
  v_day := trim(to_char(p_date, 'Day'));

  RETURN QUERY
  SELECT
    t.id           AS entry_id,
    t.class_name,
    t.subject,
    t.period_number,
    t.start_time,
    t.end_time,
    t.room_name,
    t.day,
    t.term,
    t.academic_year,
    ls.id          AS session_id,
    ls.session_status,
    ls.checkin_time
  FROM public.timetable t
  LEFT JOIN public.lesson_sessions ls
    ON  ls.timetable_entry_id = t.id
    AND ls.date = p_date
  WHERE t.teacher_id = p_staff_id
    AND t.school_id::uuid = p_school_id
    AND UPPER(trim(t.day)) = UPPER(v_day)
    AND t.is_active = true
  ORDER BY t.start_time;
END;
$$;

-- ── pg_cron: mark missed lessons (every 5 minutes) ───────────────────────────
DO $outer$
BEGIN
  PERFORM cron.schedule(
    'mark-missed-lessons',
    '*/5 * * * *',
    $cron$
      INSERT INTO public.lesson_sessions (
        school_id, teacher_id, class_name, subject, date, period,
        start_time, end_time, timetable_entry_id, session_status, created_at
      )
      SELECT
        t.school_id::uuid,
        t.teacher_id::text,
        t.class_name,
        t.subject,
        CURRENT_DATE,
        t.period_number,
        t.start_time::text,
        t.end_time::text,
        t.id,
        'missed',
        now()
      FROM public.timetable t
      WHERE t.is_active = true
        AND t.start_time IS NOT NULL
        AND t.end_time IS NOT NULL
        AND UPPER(trim(t.day)) = UPPER(trim(to_char(now() AT TIME ZONE 'Africa/Nairobi', 'Day')))
        AND (now() AT TIME ZONE 'Africa/Nairobi')::time > (t.end_time + interval '15 minutes')
        AND NOT EXISTS (
          SELECT 1 FROM public.lesson_sessions ls
          WHERE ls.timetable_entry_id = t.id
            AND ls.date = CURRENT_DATE
        )
    $cron$
  );
  PERFORM cron.schedule(
    'auto-complete-active-lessons',
    '*/5 * * * *',
    $cron$
      UPDATE public.lesson_sessions
      SET session_status = 'completed',
          checkout_time  = COALESCE(checkout_time, now())
      WHERE session_status = 'checked_in'
        AND date = CURRENT_DATE
        AND end_time IS NOT NULL
        AND (now() AT TIME ZONE 'Africa/Nairobi')::time > (end_time::time + interval '5 minutes')
    $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — skip QR attendance cron: %', SQLERRM;
END $outer$;
