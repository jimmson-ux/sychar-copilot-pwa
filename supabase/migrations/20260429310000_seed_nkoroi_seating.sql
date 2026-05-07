-- ============================================================
-- Seed initial seat maps for Nkoroi Senior Secondary School
-- Creates one classroom_seat_map per class-stream, then assigns
-- students alphabetically to seats front-to-back, left-to-right.
-- Nkoroi classes: Form 1–4 × East/West = 8 class-streams
-- ============================================================

-- Fix trigger: marks table on remote has NO school_id column.
-- Redefine both trigger functions defensively before seeding.
CREATE OR REPLACE FUNCTION flag_student_seat_risk()
RETURNS TRIGGER AS $$
DECLARE
  v_discipline_count integer := 0;
  v_avg_score        numeric;
  v_class_avg        numeric;
BEGIN
  BEGIN
    SELECT COUNT(*) INTO v_discipline_count
    FROM discipline_records
    WHERE student_id::text = NEW.student_id::text
      AND created_at > NOW() - INTERVAL '90 days';
  EXCEPTION WHEN OTHERS THEN
    v_discipline_count := 0;
  END;

  BEGIN
    SELECT AVG(percentage) INTO v_avg_score
    FROM marks
    WHERE student_id = NEW.student_id
      AND term::text    = NEW.term::text
      AND academic_year = NEW.academic_year;
  EXCEPTION WHEN OTHERS THEN
    v_avg_score := NULL;
  END;

  BEGIN
    SELECT AVG(m.percentage) INTO v_class_avg
    FROM marks m
    WHERE m.student_id IN (
      SELECT student_id
      FROM student_seat_assignments
      WHERE seat_map_id = NEW.seat_map_id AND is_active = true
    )
    AND m.term::text    = NEW.term::text
    AND m.academic_year = NEW.academic_year;
  EXCEPTION WHEN OTHERS THEN
    v_class_avg := NULL;
  END;

  NEW.is_discipline_risk := v_discipline_count >= 2;
  NEW.is_high_performer  := COALESCE(v_avg_score, 0)   >= COALESCE(v_class_avg, 50) + 15;
  NEW.is_low_performer   := COALESCE(v_avg_score, 100) <= COALESCE(v_class_avg, 50) - 15;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION compute_adjacent_risk()
RETURNS TRIGGER AS $$
DECLARE
  v_adjacent_risk integer := 0;
  v_neighbour     RECORD;
BEGIN
  FOR v_neighbour IN
    SELECT is_discipline_risk, is_low_performer
    FROM student_seat_assignments
    WHERE seat_map_id = NEW.seat_map_id
      AND is_active   = true
      AND (row_number != NEW.row_number OR col_number != NEW.col_number)
      AND ABS(row_number - NEW.row_number) <= 1
      AND ABS(col_number - NEW.col_number) <= 1
  LOOP
    IF v_neighbour.is_discipline_risk THEN v_adjacent_risk := v_adjacent_risk + 25; END IF;
    IF v_neighbour.is_low_performer   THEN v_adjacent_risk := v_adjacent_risk + 10; END IF;
  END LOOP;
  NEW.adjacent_risk_score := LEAST(100, v_adjacent_risk);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
DECLARE
  sch_id      uuid := '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid;
  v_term      integer;
  v_year      text;
  combos      text[][] := ARRAY[
    ARRAY['Form 1 East','East'], ARRAY['Form 1 West','West'],
    ARRAY['Form 2 East','East'], ARRAY['Form 2 West','West'],
    ARRAY['Form 3 East','East'], ARRAY['Form 3 West','West'],
    ARRAY['Form 4 East','East'], ARRAY['Form 4 West','West']
  ];
  combo       text[];
  teacher_id  uuid;
  map_id      uuid;
  v_row       integer;
  v_col       integer;
  stu         RECORD;
BEGIN
  -- Use tenant_configs current_term/year; fall back to 2 / '2025/2026'
  SELECT
    COALESCE(current_term, 2),
    COALESCE(current_year, '2025/2026')
  INTO v_term, v_year
  FROM tenant_configs
  WHERE school_id = sch_id
  LIMIT 1;

  IF v_term IS NULL THEN
    v_term := 2;
    v_year := '2025/2026';
  END IF;

  FOREACH combo SLICE 1 IN ARRAY combos LOOP

    -- Look up class teacher for this class
    SELECT id INTO teacher_id
    FROM staff_records
    WHERE school_id    = sch_id
      AND assigned_class = combo[1]
    LIMIT 1;

    -- Create or update the seat map (10 rows × 6 cols = 60 seats per class)
    INSERT INTO classroom_seat_maps (
      school_id, class_name, stream_name,
      rows, cols, term, academic_year,
      teacher_desk_position, is_active, created_by
    ) VALUES (
      sch_id, combo[1], combo[2],
      10, 6,
      v_term, v_year,
      'front', true, teacher_id
    )
    ON CONFLICT (school_id, class_name, stream_name, term, academic_year)
    DO UPDATE SET
      rows       = 10,
      cols       = 6,
      is_active  = true,
      updated_at = now()
    RETURNING id INTO map_id;

    -- Assign students alphabetically, front-to-back, left-to-right
    v_row := 1;
    v_col := 1;

    FOR stu IN
      SELECT id, full_name
      FROM students
      WHERE school_id::text = sch_id::text
        AND class_name      = combo[1]
      ORDER BY COALESCE(full_name, '') ASC
    LOOP
      INSERT INTO student_seat_assignments (
        school_id, seat_map_id, student_id,
        row_number, col_number,
        seat_label, placed_by, placement_note,
        term, academic_year, is_active
      ) VALUES (
        sch_id, map_id, stu.id,
        v_row, v_col,
        'R' || v_row || 'C' || v_col,
        teacher_id,
        'Initial seating — alphabetical order',
        v_term, v_year, true
      )
      ON CONFLICT (seat_map_id, student_id)
      DO UPDATE SET
        row_number     = EXCLUDED.row_number,
        col_number     = EXCLUDED.col_number,
        seat_label     = EXCLUDED.seat_label,
        placement_note = EXCLUDED.placement_note,
        updated_at     = now();

      -- Audit log entry for initial placement
      INSERT INTO seat_change_log (
        school_id, seat_map_id, student_id,
        from_row, from_col, to_row, to_col,
        reason_code, moved_by
      ) VALUES (
        sch_id, map_id, stu.id,
        NULL, NULL, v_row, v_col,
        'initial_placement', teacher_id
      );

      -- Advance seat position
      v_col := v_col + 1;
      IF v_col > 6 THEN
        v_col := 1;
        v_row := v_row + 1;
      END IF;
    END LOOP;

  END LOOP;
END $$;

-- ── Verification query ────────────────────────────────────────
SELECT
  csm.class_name,
  csm.stream_name,
  csm.rows,
  csm.cols,
  csm.total_seats,
  COUNT(ssa.id)                                               AS students_seated,
  COUNT(CASE WHEN ssa.is_discipline_risk  THEN 1 END)        AS risk_students,
  COUNT(CASE WHEN ssa.is_high_performer   THEN 1 END)        AS high_performers,
  COUNT(CASE WHEN ssa.is_low_performer    THEN 1 END)        AS low_performers,
  ROUND(AVG(ssa.adjacent_risk_score))                        AS avg_adj_risk
FROM classroom_seat_maps csm
LEFT JOIN student_seat_assignments ssa
  ON  ssa.seat_map_id = csm.id
  AND ssa.is_active   = true
WHERE csm.school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid
GROUP BY csm.class_name, csm.stream_name, csm.rows, csm.cols, csm.total_seats
ORDER BY csm.class_name, csm.stream_name;
