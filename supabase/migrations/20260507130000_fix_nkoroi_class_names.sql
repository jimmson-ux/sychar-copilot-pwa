-- ================================================================
-- FIX NKOROI CLASS NAMES
-- Source of truth: Grade 10 | Form 3 | Form 4
--                  Winners | Achievers | Victors | Champions
-- Removes all East/West/Form1/Form2 wrong values seeded earlier.
-- ================================================================

-- ── STUDENTS: fix class_name ─────────────────────────────────────
UPDATE students SET class_name = 'Grade 10'
WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND class_name IN ('Grade10','grade 10','grade10','Form 1','Form1','Form 1 East','Form 1 West');

UPDATE students SET class_name = 'Form 3'
WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND class_name IN ('Form3','form 3','form3','Form 2','Form2','Form 2 East','Form 2 West');

UPDATE students SET class_name = 'Form 4'
WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND class_name IN ('Form4','form 4','form4');

-- ── STUDENTS: fix stream_name ────────────────────────────────────
UPDATE students SET stream_name = 'Winners'
WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND stream_name IN ('East','east','A','Stream A');

UPDATE students SET stream_name = 'Achievers'
WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND stream_name IN ('West','west','B','Stream B');

UPDATE students SET stream_name = 'Victors'
WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND stream_name IN ('C','Stream C','South','south','Victors');

UPDATE students SET stream_name = 'Champions'
WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND stream_name IN ('D','Stream D','North','north');

-- ── STAFF: fix assigned_class ────────────────────────────────────
UPDATE staff_records SET assigned_class = 'Grade 10 Winners'
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid
  AND assigned_class IN ('Grade 10 East','Grade10 East','Form 1 East','Grade10 West','Grade 10 West');

UPDATE staff_records SET assigned_class = 'Grade 10 Achievers'
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid
  AND assigned_class IN ('Grade10 Achievers','Form 1 West');

UPDATE staff_records SET assigned_class = 'Form 3 Winners'
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid
  AND assigned_class IN ('Form 2 East','Form 3 East','Form3 Winners','Form 2 Winners');

UPDATE staff_records SET assigned_class = 'Form 3 Achievers'
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid
  AND assigned_class IN ('Form 2 West','Form 3 West','Form3 Achievers','Form 2 Achievers');

UPDATE staff_records SET assigned_class = 'Form 3 Victors'
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid
  AND assigned_class IN ('Form3 Victors','Form 2 Victors');

UPDATE staff_records SET assigned_class = 'Form 3 Champions'
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid
  AND assigned_class IN ('Form3 Champions','Form 2 Champions');

UPDATE staff_records SET assigned_class = 'Form 4 Winners'
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid
  AND assigned_class IN ('Form4 Winners','Form 4 East');

UPDATE staff_records SET assigned_class = 'Form 4 Achievers'
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid
  AND assigned_class IN ('Form4 Achievers','Form 4 West');

UPDATE staff_records SET assigned_class = 'Form 4 Victors'
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid
  AND assigned_class IN ('Form4 Victors');

UPDATE staff_records SET assigned_class = 'Form 4 Champions'
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid
  AND assigned_class IN ('Form4 Champions');

-- ── TIMETABLE ────────────────────────────────────────────────────
UPDATE timetable SET class_name = 'Grade 10'
WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND class_name IN ('Form 1','Form1','Grade10','grade 10');

UPDATE timetable SET class_name = 'Form 3'
WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND class_name IN ('Form 2','Form2','Form3');

UPDATE timetable SET stream_name = 'Winners'
WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND stream_name IN ('East','east','A');

UPDATE timetable SET stream_name = 'Achievers'
WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND stream_name IN ('West','west','B');

UPDATE timetable SET stream_name = 'Victors'
WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND stream_name IN ('South','south','C');

UPDATE timetable SET stream_name = 'Champions'
WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND stream_name IN ('North','north','D');

-- ── ATTENDANCE ───────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='attendance' AND column_name='class_name') THEN

    UPDATE attendance SET class_name = 'Grade 10'
    WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
      AND class_name IN ('Form 1','Form1');

    UPDATE attendance SET class_name = 'Form 3'
    WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
      AND class_name IN ('Form 2','Form2');

    UPDATE attendance SET stream_name = 'Winners'
    WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
      AND stream_name IN ('East','east','A');

    UPDATE attendance SET stream_name = 'Achievers'
    WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
      AND stream_name IN ('West','west','B');

    UPDATE attendance SET stream_name = 'Victors'
    WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
      AND stream_name IN ('South','south','C');

    UPDATE attendance SET stream_name = 'Champions'
    WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
      AND stream_name IN ('North','north','D');
  END IF;
END $$;

-- ── MARKS ────────────────────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='marks' AND column_name='class_name') THEN

    UPDATE marks SET class_name = 'Grade 10'
    WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
      AND class_name IN ('Form 1','Form1');

    UPDATE marks SET class_name = 'Form 3'
    WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
      AND class_name IN ('Form 2','Form2');

    UPDATE marks SET stream_name = 'Winners'
    WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
      AND stream_name IN ('East','east','A');

    UPDATE marks SET stream_name = 'Achievers'
    WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
      AND stream_name IN ('West','west','B');

    UPDATE marks SET stream_name = 'Victors'
    WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
      AND stream_name IN ('South','south','C');

    UPDATE marks SET stream_name = 'Champions'
    WHERE school_id::text = '68bd8d34-f2f0-4297-bd18-093328824d84'
      AND stream_name IN ('North','north','D');
  END IF;
END $$;

-- ── SEAT MAPS: delete wrong, reseed correct ──────────────────────
DELETE FROM seating_intelligence
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid;

DELETE FROM principal_seating_summary
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid;

DELETE FROM student_seat_assignments
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid;

DELETE FROM seat_change_log
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid;

DELETE FROM classroom_seat_maps
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid;

-- Reseed 12 correct seat maps
DO $$
DECLARE
  sch_id     uuid := '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid;
  v_term     integer;
  v_year     text;
  combos     text[][] := ARRAY[
    ARRAY['Grade 10','Winners'],   ARRAY['Grade 10','Achievers'],
    ARRAY['Grade 10','Victors'],   ARRAY['Grade 10','Champions'],
    ARRAY['Form 3',  'Winners'],   ARRAY['Form 3',  'Achievers'],
    ARRAY['Form 3',  'Victors'],   ARRAY['Form 3',  'Champions'],
    ARRAY['Form 4',  'Winners'],   ARRAY['Form 4',  'Achievers'],
    ARRAY['Form 4',  'Victors'],   ARRAY['Form 4',  'Champions']
  ];
  combo      text[];
  teacher_id uuid;
  map_id     uuid;
  v_row      integer;
  v_col      integer;
  stu        RECORD;
  stu_count  integer;
BEGIN
  SELECT COALESCE(current_term,2), COALESCE(current_year,'2025/2026')
  INTO v_term, v_year
  FROM tenant_configs WHERE school_id = sch_id LIMIT 1;

  IF v_term IS NULL THEN v_term := 2; v_year := '2025/2026'; END IF;

  FOREACH combo SLICE 1 IN ARRAY combos LOOP
    SELECT id INTO teacher_id
    FROM staff_records
    WHERE school_id = sch_id
      AND assigned_class = combo[1] || ' ' || combo[2]
    LIMIT 1;

    SELECT COUNT(*) INTO stu_count
    FROM students
    WHERE school_id::text = sch_id::text
      AND class_name  = combo[1]
      AND stream_name = combo[2]
      AND is_active   = true;

    IF stu_count = 0 THEN
      RAISE NOTICE 'SKIP: % % has 0 students', combo[1], combo[2];
      CONTINUE;
    END IF;

    INSERT INTO classroom_seat_maps (
      school_id, class_name, stream_name, rows, cols,
      term, academic_year, teacher_desk_position, is_active, created_by
    ) VALUES (
      sch_id, combo[1], combo[2], 10, 6,
      v_term, v_year, 'front', true, teacher_id
    )
    ON CONFLICT (school_id, class_name, stream_name, term, academic_year)
    DO UPDATE SET rows=10, cols=6, updated_at=now()
    RETURNING id INTO map_id;

    RAISE NOTICE 'Seat map: % % — % students', combo[1], combo[2], stu_count;

    v_row := 1; v_col := 1;
    FOR stu IN
      SELECT id FROM students
      WHERE school_id::text = sch_id::text
        AND class_name  = combo[1]
        AND stream_name = combo[2]
        AND is_active   = true
      ORDER BY COALESCE(full_name,'')
    LOOP
      INSERT INTO student_seat_assignments (
        school_id, seat_map_id, student_id,
        row_number, col_number, seat_label,
        placed_by, placement_note, term, academic_year, is_active
      ) VALUES (
        sch_id, map_id, stu.id,
        v_row, v_col, 'R'||v_row||'C'||v_col,
        teacher_id, 'Initial — alphabetical', v_term, v_year, true
      )
      ON CONFLICT (seat_map_id, student_id)
      DO UPDATE SET row_number=EXCLUDED.row_number,
                    col_number=EXCLUDED.col_number,
                    seat_label=EXCLUDED.seat_label,
                    updated_at=now();

      INSERT INTO seat_change_log (
        school_id, seat_map_id, student_id,
        from_row, from_col, to_row, to_col, reason_code, moved_by
      ) VALUES (
        sch_id, map_id, stu.id,
        NULL, NULL, v_row, v_col, 'initial_placement', teacher_id
      );

      v_col := v_col + 1;
      IF v_col > 6 THEN v_col := 1; v_row := v_row + 1; END IF;
    END LOOP;
  END LOOP;
END $$;

-- ── TENANT CONFIG ────────────────────────────────────────────────
UPDATE tenant_configs SET
  levels  = ARRAY['Grade 10','Form 3','Form 4'],
  streams = ARRAY['Winners','Achievers','Victors','Champions']
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid;

-- ── VERIFICATION ─────────────────────────────────────────────────
SELECT csm.class_name, csm.stream_name,
       COUNT(ssa.id) AS students_seated,
       sr.full_name  AS class_teacher
FROM classroom_seat_maps csm
LEFT JOIN student_seat_assignments ssa
  ON ssa.seat_map_id = csm.id AND ssa.is_active = true
LEFT JOIN staff_records sr
  ON sr.assigned_class = csm.class_name || ' ' || csm.stream_name
  AND sr.school_id = csm.school_id
WHERE csm.school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid
GROUP BY csm.class_name, csm.stream_name, sr.full_name
ORDER BY csm.class_name, csm.stream_name;
