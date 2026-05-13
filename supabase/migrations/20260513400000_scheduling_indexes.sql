-- Performance indexes for AI scheduling queries
-- All tables already exist; this migration only adds indexes.

-- Duty fairness: count duties per teacher in last N days
CREATE INDEX IF NOT EXISTS idx_duty_roster_teacher_date
  ON public.duty_roster (school_id, teacher_id, duty_date);

-- Invigilation fairness: count invigilation load per teacher
CREATE INDEX IF NOT EXISTS idx_invig_teacher_school
  ON public.invigilation_chart (school_id, invigilator_id);

-- Teacher subject lookups for timetable and invigilation scheduling
CREATE INDEX IF NOT EXISTS idx_tsa_school_active
  ON public.teacher_subject_assignments (school_id, is_active, subject_name);
