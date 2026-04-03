-- ============================================================
-- TEACHER PORTAL MIGRATION
-- ============================================================

-- curriculum type on records of work
ALTER TABLE records_of_work
  ADD COLUMN IF NOT EXISTS curriculum_type text DEFAULT '844'
    CHECK (curriculum_type IN ('844', 'CBC'));

-- AI teaching guide columns on subject_performance
ALTER TABLE subject_performance
  ADD COLUMN IF NOT EXISTS ai_teaching_guide jsonb,
  ADD COLUMN IF NOT EXISTS guide_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS guide_shared_with_hod boolean DEFAULT false;

-- teacher token enhancements
ALTER TABLE teacher_tokens
  ADD COLUMN IF NOT EXISTS form_levels text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS sent_via text DEFAULT 'whatsapp'
    CHECK (sent_via IN ('whatsapp', 'qr', 'manual'));

-- school settings table
CREATE TABLE IF NOT EXISTS school_settings (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id      uuid NOT NULL UNIQUE,
  term_1_start   date DEFAULT '2026-01-06',
  term_2_start   date DEFAULT '2026-05-04',
  term_3_start   date DEFAULT '2026-09-07',
  current_term   integer DEFAULT 1,
  current_academic_year text DEFAULT '2026',
  school_name    text,
  principal_phone text,
  whatsapp_enabled boolean DEFAULT true,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

ALTER TABLE school_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "settings_read" ON school_settings;
CREATE POLICY "settings_read"
  ON school_settings FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

INSERT INTO school_settings (school_id, school_name, current_term, current_academic_year)
VALUES ('68bd8d34-f2f0-4297-bd18-093328824d84', 'Nkoroi Mixed Day Secondary School', 1, '2026')
ON CONFLICT (school_id) DO NOTHING;

-- hod_notifications table for "Share with HOD"
CREATE TABLE IF NOT EXISTS hod_notifications (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id    uuid NOT NULL,
  from_user_id uuid,
  to_role      text DEFAULT 'hod',
  type         text NOT NULL,
  title        text NOT NULL,
  body         text,
  payload      jsonb,
  is_read      boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE hod_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notif_read" ON hod_notifications;
CREATE POLICY "notif_read"
  ON hod_notifications FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- classroom_qr_codes: add QR generation columns
ALTER TABLE classroom_qr_codes
  ADD COLUMN IF NOT EXISTS qr_type    text DEFAULT 'classroom'
    CHECK (qr_type IN ('duty', 'classroom')),
  ADD COLUMN IF NOT EXISTS label      text,
  ADD COLUMN IF NOT EXISTS slug       text,
  ADD COLUMN IF NOT EXISTS url        text,
  ADD COLUMN IF NOT EXISTS qr_data_url text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Unique constraint for upsert in qr/generate
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'classroom_qr_codes_school_type_label_key'
  ) THEN
    ALTER TABLE classroom_qr_codes
      ADD CONSTRAINT classroom_qr_codes_school_type_label_key
      UNIQUE (school_id, qr_type, label);
  END IF;
END $$;

-- schemes_of_work_new: add upsert unique constraint + updated_at
ALTER TABLE schemes_of_work_new
  ADD COLUMN IF NOT EXISTS curriculum_type text DEFAULT '844'
    CHECK (curriculum_type IN ('844', 'CBC')),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'schemes_of_work_new_unique_key'
  ) THEN
    ALTER TABLE schemes_of_work_new
      ADD CONSTRAINT schemes_of_work_new_unique_key
      UNIQUE (school_id, teacher_id, class_name, subject_name, term, academic_year);
  END IF;
END $$;

-- scheme_entries: weekly rows for a scheme
CREATE TABLE IF NOT EXISTS scheme_entries (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  scheme_id   uuid NOT NULL REFERENCES schemes_of_work_new(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  topic       text NOT NULL,
  sub_topic   text,
  objectives  text,
  activities  text,
  resources   text,
  assessment  text,
  remarks     text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheme_entries_scheme ON scheme_entries(scheme_id);
