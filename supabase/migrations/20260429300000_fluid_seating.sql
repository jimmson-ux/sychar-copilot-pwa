-- ============================================================
-- FLUID SEATING ARRANGEMENT SYSTEM
-- Replaces the simple JSONB seating_arrangements approach with
-- a fully relational schema that can be queried, joined, and
-- analysed. Each student seat is a row — position links to
-- behaviour, discipline, and performance data.
-- ============================================================

-- ── CLASSROOM SEAT MAP (the physical room layout) ────────────
CREATE TABLE IF NOT EXISTS classroom_seat_maps (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id             uuid NOT NULL,
  class_name            text NOT NULL,
  stream_name           text NOT NULL,
  rows                  integer NOT NULL DEFAULT 8,
  cols                  integer NOT NULL DEFAULT 6,
  total_seats           integer GENERATED ALWAYS AS (rows * cols) STORED,
  teacher_desk_position text DEFAULT 'front'
                        CHECK (teacher_desk_position IN ('front','back','side')),
  term                  integer NOT NULL,
  academic_year         text NOT NULL,
  is_active             boolean DEFAULT true,
  created_by            uuid REFERENCES staff_records(id),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  UNIQUE(school_id, class_name, stream_name, term, academic_year)
);

ALTER TABLE classroom_seat_maps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "csm_school" ON classroom_seat_maps
  FOR ALL TO authenticated USING (school_id = get_my_school_id());
CREATE POLICY "csm_service" ON classroom_seat_maps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── STUDENT SEAT ASSIGNMENTS (live seating record) ───────────
CREATE TABLE IF NOT EXISTS student_seat_assignments (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id            uuid NOT NULL,
  seat_map_id          uuid NOT NULL REFERENCES classroom_seat_maps(id)
                       ON DELETE CASCADE,
  student_id           uuid NOT NULL REFERENCES students(id)
                       ON DELETE CASCADE,
  row_number           integer NOT NULL,
  col_number           integer NOT NULL,
  seat_label           text,
  placed_by            uuid REFERENCES staff_records(id),
  placed_at            timestamptz DEFAULT now(),
  placement_note       text,
  -- Intelligence flags (set by BEFORE trigger)
  is_discipline_risk   boolean DEFAULT false,
  is_high_performer    boolean DEFAULT false,
  is_low_performer     boolean DEFAULT false,
  adjacent_risk_score  integer DEFAULT 0 CHECK (adjacent_risk_score BETWEEN 0 AND 100),
  is_active            boolean DEFAULT true,
  term                 integer NOT NULL,
  academic_year        text NOT NULL,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  UNIQUE(seat_map_id, row_number, col_number),
  UNIQUE(seat_map_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_ssa_map
  ON student_seat_assignments(seat_map_id);
CREATE INDEX IF NOT EXISTS idx_ssa_student
  ON student_seat_assignments(student_id, term, academic_year);
CREATE INDEX IF NOT EXISTS idx_ssa_school_map
  ON student_seat_assignments(school_id, seat_map_id)
  WHERE is_active = true;

ALTER TABLE student_seat_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ssa_school" ON student_seat_assignments
  FOR ALL TO authenticated USING (school_id = get_my_school_id());
CREATE POLICY "ssa_service" ON student_seat_assignments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Enable Realtime
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'student_seat_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE student_seat_assignments;
  END IF;
END $$;

-- ── SEAT CHANGE LOG (immutable audit trail) ──────────────────
CREATE TABLE IF NOT EXISTS seat_change_log (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id   uuid NOT NULL,
  seat_map_id uuid NOT NULL,
  student_id  uuid NOT NULL,
  from_row    integer,
  from_col    integer,
  to_row      integer NOT NULL,
  to_col      integer NOT NULL,
  reason      text,
  reason_code text CHECK (reason_code IN (
    'initial_placement',
    'discipline',
    'performance',
    'ai_suggestion',
    'teacher_preference',
    'student_request',
    'exam_rotation'
  )),
  moved_by    uuid REFERENCES staff_records(id),
  moved_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scl_student
  ON seat_change_log(student_id, moved_at DESC);
CREATE INDEX IF NOT EXISTS idx_scl_map
  ON seat_change_log(seat_map_id, moved_at DESC);

ALTER TABLE seat_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scl_school" ON seat_change_log
  FOR SELECT TO authenticated USING (school_id = get_my_school_id());
CREATE POLICY "scl_insert" ON seat_change_log
  FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());
CREATE POLICY "scl_no_update" ON seat_change_log
  FOR UPDATE TO authenticated USING (false);
CREATE POLICY "scl_no_delete" ON seat_change_log
  FOR DELETE TO authenticated USING (false);
CREATE POLICY "scl_service" ON seat_change_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── SEATING INTELLIGENCE SNAPSHOTS ───────────────────────────
CREATE TABLE IF NOT EXISTS seating_intelligence (
  id                       uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id                uuid NOT NULL,
  seat_map_id              uuid NOT NULL REFERENCES classroom_seat_maps(id),
  class_name               text NOT NULL,
  stream_name              text NOT NULL,
  term                     integer NOT NULL,
  academic_year            text NOT NULL,
  discipline_clusters      jsonb DEFAULT '[]',
  performance_gaps         jsonb DEFAULT '[]',
  recommended_moves        jsonb DEFAULT '[]',
  class_summary            text,
  principal_summary        text,
  risk_count               integer DEFAULT 0,
  urgent_move_count        integer DEFAULT 0,
  computed_at              timestamptz DEFAULT now(),
  discipline_records_count integer DEFAULT 0,
  marks_records_count      integer DEFAULT 0,
  UNIQUE(school_id, seat_map_id)
);

CREATE INDEX IF NOT EXISTS idx_si_school_class
  ON seating_intelligence(school_id, class_name, stream_name, computed_at DESC);

ALTER TABLE seating_intelligence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "si_school" ON seating_intelligence
  FOR ALL TO authenticated USING (school_id = get_my_school_id());
CREATE POLICY "si_service" ON seating_intelligence
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── PRINCIPAL SEATING SUMMARY ─────────────────────────────────
CREATE TABLE IF NOT EXISTS principal_seating_summary (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id           uuid NOT NULL,
  term                integer NOT NULL,
  academic_year       text NOT NULL,
  total_classes       integer DEFAULT 0,
  classes_analysed    integer DEFAULT 0,
  total_risk_pairs    integer DEFAULT 0,
  total_urgent_moves  integer DEFAULT 0,
  highest_risk_class  text,
  executive_summary   text,
  class_breakdown     jsonb DEFAULT '[]',
  computed_at         timestamptz DEFAULT now(),
  UNIQUE(school_id, term, academic_year)
);

ALTER TABLE principal_seating_summary ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pss_principal" ON principal_seating_summary
  FOR ALL TO authenticated
  USING (
    school_id = get_my_school_id()
    AND EXISTS (
      SELECT 1 FROM staff_records
      WHERE user_id = auth.uid()::text
        AND sub_role IN (
          'principal','deputy_principal','deputy_principal_admin',
          'dean_of_studies','deputy_dean','qaso'
        )
      LIMIT 1
    )
  );
CREATE POLICY "pss_service" ON principal_seating_summary
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'principal_seating_summary'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE principal_seating_summary;
  END IF;
END $$;

-- ============================================================
-- TRIGGER 1: Flag student risk on seat assignment (BEFORE)
-- Sets is_discipline_risk, is_high_performer, is_low_performer
-- based on actual discipline and marks data.
-- Using BEFORE trigger so we can set NEW.xxx directly.
-- ============================================================
CREATE OR REPLACE FUNCTION flag_student_seat_risk()
RETURNS TRIGGER AS $$
DECLARE
  v_discipline_count integer := 0;
  v_avg_score        numeric;
  v_class_avg        numeric;
BEGIN
  -- Count discipline incidents in the last 90 days
  -- discipline_records.school_id and student_id are UUIDs — cast for safety
  SELECT COUNT(*) INTO v_discipline_count
  FROM discipline_records
  WHERE student_id::text = NEW.student_id::text
    AND school_id::text  = NEW.school_id::text
    AND created_at > NOW() - INTERVAL '90 days';

  -- Student average score this term
  -- marks.term is TEXT; student_seat_assignments.term is INTEGER — compare as text
  SELECT AVG(percentage) INTO v_avg_score
  FROM marks
  WHERE student_id = NEW.student_id
    AND school_id::text = NEW.school_id::text
    AND term::text      = NEW.term::text
    AND academic_year   = NEW.academic_year;

  -- Class average: all students already seated in this map
  SELECT AVG(m.percentage) INTO v_class_avg
  FROM marks m
  WHERE m.student_id IN (
    SELECT student_id
    FROM student_seat_assignments
    WHERE seat_map_id = NEW.seat_map_id
      AND is_active   = true
  )
  AND m.school_id::text = NEW.school_id::text
  AND m.term::text      = NEW.term::text
  AND m.academic_year   = NEW.academic_year;

  -- Apply flags
  NEW.is_discipline_risk := v_discipline_count >= 2;
  NEW.is_high_performer  := COALESCE(v_avg_score, 0) >= COALESCE(v_class_avg, 50) + 15;
  NEW.is_low_performer   := COALESCE(v_avg_score, 100) <= COALESCE(v_class_avg, 50) - 15;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_flag_seat_risk ON student_seat_assignments;
CREATE TRIGGER trg_flag_seat_risk
  BEFORE INSERT OR UPDATE ON student_seat_assignments
  FOR EACH ROW
  EXECUTE FUNCTION flag_student_seat_risk();

-- ============================================================
-- TRIGGER 2: Compute adjacent risk score (BEFORE)
-- Looks at existing neighbours and scores the risk of the
-- neighbourhood. Uses BEFORE so we set NEW directly without
-- needing to UPDATE the same table (which would cause recursion).
-- ============================================================
CREATE OR REPLACE FUNCTION compute_adjacent_risk()
RETURNS TRIGGER AS $$
DECLARE
  v_adjacent_risk integer := 0;
  v_neighbour     RECORD;
BEGIN
  -- Check the 8 adjacent cells for existing seated students
  -- On INSERT: new row is not in the table yet, so this is safe
  -- On UPDATE: the self-position is excluded by the position check
  FOR v_neighbour IN
    SELECT is_discipline_risk, is_low_performer
    FROM student_seat_assignments
    WHERE seat_map_id = NEW.seat_map_id
      AND is_active   = true
      AND (row_number != NEW.row_number OR col_number != NEW.col_number)
      AND ABS(row_number - NEW.row_number) <= 1
      AND ABS(col_number - NEW.col_number) <= 1
  LOOP
    IF v_neighbour.is_discipline_risk THEN
      v_adjacent_risk := v_adjacent_risk + 25;
    END IF;
    IF v_neighbour.is_low_performer THEN
      v_adjacent_risk := v_adjacent_risk + 10;
    END IF;
  END LOOP;

  NEW.adjacent_risk_score := LEAST(100, v_adjacent_risk);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_adjacent_risk ON student_seat_assignments;
CREATE TRIGGER trg_adjacent_risk
  BEFORE INSERT OR UPDATE ON student_seat_assignments
  FOR EACH ROW
  EXECUTE FUNCTION compute_adjacent_risk();

-- ============================================================
-- Weekly cron placeholder — run via Supabase SQL editor once
-- pg_cron and pg_net extensions are confirmed enabled:
--
-- SELECT cron.schedule(
--   'weekly-seating-intelligence',
--   '0 20 * * 0',
--   $$
--     SELECT net.http_post(
--       url     := current_setting('app.supabase_url') ||
--                  '/functions/v1/run-seating-analysis',
--       headers := jsonb_build_object(
--         'Authorization',
--         'Bearer ' || current_setting('app.service_role_key'),
--         'Content-Type', 'application/json'
--       ),
--       body    := '{}'::jsonb
--     )
--   $$
-- );
-- ============================================================
