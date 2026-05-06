-- ============================================================
-- Fix Nkoroi class data gaps:
--   1. Populate students.class_name from classes.name (via class_id FK)
--   2. Populate students.admission_number from admission_no where null
--   3. Populate staff_records.assigned_class for class teachers from timetable
-- ============================================================

-- 1. Set students.class_name from the classes table (for any school)
UPDATE public.students s
SET    class_name = c.name
FROM   public.classes c
WHERE  s.class_id  = c.id
  AND  (s.class_name IS NULL OR s.class_name = '');

-- 2. Fallback: derive class_name from form + stream where class_id join didn't resolve
UPDATE public.students
SET    class_name = 'Form ' || form || ' ' || INITCAP(COALESCE(stream, 'A'))
WHERE  (class_name IS NULL OR class_name = '')
  AND  form IS NOT NULL;

-- 3. Ensure admission_number column exists, then copy from admission_no if empty
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS admission_number text;

UPDATE public.students
SET    admission_number = admission_no
WHERE  (admission_number IS NULL OR admission_number = '')
  AND  admission_no IS NOT NULL
  AND  admission_no <> '';

-- 4. Ensure timetable.class_name column exists, then populate from class_id FK
ALTER TABLE public.timetable ADD COLUMN IF NOT EXISTS class_name text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'timetable' AND column_name = 'class_id'
  ) THEN
    UPDATE public.timetable t
    SET    class_name = c.name
    FROM   public.classes c
    WHERE  t.class_id = c.id
      AND  (t.class_name IS NULL OR t.class_name = '');
  END IF;
END $$;

-- 5. Populate assigned_class for class teachers from timetable
UPDATE public.staff_records sr
SET    assigned_class = (
  SELECT   class_name
  FROM     public.timetable
  WHERE    teacher_id = sr.id
    AND    school_id  = sr.school_id
    AND    is_active  = true
    AND    class_name IS NOT NULL
  GROUP BY class_name
  ORDER BY COUNT(*) DESC
  LIMIT 1
)
WHERE  sr.sub_role IN ('class_teacher', 'bom_teacher')
  AND  (sr.assigned_class IS NULL OR sr.assigned_class = '');

-- 6. If timetable has no entries, try lesson_sessions (teacher_id is TEXT there)
UPDATE public.staff_records sr
SET    assigned_class = (
  SELECT   class_name
  FROM     public.lesson_sessions
  WHERE    teacher_id = sr.id::text
    AND    school_id  = sr.school_id
    AND    class_name IS NOT NULL
  GROUP BY class_name
  ORDER BY COUNT(*) DESC
  LIMIT 1
)
WHERE  sr.sub_role IN ('class_teacher', 'bom_teacher')
  AND  (sr.assigned_class IS NULL OR sr.assigned_class = '');
