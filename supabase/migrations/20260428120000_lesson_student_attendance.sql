-- ============================================================
-- Lesson-level Student Attendance — subject teacher view
-- Separate from school-level attendance_records
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lesson_student_attendance (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id           uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  lesson_session_id   uuid REFERENCES public.lesson_sessions(id) ON DELETE SET NULL,
  timetable_slot_id   uuid,
  lesson_date         date NOT NULL,
  student_id          uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_name        text,
  admission_no        text,
  teacher_id          text,                        -- matches lesson_sessions.teacher_id (TEXT)
  class_name          text NOT NULL,
  stream_name         text,
  subject_name        text NOT NULL,
  status              text NOT NULL DEFAULT 'present'
                      CHECK (status IN ('present','absent','late','excused','suspended')),
  engagement_level    text DEFAULT 'normal'
                      CHECK (engagement_level IN ('excellent','good','normal','distracted','disruptive')),
  teacher_note        text,
  submitted_at        timestamptz DEFAULT now(),
  is_override         boolean DEFAULT false,
  override_by         uuid REFERENCES public.staff_records(id),
  created_at          timestamptz DEFAULT now(),
  UNIQUE(lesson_session_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_lsa_school_date
  ON public.lesson_student_attendance(school_id, lesson_date);
CREATE INDEX IF NOT EXISTS idx_lsa_student
  ON public.lesson_student_attendance(student_id, lesson_date);
CREATE INDEX IF NOT EXISTS idx_lsa_session
  ON public.lesson_student_attendance(lesson_session_id);
CREATE INDEX IF NOT EXISTS idx_lsa_teacher
  ON public.lesson_student_attendance(teacher_id, lesson_date);

ALTER TABLE public.lesson_student_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lsa_teacher_own"  ON public.lesson_student_attendance;
DROP POLICY IF EXISTS "lsa_school_admin" ON public.lesson_student_attendance;
DROP POLICY IF EXISTS "lsa_service"      ON public.lesson_student_attendance;

-- Teachers see rows they submitted; HOD/principal/dean see all for the school
CREATE POLICY "lsa_teacher_own" ON public.lesson_student_attendance
  FOR ALL TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND (
      teacher_id = (
        SELECT user_id FROM public.staff_records
        WHERE user_id   = auth.uid()::text
          AND school_id = public.get_my_school_id()
        LIMIT 1
      )
      OR EXISTS (
        SELECT 1 FROM public.staff_records
        WHERE user_id   = auth.uid()::text
          AND school_id = public.get_my_school_id()
          AND sub_role  IN ('principal','deputy_principal','hod','dean_of_studies')
        LIMIT 1
      )
    )
  );

CREATE POLICY "lsa_service" ON public.lesson_student_attendance
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Lesson truancy trigger ────────────────────────────────────────────────────
-- If a student is marked absent from a lesson but was recorded present
-- in school that day (attendance_records), auto-create a discipline record.
-- Note: attendance_records.student_id is TEXT — cast uuid for the join.

CREATE OR REPLACE FUNCTION public.flag_lesson_absence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status != 'absent' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.attendance_records ar
    WHERE ar.school_id  = NEW.school_id
      AND ar.student_id = NEW.student_id::text
      AND ar.date       = NEW.lesson_date
      AND ar.status     = 'present'
    LIMIT 1
  ) THEN
    INSERT INTO public.discipline_records (
      school_id, student_id, student_name, admission_number,
      class_name, teacher_id, offence, notes, letter_date
    ) VALUES (
      NEW.school_id,
      NEW.student_id,
      COALESCE(NEW.student_name, ''),
      COALESCE(NEW.admission_no, ''),
      NEW.class_name,
      COALESCE(NEW.teacher_id, ''),
      'Lesson Truancy',
      'Absent from ' || NEW.subject_name || ' on ' ||
        to_char(NEW.lesson_date, 'DD Mon YYYY') ||
        CASE WHEN NEW.teacher_note IS NOT NULL
          THEN ' — Teacher note: ' || NEW.teacher_note
          ELSE ''
        END,
      NEW.lesson_date
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flag_lesson_absence ON public.lesson_student_attendance;
CREATE TRIGGER trg_flag_lesson_absence
  AFTER INSERT ON public.lesson_student_attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.flag_lesson_absence();

-- ── Realtime ──────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname  = 'supabase_realtime'
      AND tablename = 'lesson_student_attendance'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lesson_student_attendance;
  END IF;
END $$;
