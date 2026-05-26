-- ================================================================
-- TIMETABLE ENGINE V2 — 2026-05-26
--
-- Adds the "spine" layer that connects QR attendance, cover
-- allocation, EWS fairness, and duty tracking.
--
-- NEW TABLES:
--   school_periods      — configurable per-school period schedule
--   clusters            — subject clusters for cover cascade
--   cluster_members     — teacher→cluster membership
--   teacher_ews         — equitable workload score (trigger-maintained)
--   duty_log            — complexity-weighted duty records (feeds EWS)
--   teacher_absences    — absence management (triggers cover workflow)
--
-- ALTERS:
--   timetable_periods   — +cover fields (is_covered, covered_by_id, ...)
--
-- PATTERN: school_id + get_my_school_id() RLS throughout
-- ================================================================


-- ── 1. SCHOOL PERIODS ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.school_periods (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  period_number  int         NOT NULL,
  period_name    text,
  start_time     time        NOT NULL,
  end_time       time        NOT NULL,
  is_teaching    boolean     DEFAULT true,
  academic_year  int,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (school_id, period_number, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_sp_school_time
  ON public.school_periods (school_id, start_time, end_time);

ALTER TABLE public.school_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sp_school_read"   ON public.school_periods;
DROP POLICY IF EXISTS "sp_deputy_write"  ON public.school_periods;
DROP POLICY IF EXISTS "sp_service"       ON public.school_periods;

CREATE POLICY "sp_school_read" ON public.school_periods
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "sp_deputy_write" ON public.school_periods
  FOR ALL TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'deputy_principal','deputy_principal_academic','dean_of_studies',
      'principal','super_admin'
    )
  )
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'deputy_principal','deputy_principal_academic','dean_of_studies',
      'principal','super_admin'
    )
  );

CREATE POLICY "sp_service" ON public.school_periods
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 2. CLUSTERS (subject groupings for cover cascade) ────────────

CREATE TABLE IF NOT EXISTS public.clusters (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name         text        NOT NULL,         -- 'STEM-A', 'Humanities-B'
  department   text,
  color_code   text,                         -- hex for UI
  created_by   uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (school_id, name)
);

ALTER TABLE public.clusters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clusters_school_read"  ON public.clusters;
DROP POLICY IF EXISTS "clusters_deputy_write" ON public.clusters;
DROP POLICY IF EXISTS "clusters_service"      ON public.clusters;

CREATE POLICY "clusters_school_read" ON public.clusters
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "clusters_deputy_write" ON public.clusters
  FOR ALL TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'deputy_principal','deputy_principal_academic','dean_of_studies',
      'principal','super_admin'
    )
  )
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'deputy_principal','deputy_principal_academic','dean_of_studies',
      'principal','super_admin'
    )
  );

CREATE POLICY "clusters_service" ON public.clusters
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 3. CLUSTER MEMBERS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cluster_members (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid    NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  cluster_id       uuid    NOT NULL REFERENCES public.clusters(id) ON DELETE CASCADE,
  teacher_id       uuid    NOT NULL REFERENCES public.staff_records(id) ON DELETE CASCADE,
  is_cluster_lead  boolean DEFAULT false,
  UNIQUE (cluster_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_cm_cluster  ON public.cluster_members(cluster_id);
CREATE INDEX IF NOT EXISTS idx_cm_teacher  ON public.cluster_members(teacher_id);

ALTER TABLE public.cluster_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cm_school_read"   ON public.cluster_members;
DROP POLICY IF EXISTS "cm_deputy_write"  ON public.cluster_members;
DROP POLICY IF EXISTS "cm_service"       ON public.cluster_members;

CREATE POLICY "cm_school_read" ON public.cluster_members
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "cm_deputy_write" ON public.cluster_members
  FOR ALL TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'deputy_principal','deputy_principal_academic','dean_of_studies',
      'principal','super_admin'
    )
  )
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'deputy_principal','deputy_principal_academic','dean_of_studies',
      'principal','super_admin'
    )
  );

CREATE POLICY "cm_service" ON public.cluster_members
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 4. TEACHER EWS (Equitable Workload Score) ────────────────────

CREATE TABLE IF NOT EXISTS public.teacher_ews (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id         uuid        UNIQUE REFERENCES public.staff_records(id) ON DELETE CASCADE,
  ews_score          int         DEFAULT 0,
  invigilation_count int         DEFAULT 0,
  cover_count        int         DEFAULT 0,
  gate_duty_count    int         DEFAULT 0,
  assembly_duty_count int        DEFAULT 0,
  last_duty_date     date,
  last_updated       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ews_school_score
  ON public.teacher_ews (school_id, ews_score ASC);

ALTER TABLE public.teacher_ews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ews_school_read"  ON public.teacher_ews;
DROP POLICY IF EXISTS "ews_service"      ON public.teacher_ews;

CREATE POLICY "ews_school_read" ON public.teacher_ews
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "ews_service" ON public.teacher_ews
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 5. DUTY LOG (complexity-weighted, feeds EWS via trigger) ─────
--    Complements existing duty_rosters — adds weights + EWS linkage

CREATE TABLE IF NOT EXISTS public.duty_log (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            uuid    NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id           uuid    REFERENCES public.staff_records(id) ON DELETE SET NULL,
  duty_type            text    NOT NULL
    CHECK (duty_type IN (
      'Invigilation',       -- weight: 3
      'ClassCover',         -- weight: 2
      'GateDuty',           -- weight: 1
      'AssemblyDuty',       -- weight: 1
      'LunchDuty',          -- weight: 1
      'CleaningSupervision' -- weight: 1
    )),
  complexity_weight    int     NOT NULL DEFAULT 1,
  duty_date            date    NOT NULL,
  period_id            uuid    REFERENCES public.school_periods(id) ON DELETE SET NULL,
  timetable_period_id  uuid    REFERENCES public.timetable_periods(id) ON DELETE SET NULL,
  covering_for_id      uuid    REFERENCES public.staff_records(id) ON DELETE SET NULL,
  notes                text,
  created_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_duty_log_teacher  ON public.duty_log(teacher_id, duty_date DESC);
CREATE INDEX IF NOT EXISTS idx_duty_log_school   ON public.duty_log(school_id, duty_date DESC);

ALTER TABLE public.duty_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dl_school_read"   ON public.duty_log;
DROP POLICY IF EXISTS "dl_deputy_write"  ON public.duty_log;
DROP POLICY IF EXISTS "dl_service"       ON public.duty_log;

CREATE POLICY "dl_school_read" ON public.duty_log
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "dl_deputy_write" ON public.duty_log
  FOR ALL TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'deputy_principal','deputy_principal_academic','dean_of_studies',
      'principal','super_admin'
    )
  )
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'deputy_principal','deputy_principal_academic','dean_of_studies',
      'principal','super_admin'
    )
  );

CREATE POLICY "dl_service" ON public.duty_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 5a. EWS AUTO-UPDATE TRIGGER ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_update_teacher_ews()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.teacher_ews (
    school_id, teacher_id, ews_score,
    invigilation_count, cover_count, gate_duty_count, assembly_duty_count,
    last_duty_date, last_updated
  )
  VALUES (
    NEW.school_id,
    NEW.teacher_id,
    NEW.complexity_weight,
    CASE WHEN NEW.duty_type = 'Invigilation'  THEN 1 ELSE 0 END,
    CASE WHEN NEW.duty_type = 'ClassCover'    THEN 1 ELSE 0 END,
    CASE WHEN NEW.duty_type = 'GateDuty'      THEN 1 ELSE 0 END,
    CASE WHEN NEW.duty_type = 'AssemblyDuty'  THEN 1 ELSE 0 END,
    NEW.duty_date,
    now()
  )
  ON CONFLICT (teacher_id) DO UPDATE SET
    ews_score           = teacher_ews.ews_score + NEW.complexity_weight,
    invigilation_count  = teacher_ews.invigilation_count
                          + CASE WHEN NEW.duty_type = 'Invigilation' THEN 1 ELSE 0 END,
    cover_count         = teacher_ews.cover_count
                          + CASE WHEN NEW.duty_type = 'ClassCover' THEN 1 ELSE 0 END,
    gate_duty_count     = teacher_ews.gate_duty_count
                          + CASE WHEN NEW.duty_type = 'GateDuty' THEN 1 ELSE 0 END,
    assembly_duty_count = teacher_ews.assembly_duty_count
                          + CASE WHEN NEW.duty_type = 'AssemblyDuty' THEN 1 ELSE 0 END,
    last_duty_date      = NEW.duty_date,
    last_updated        = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_ews ON public.duty_log;
CREATE TRIGGER trg_update_ews
  AFTER INSERT ON public.duty_log
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_update_teacher_ews();


-- ── 6. TEACHER ABSENCES ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.teacher_absences (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid    NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id    uuid    REFERENCES public.staff_records(id) ON DELETE SET NULL,
  absence_date  date    NOT NULL,
  absence_type  text    NOT NULL DEFAULT 'Unexplained'
    CHECK (absence_type IN (
      'Sick','StudyLeave','OfficialDuty','PersonalLeave','Unexplained'
    )),
  reported_by   uuid    REFERENCES public.staff_records(id) ON DELETE SET NULL,
  cover_status  text    DEFAULT 'Pending'
    CHECK (cover_status IN ('Pending','PartialCover','FullyCovered')),
  notes         text,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (school_id, teacher_id, absence_date)
);

CREATE INDEX IF NOT EXISTS idx_ta_school_date  ON public.teacher_absences(school_id, absence_date DESC);
CREATE INDEX IF NOT EXISTS idx_ta_teacher      ON public.teacher_absences(teacher_id, absence_date DESC);

ALTER TABLE public.teacher_absences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ta_school_read"   ON public.teacher_absences;
DROP POLICY IF EXISTS "ta_deputy_write"  ON public.teacher_absences;
DROP POLICY IF EXISTS "ta_service"       ON public.teacher_absences;

CREATE POLICY "ta_school_read" ON public.teacher_absences
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "ta_deputy_write" ON public.teacher_absences
  FOR ALL TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'deputy_principal','deputy_principal_academic','dean_of_studies',
      'principal','super_admin'
    )
  )
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'deputy_principal','deputy_principal_academic','dean_of_studies',
      'principal','super_admin'
    )
  );

CREATE POLICY "ta_service" ON public.teacher_absences
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 7. EXTEND timetable_periods WITH COVER FIELDS ────────────────

ALTER TABLE public.timetable_periods
  ADD COLUMN IF NOT EXISTS is_covered        boolean     DEFAULT false,
  ADD COLUMN IF NOT EXISTS covered_by_id     uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cover_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS cluster_id        uuid        REFERENCES public.clusters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_active         boolean     DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_tp_cover
  ON public.timetable_periods (school_id, is_covered, is_active);


-- ── 8. SEED NKOROI PERIODS (Mon–Fri, 8-period day) ───────────────
-- Uses DO block so it only inserts when school exists; safe to re-run.

DO $$
DECLARE
  v_school_id uuid;
BEGIN
  SELECT id INTO v_school_id
  FROM public.schools
  WHERE subdomain = 'nkoroimixed'
  LIMIT 1;

  IF v_school_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.school_periods
    (school_id, period_number, period_name, start_time, end_time, is_teaching, academic_year)
  VALUES
    (v_school_id, 1,  'Period 1',    '07:30', '08:20', true,  2026),
    (v_school_id, 2,  'Period 2',    '08:20', '09:10', true,  2026),
    (v_school_id, 3,  'Period 3',    '09:10', '10:00', true,  2026),
    (v_school_id, 4,  'Break',       '10:00', '10:20', false, 2026),
    (v_school_id, 5,  'Period 4',    '10:20', '11:10', true,  2026),
    (v_school_id, 6,  'Period 5',    '11:10', '12:00', true,  2026),
    (v_school_id, 7,  'Period 6',    '12:00', '12:50', true,  2026),
    (v_school_id, 8,  'Lunch',       '12:50', '13:30', false, 2026),
    (v_school_id, 9,  'Period 7',    '13:30', '14:20', true,  2026),
    (v_school_id, 10, 'Period 8',    '14:20', '15:10', true,  2026),
    (v_school_id, 11, 'Games/Clubs', '15:10', '16:00', false, 2026),
    (v_school_id, 12, 'Evening Prep','19:00', '21:00', true,  2026)
  ON CONFLICT (school_id, period_number, academic_year) DO NOTHING;
END $$;


-- ── 9. ENABLE REALTIME ───────────────────────────────────────────

ALTER TABLE public.timetable_periods REPLICA IDENTITY FULL;
ALTER TABLE public.teacher_absences  REPLICA IDENTITY FULL;
ALTER TABLE public.duty_log          REPLICA IDENTITY FULL;
ALTER TABLE public.teacher_ews       REPLICA IDENTITY FULL;
