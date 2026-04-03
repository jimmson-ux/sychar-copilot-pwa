-- ============================================================
-- PART 1 — DEPARTMENT CODES
-- ============================================================

CREATE TABLE IF NOT EXISTS department_codes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id uuid NOT NULL,
  department text NOT NULL,
  code text NOT NULL,
  subjects text[] NOT NULL,
  color_primary text NOT NULL,
  color_secondary text NOT NULL,
  is_active boolean DEFAULT true,
  created_by uuid,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(school_id, code)
);

INSERT INTO department_codes
  (school_id, department, code, subjects, color_primary, color_secondary)
VALUES
  ('68bd8d34-f2f0-4297-bd18-093328824d84', 'Sciences', '05S',
   ARRAY['Biology','Chemistry','Physics','Agriculture'], '#09D1C7', '#80EE98'),
  ('68bd8d34-f2f0-4297-bd18-093328824d84', 'Mathematics', '05M',
   ARRAY['Mathematics','Additional Mathematics'], '#2176FF', '#33A1FD'),
  ('68bd8d34-f2f0-4297-bd18-093328824d84', 'Languages', '05L',
   ARRAY['English','Kiswahili','French','German','Arabic'], '#DC586D', '#FFBB94'),
  ('68bd8d34-f2f0-4297-bd18-093328824d84', 'Humanities', '05H',
   ARRAY['History','Geography','CRE','IRE','Business Studies','Economics'], '#FDCA40', '#F79824'),
  ('68bd8d34-f2f0-4297-bd18-093328824d84', 'Applied Sciences', '05A',
   ARRAY['Computer Studies','Home Science','Technical Drawing','Aviation'], '#B51A2B', '#FFA586'),
  ('68bd8d34-f2f0-4297-bd18-093328824d84', 'Games & Sports', '05G',
   ARRAY['Physical Education','Games'], '#852E4E', '#DC586D'),
  ('68bd8d34-f2f0-4297-bd18-093328824d84', 'Guidance & Counselling', '05C',
   ARRAY['Guidance','Counselling'], '#0C6478', '#46DFB1')
ON CONFLICT (school_id, code) DO NOTHING;

-- ============================================================
-- PART 1 — SCHOOL SETTINGS: wellness flags
-- ============================================================

ALTER TABLE school_settings
  ADD COLUMN IF NOT EXISTS share_wellness_nudges_with_parents boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS welfare_visible_to_dean_students   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS welfare_visible_to_gerald          boolean DEFAULT false;

-- ============================================================
-- WELFARE LOGS (counsellor session records)
-- ============================================================

CREATE TABLE IF NOT EXISTS welfare_logs (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id       uuid NOT NULL,
  student_id      uuid NOT NULL REFERENCES students(id),
  counsellor_id   uuid NOT NULL,
  session_date    date NOT NULL DEFAULT CURRENT_DATE,
  wis_score       integer CHECK (wis_score BETWEEN 1 AND 5),
  kbi_tags        text[],
  raw_notes       text,
  follow_up_date  date,
  is_confidential boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE welfare_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_welfare_logs_student ON welfare_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_welfare_logs_school  ON welfare_logs(school_id);

-- ============================================================
-- PART 1 — PRINCIPAL FLAGS
-- ============================================================

CREATE TABLE IF NOT EXISTS principal_flags (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id           uuid NOT NULL,
  student_id          uuid NOT NULL REFERENCES students(id),
  flagged_by          uuid NOT NULL,
  flag_reason         text NOT NULL,
  urgency             text DEFAULT 'medium'
    CHECK (urgency IN ('low','medium','high','critical')),
  welfare_log_id      uuid REFERENCES welfare_logs(id),
  status              text DEFAULT 'open'
    CHECK (status IN ('open','acknowledged','meeting_scheduled','resolved')),
  counsellor_response text,
  meeting_date        timestamptz,
  resolved_at         timestamptz,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE principal_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flags_principal_counsellor" ON principal_flags;
CREATE POLICY "flags_principal_counsellor" ON principal_flags
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM staff_records
      WHERE user_id = auth.uid()::text
        AND sub_role IN ('principal','guidance_counselling')
        AND school_id = principal_flags.school_id
    )
  );

-- ============================================================
-- PART 4 — RLS FOR WELFARE PRIVACY
-- ============================================================

-- Principal: full read access
DROP POLICY IF EXISTS "principal_welfare_access" ON welfare_logs;
CREATE POLICY "principal_welfare_access" ON welfare_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM staff_records
      WHERE user_id = auth.uid()::text
        AND sub_role = 'principal'
        AND school_id = welfare_logs.school_id
    )
  );

-- Counsellor: own records only (ALL operations)
DROP POLICY IF EXISTS "counsellor_own_records" ON welfare_logs;
CREATE POLICY "counsellor_own_records" ON welfare_logs
  FOR ALL USING (
    counsellor_id::text = auth.uid()::text
  );

-- Deputy discipline (Gerald): only when principal has flagged the student
DROP POLICY IF EXISTS "gerald_flagged_only" ON welfare_logs;
CREATE POLICY "gerald_flagged_only" ON welfare_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM staff_records sr
      JOIN principal_flags pf ON pf.student_id = welfare_logs.student_id
      WHERE sr.user_id = auth.uid()::text
        AND sr.sub_role = 'deputy_principal_discipline'
        AND pf.status != 'open'
    )
  );

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_dept_codes_school ON department_codes(school_id);
CREATE INDEX IF NOT EXISTS idx_principal_flags_school ON principal_flags(school_id);
CREATE INDEX IF NOT EXISTS idx_principal_flags_student ON principal_flags(student_id);
CREATE INDEX IF NOT EXISTS idx_principal_flags_status ON principal_flags(status);
