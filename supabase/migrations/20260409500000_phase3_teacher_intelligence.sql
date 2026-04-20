-- Phase 3: Teacher Intelligence
-- Tables: attendance_records, lesson_sessions, lesson_heartbeats, school_rules, topic_mastery

-- ── attendance_records ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id   text NOT NULL,
  class_name   text NOT NULL,
  subject      text,
  date         date NOT NULL DEFAULT CURRENT_DATE,
  period       integer,
  student_id   text,
  student_name text,
  status       text NOT NULL CHECK (status IN ('present','absent','late','excused')),
  reason       text,
  lat          double precision,
  lng          double precision,
  synced_at    timestamptz DEFAULT now(),
  created_at   timestamptz DEFAULT now()
);

-- ── lesson_sessions ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lesson_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id          text NOT NULL,
  class_name          text NOT NULL,
  subject             text NOT NULL,
  subject_id          uuid,
  date                date NOT NULL DEFAULT CURRENT_DATE,
  period              integer,
  start_time          text,
  end_time            text,
  topic_covered       text,
  subtopics           text[],
  micro_score         numeric(4,1),
  notes               text,
  is_active           boolean DEFAULT false,
  lat                 double precision,
  lng                 double precision,
  check_in_confirmed  boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

-- ── lesson_heartbeats ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lesson_heartbeats (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  lesson_id        uuid REFERENCES public.lesson_sessions(id) ON DELETE CASCADE,
  teacher_id       text NOT NULL,
  timestamp        timestamptz DEFAULT now(),
  lat              double precision,
  lng              double precision,
  within_geofence  boolean DEFAULT false,
  confidence_score integer DEFAULT 0
);

-- ── school_rules ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.school_rules (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  category   text NOT NULL,
  rule_text  text NOT NULL,
  severity   integer DEFAULT 1 CHECK (severity BETWEEN 1 AND 3),
  is_active  boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ── topic_mastery ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.topic_mastery (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_name    text NOT NULL,
  subject       text NOT NULL,
  teacher_id    text NOT NULL,
  topic         text NOT NULL,
  mastery_level integer DEFAULT 1 CHECK (mastery_level BETWEEN 1 AND 4),
  student_count integer DEFAULT 0,
  assessed_at   date DEFAULT CURRENT_DATE,
  created_at    timestamptz DEFAULT now()
);

-- ── HOD onboarding tokens ────────────────────────────────────────────────────

ALTER TABLE public.staff_records
  ADD COLUMN IF NOT EXISTS onboard_token      text,
  ADD COLUMN IF NOT EXISTS onboard_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboard_used_at    timestamptz;

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.attendance_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_heartbeats   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_rules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_mastery       ENABLE ROW LEVEL SECURITY;

-- Drop if exists (idempotent re-runs)
DO $$ BEGIN
  DROP POLICY IF EXISTS "attendance_school_select"   ON public.attendance_records;
  DROP POLICY IF EXISTS "attendance_teacher_insert"  ON public.attendance_records;
  DROP POLICY IF EXISTS "lesson_sessions_select"     ON public.lesson_sessions;
  DROP POLICY IF EXISTS "lesson_sessions_insert"     ON public.lesson_sessions;
  DROP POLICY IF EXISTS "lesson_sessions_update"     ON public.lesson_sessions;
  DROP POLICY IF EXISTS "heartbeats_select"          ON public.lesson_heartbeats;
  DROP POLICY IF EXISTS "heartbeats_insert"          ON public.lesson_heartbeats;
  DROP POLICY IF EXISTS "school_rules_select"        ON public.school_rules;
  DROP POLICY IF EXISTS "school_rules_manage"        ON public.school_rules;
  DROP POLICY IF EXISTS "topic_mastery_select"       ON public.topic_mastery;
  DROP POLICY IF EXISTS "topic_mastery_all"          ON public.topic_mastery;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- attendance_records
CREATE POLICY "attendance_school_select" ON public.attendance_records
  FOR SELECT USING (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "attendance_teacher_insert" ON public.attendance_records
  FOR INSERT WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND EXISTS (
      SELECT 1 FROM public.staff_records sr
      WHERE sr.user_id::text = auth.uid()::text
        AND sr.school_id = public.attendance_records.school_id
    )
  );

-- lesson_sessions
CREATE POLICY "lesson_sessions_select" ON public.lesson_sessions
  FOR SELECT USING (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "lesson_sessions_insert" ON public.lesson_sessions
  FOR INSERT WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND EXISTS (
      SELECT 1 FROM public.staff_records sr
      WHERE sr.user_id::text = auth.uid()::text
        AND sr.school_id = public.lesson_sessions.school_id
    )
  );

CREATE POLICY "lesson_sessions_update" ON public.lesson_sessions
  FOR UPDATE USING (
    teacher_id IN (
      SELECT sr.id::text FROM public.staff_records sr
      WHERE sr.user_id::text = auth.uid()::text
    )
    OR EXISTS (
      SELECT 1 FROM public.staff_records sr
      WHERE sr.user_id::text = auth.uid()::text
        AND sr.sub_role IN ('principal','deputy_principal_academics','deputy_principal_academic')
        AND sr.school_id = public.lesson_sessions.school_id
    )
  );

-- lesson_heartbeats
CREATE POLICY "heartbeats_select" ON public.lesson_heartbeats
  FOR SELECT USING (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "heartbeats_insert" ON public.lesson_heartbeats
  FOR INSERT WITH CHECK (school_id::text = public.get_my_school_id()::text);

-- school_rules
CREATE POLICY "school_rules_select" ON public.school_rules
  FOR SELECT USING (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "school_rules_manage" ON public.school_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.staff_records sr
      WHERE sr.user_id::text = auth.uid()::text
        AND sr.school_id = public.school_rules.school_id
        AND sr.sub_role IN ('principal','deputy_principal_academics','deputy_principal_admin','deputy_principal_academic')
    )
  );

-- topic_mastery
CREATE POLICY "topic_mastery_select" ON public.topic_mastery
  FOR SELECT USING (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "topic_mastery_all" ON public.topic_mastery
  FOR ALL USING (school_id::text = public.get_my_school_id()::text);

-- ── Seed default school rules ────────────────────────────────────────────────
-- Only inserts if school_rules is empty for this school
-- (Schools are expected to customise later via principal dashboard)
-- No auto-insert: each school sets their own rules.
