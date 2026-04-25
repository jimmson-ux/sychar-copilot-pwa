-- Phase 7 — talent_points, alumni, kcse_predictions, ai_career_reports, magazine_content
-- All fully idempotent: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS

-- ── talent_points ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.talent_points (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  category    text NOT NULL,
  activity    text,
  points      integer NOT NULL DEFAULT 1,
  term_id     text,
  notes       text,
  awarded_by  uuid,
  status      text DEFAULT 'approved'
    CHECK (status IN ('pending','approved','rejected')),
  awarded_at  timestamptz DEFAULT now()
);

ALTER TABLE public.talent_points
  ADD COLUMN IF NOT EXISTS activity   text,
  ADD COLUMN IF NOT EXISTS term_id    text,
  ADD COLUMN IF NOT EXISTS notes      text,
  ADD COLUMN IF NOT EXISTS awarded_by uuid,
  ADD COLUMN IF NOT EXISTS status     text DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS awarded_at timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_talent_school
  ON public.talent_points(school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_talent_category
  ON public.talent_points(school_id, category);

ALTER TABLE public.talent_points ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "talent_school" ON public.talent_points;
CREATE POLICY "talent_school" ON public.talent_points
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

-- ── alumni ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.alumni (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id             uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id            uuid REFERENCES public.students(id) ON DELETE SET NULL,
  full_name             text NOT NULL,
  admission_number      text,
  graduation_year       integer NOT NULL,
  kcse_grade            text,
  class_name            text,
  current_occupation    text,
  university            text,
  mentorship_available  boolean DEFAULT false,
  subject_specialization text,
  whatsapp_number       text,
  verified              boolean DEFAULT false,
  achievements          jsonb DEFAULT '[]',
  career_pathway        text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE public.alumni
  ADD COLUMN IF NOT EXISTS current_occupation    text,
  ADD COLUMN IF NOT EXISTS university            text,
  ADD COLUMN IF NOT EXISTS mentorship_available  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS subject_specialization text,
  ADD COLUMN IF NOT EXISTS whatsapp_number       text,
  ADD COLUMN IF NOT EXISTS verified              boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS achievements          jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS career_pathway        text,
  ADD COLUMN IF NOT EXISTS updated_at            timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_alumni_school
  ON public.alumni(school_id, graduation_year DESC);

ALTER TABLE public.alumni ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alumni_school" ON public.alumni;
CREATE POLICY "alumni_school" ON public.alumni
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

-- ── kcse_predictions ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.kcse_predictions (
  id                  uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id           uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id          uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id            uuid,
  predicted_mean      numeric(4,1),
  predicted_grade     text,
  subject_predictions jsonb DEFAULT '[]',
  university_eligible boolean DEFAULT false,
  key_risks           jsonb DEFAULT '[]',
  recommendations     jsonb DEFAULT '[]',
  academic_year       text,
  generated_at        timestamptz DEFAULT now(),
  UNIQUE (school_id, student_id)
);

ALTER TABLE public.kcse_predictions
  ADD COLUMN IF NOT EXISTS class_id            uuid,
  ADD COLUMN IF NOT EXISTS subject_predictions jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS university_eligible boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS key_risks           jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS recommendations     jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS academic_year       text,
  ADD COLUMN IF NOT EXISTS generated_at        timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_kcse_school
  ON public.kcse_predictions(school_id, academic_year);

ALTER TABLE public.kcse_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kcse_pred_school" ON public.kcse_predictions;
CREATE POLICY "kcse_pred_school" ON public.kcse_predictions
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

-- ── ai_career_reports ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_career_reports (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id     uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  cluster        text,
  cluster_score  integer,
  course_matches jsonb DEFAULT '[]',
  gap_analysis   jsonb DEFAULT '{}',
  narrative      text,
  generated_at   timestamptz DEFAULT now(),
  UNIQUE (school_id, student_id)
);

ALTER TABLE public.ai_career_reports
  ADD COLUMN IF NOT EXISTS cluster_score  integer,
  ADD COLUMN IF NOT EXISTS course_matches jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS gap_analysis   jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS generated_at   timestamptz DEFAULT now();

ALTER TABLE public.ai_career_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "career_reports_school" ON public.ai_career_reports;
CREATE POLICY "career_reports_school" ON public.ai_career_reports
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

-- ── magazine_content ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.magazine_content (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  section          text NOT NULL,
  title            text NOT NULL,
  body             text,
  image_url        text,
  image_status     text DEFAULT 'none'
    CHECK (image_status IN ('ok','removed','none','pending')),
  image_retry_count integer DEFAULT 0,
  featured         boolean DEFAULT false,
  approved         boolean DEFAULT false,
  approved_by      uuid,
  approved_at      timestamptz,
  parental_consent boolean DEFAULT true,
  student_ids      jsonb DEFAULT '[]',
  tags             jsonb DEFAULT '[]',
  published_at     timestamptz,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE public.magazine_content
  ADD COLUMN IF NOT EXISTS image_status      text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS image_retry_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approved_by       uuid,
  ADD COLUMN IF NOT EXISTS approved_at       timestamptz,
  ADD COLUMN IF NOT EXISTS parental_consent  boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS student_ids       jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS tags              jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS published_at      timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_magazine_school
  ON public.magazine_content(school_id, approved, published_at DESC);

ALTER TABLE public.magazine_content ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "magazine_school" ON public.magazine_content;
CREATE POLICY "magazine_school" ON public.magazine_content
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());
