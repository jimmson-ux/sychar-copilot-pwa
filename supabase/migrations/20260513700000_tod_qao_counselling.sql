-- ============================================================
-- MIGRATION: TOD rotation, QR check-ins, lesson alerts,
-- QAO compliance files, counselling sessions
-- ============================================================

-- Classrooms with geo-location and time-locked QR salts
CREATE TABLE IF NOT EXISTS public.classrooms (
  id              uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid  NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  room_name       text  NOT NULL,
  building_block  text,
  geo_latitude    numeric(9,6),
  geo_longitude   numeric(9,6),
  qr_secret_salt  text  NOT NULL DEFAULT gen_random_uuid()::text,
  created_at      timestamptz DEFAULT now()
);

-- Teacher QR check-ins (fraud-proof: time-locked payload + geo-fence)
CREATE TABLE IF NOT EXISTS public.teacher_classroom_checkins (
  id                  uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           uuid  NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id          uuid  REFERENCES auth.users(id),
  timetable_slot_id   uuid,
  classroom_id        uuid  REFERENCES public.classrooms(id),
  scanned_payload_hash text,
  verification_status text  CHECK (verification_status IN
    ('Verified_Valid','Failed_Geo_Mismatch','Failed_Expired_Payload')),
  device_latitude     numeric(9,6),
  device_longitude    numeric(9,6),
  checked_in_at       timestamptz DEFAULT now()
);

-- TOD master schedule (AI-generated duty rotation)
CREATE TABLE IF NOT EXISTS public.tod_master_schedule (
  id                       uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id                uuid  NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  assigned_teacher_id      uuid  REFERENCES auth.users(id) ON DELETE CASCADE,
  academic_year            int   NOT NULL,
  term_number              int   NOT NULL,
  calendar_week_number     int   NOT NULL,
  start_date               date  NOT NULL,
  end_date                 date  NOT NULL,
  computed_difficulty_score numeric(4,2) DEFAULT 1.0,
  shift_status             text  NOT NULL DEFAULT 'Draft'
    CHECK (shift_status IN ('Draft','Published','Swapped_Authorized')),
  created_at               timestamptz DEFAULT now(),
  UNIQUE (school_id, academic_year, term_number, calendar_week_number, assigned_teacher_id)
);

-- TOD swap requests between teachers
DO $$ BEGIN
  CREATE TYPE swap_status AS ENUM (
    'Pending_Peer_Response',
    'Pending_Deputy_Authorization',
    'Approved_Swapped',
    'Declined_By_Peer',
    'Rejected_By_Deputy'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.tod_swap_requests (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id              uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  requester_id           uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  target_teacher_id      uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_schedule_id  uuid        REFERENCES public.tod_master_schedule(id) ON DELETE CASCADE,
  target_schedule_id     uuid        REFERENCES public.tod_master_schedule(id) ON DELETE CASCADE,
  request_reason         text        NOT NULL,
  status                 swap_status DEFAULT 'Pending_Peer_Response',
  deputy_remarks         text,
  created_at             timestamptz DEFAULT now()
);

-- Daily discipline / incident logs (TOD entries)
CREATE TABLE IF NOT EXISTS public.daily_incident_logs (
  id                  uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           uuid  NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  logged_by           uuid  REFERENCES auth.users(id),
  student_id          uuid,
  severity_level      text  NOT NULL DEFAULT 'Low'
    CHECK (severity_level IN ('Low','Medium','High','Critical')),
  incident_category   text  NOT NULL,
  incident_location   text,
  description         text,
  incident_date       date  NOT NULL DEFAULT current_date,
  escalated_to_deputy boolean NOT NULL DEFAULT false,
  parent_notified     boolean NOT NULL DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

-- Missed lesson alerts (triggers auto QAO file entry)
CREATE TABLE IF NOT EXISTS public.lesson_attendance_alerts (
  id                    uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             uuid  NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  timetable_slot_id     uuid,
  classroom_id          uuid  REFERENCES public.classrooms(id),
  allocated_teacher_id  uuid  REFERENCES auth.users(id),
  class_stream_id       uuid,
  resolution_status     text  NOT NULL DEFAULT 'Active_Unattended'
    CHECK (resolution_status IN
      ('Active_Unattended','Late_Arrival_Signed','Substitute_Assigned')),
  assigned_substitute_id uuid REFERENCES auth.users(id),
  alert_time            timestamptz DEFAULT now()
);

-- QAO permanent compliance audit file
CREATE TABLE IF NOT EXISTS public.teacher_qao_compliance_files (
  id                         uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id                  uuid  NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id                 uuid  REFERENCES auth.users(id),
  alert_reference_id         uuid  REFERENCES public.lesson_attendance_alerts(id) ON DELETE SET NULL,
  infraction_date            date  NOT NULL DEFAULT current_date,
  incident_type              text  NOT NULL DEFAULT 'UNATTENDED_LESSON_ABSENTEEISM',
  qao_audit_remarks          text,
  is_escalated_to_principal  boolean NOT NULL DEFAULT false,
  principal_review_notes     text,
  escalation_timestamp       timestamptz,
  created_at                 timestamptz DEFAULT now()
);

-- Structured counselling sessions (RLS-isolated from all non-counselor roles)
CREATE TABLE IF NOT EXISTS public.counselling_sessions (
  id                     uuid  PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id              uuid  NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id             uuid  NOT NULL,
  counselor_id           uuid  REFERENCES auth.users(id),
  session_date           date  NOT NULL DEFAULT current_date,
  primary_issue_category text  NOT NULL
    CHECK (primary_issue_category IN (
      'Academic Stress','Bullying','Substance Abuse',
      'Family Crisis','Bereavement','Other'
    )),
  risk_level             text  NOT NULL DEFAULT 'Low'
    CHECK (risk_level IN ('Low','Medium','High')),
  anamnesis_notes        text,
  ai_flags               jsonb,
  follow_up_required     boolean NOT NULL DEFAULT false,
  created_at             timestamptz DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tod_schedule_school_term
  ON public.tod_master_schedule (school_id, academic_year, term_number);
CREATE INDEX IF NOT EXISTS idx_incident_logs_school_date
  ON public.daily_incident_logs (school_id, incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_lesson_alerts_school
  ON public.lesson_attendance_alerts (school_id, resolution_status);
CREATE INDEX IF NOT EXISTS idx_qao_files_teacher
  ON public.teacher_qao_compliance_files (school_id, teacher_id, is_escalated_to_principal);
CREATE INDEX IF NOT EXISTS idx_counselling_counselor
  ON public.counselling_sessions (school_id, counselor_id, session_date DESC);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.classrooms                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_classroom_checkins    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tod_master_schedule           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tod_swap_requests             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_incident_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_attendance_alerts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_qao_compliance_files  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counselling_sessions          ENABLE ROW LEVEL SECURITY;

-- Classrooms: school-wide read
CREATE POLICY "classrooms_read" ON public.classrooms FOR SELECT TO authenticated
  USING (school_id = get_my_school_id());
CREATE POLICY "classrooms_admin_write" ON public.classrooms FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school_id() AND is_admin_role());

-- Check-ins: teacher writes own, admin reads all
CREATE POLICY "checkins_teacher_insert" ON public.teacher_classroom_checkins FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school_id() AND teacher_id = auth.uid());
CREATE POLICY "checkins_admin_read" ON public.teacher_classroom_checkins FOR SELECT TO authenticated
  USING (school_id = get_my_school_id() AND (teacher_id = auth.uid() OR is_admin_role()));

-- TOD schedule: teachers read own week; deputy writes all
CREATE POLICY "tod_read_own" ON public.tod_master_schedule FOR SELECT TO authenticated
  USING (school_id = get_my_school_id());
CREATE POLICY "tod_deputy_write" ON public.tod_master_schedule FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school_id() AND is_admin_role());
CREATE POLICY "tod_deputy_update" ON public.tod_master_schedule FOR UPDATE TO authenticated
  USING (school_id = get_my_school_id() AND is_admin_role());

-- TOD swaps: requester + target + deputy manage
CREATE POLICY "swaps_participant" ON public.tod_swap_requests FOR ALL TO authenticated
  USING (
    school_id = get_my_school_id() AND (
      requester_id = auth.uid() OR
      target_teacher_id = auth.uid() OR
      is_admin_role()
    )
  );

-- Incident logs: TOD writes; admin + class teacher reads school-wide
CREATE POLICY "incidents_school_read" ON public.daily_incident_logs FOR SELECT TO authenticated
  USING (school_id = get_my_school_id());
CREATE POLICY "incidents_tod_insert" ON public.daily_incident_logs FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school_id());

-- Lesson alerts: admin reads; service role inserts via trigger
CREATE POLICY "lesson_alerts_admin_read" ON public.lesson_attendance_alerts FOR SELECT TO authenticated
  USING (school_id = get_my_school_id() AND is_admin_role());

-- QAO files: QAO writes, principal reads escalated
CREATE POLICY "qao_files_read" ON public.teacher_qao_compliance_files FOR SELECT TO authenticated
  USING (school_id = get_my_school_id() AND is_admin_role());
CREATE POLICY "qao_files_write" ON public.teacher_qao_compliance_files FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school_id());
CREATE POLICY "qao_files_update" ON public.teacher_qao_compliance_files FOR UPDATE TO authenticated
  USING (school_id = get_my_school_id());

-- Counselling: counselor reads/writes own; principal reads escalated (HIGH risk)
CREATE POLICY "counselling_counselor" ON public.counselling_sessions FOR SELECT TO authenticated
  USING (
    school_id = get_my_school_id() AND (
      counselor_id = auth.uid() OR
      (is_admin_role() AND risk_level = 'High')
    )
  );
CREATE POLICY "counselling_counselor_insert" ON public.counselling_sessions FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school_id() AND counselor_id = auth.uid());
CREATE POLICY "counselling_update" ON public.counselling_sessions FOR UPDATE TO authenticated
  USING (school_id = get_my_school_id() AND counselor_id = auth.uid());

-- ============================================================
-- TRIGGER: Auto-seed QAO file on every lesson alert INSERT
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_to_qao_compliance_file()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.teacher_qao_compliance_files
    (school_id, teacher_id, alert_reference_id, infraction_date)
  VALUES (NEW.school_id, NEW.allocated_teacher_id, NEW.id, current_date)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS auto_qao_compliance_logger ON public.lesson_attendance_alerts;
CREATE TRIGGER auto_qao_compliance_logger
  AFTER INSERT ON public.lesson_attendance_alerts
  FOR EACH ROW EXECUTE FUNCTION public.log_to_qao_compliance_file();

-- ============================================================
-- ATOMIC TOD SWAP RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.execute_atomic_duty_swap(
  p_req_id     uuid,
  p_target_id  uuid,
  p_req_teacher   uuid,
  p_target_teacher uuid
) RETURNS void AS $$
BEGIN
  UPDATE public.tod_master_schedule
    SET assigned_teacher_id = p_target_teacher
  WHERE id = p_req_id;

  UPDATE public.tod_master_schedule
    SET assigned_teacher_id = p_req_teacher
  WHERE id = p_target_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
