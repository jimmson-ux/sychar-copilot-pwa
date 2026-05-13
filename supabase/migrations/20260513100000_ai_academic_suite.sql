-- AI Academic Intelligence Suite — 15 new tables
-- All school_id columns are uuid to match get_my_school_id() return type.

-- ---------------------------------------------------------------
-- 1. master_curriculum  (global registry, no school_id needed)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_curriculum (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  education_system     text NOT NULL,  -- 'CBC' | '8-4-4' | 'Senior Secondary'
  grade_level          text NOT NULL,  -- 'Grade 7' | 'Form 3' | 'Grade 11'
  subject              text NOT NULL,
  topic                text NOT NULL,
  subtopic             text NOT NULL,
  national_objectives  jsonb,
  suggested_resources  jsonb
);

CREATE INDEX IF NOT EXISTS mc_system_grade_subject
  ON public.master_curriculum (education_system, grade_level, subject);

-- ---------------------------------------------------------------
-- 2. ai_generation_cache
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_generation_cache (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            uuid NOT NULL,
  subtopic_id          uuid REFERENCES public.master_curriculum (id),
  prompt_hash          text NOT NULL,
  content_type         text NOT NULL,  -- 'lesson_plan' | 'assessment' | 'scheme'
  generated_json       jsonb NOT NULL,
  architecture_version text NOT NULL DEFAULT 'v1',
  created_at           timestamptz DEFAULT now() NOT NULL,
  UNIQUE (prompt_hash, content_type)
);

ALTER TABLE public.ai_generation_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_cache_select_school" ON public.ai_generation_cache
  FOR SELECT TO authenticated USING (school_id = get_my_school_id());

CREATE POLICY "ai_cache_insert_school" ON public.ai_generation_cache
  FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());

CREATE POLICY "ai_cache_delete_school" ON public.ai_generation_cache
  FOR DELETE TO authenticated USING (school_id = get_my_school_id());

-- ---------------------------------------------------------------
-- 3. teacher_ai_prompts
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teacher_ai_prompts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            uuid NOT NULL,
  teacher_id           text NOT NULL,
  content_type         text NOT NULL,
  prompt_tokens        int DEFAULT 0,
  completion_tokens    int DEFAULT 0,
  cost_estimate        numeric(10,6) DEFAULT 0,
  created_at           timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.teacher_ai_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_prompts_select_school" ON public.teacher_ai_prompts
  FOR SELECT TO authenticated USING (school_id = get_my_school_id());

CREATE POLICY "ai_prompts_insert_school" ON public.teacher_ai_prompts
  FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());

CREATE INDEX IF NOT EXISTS ai_prompts_teacher
  ON public.teacher_ai_prompts (school_id, teacher_id);

-- ---------------------------------------------------------------
-- 4. exam_blueprints
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exam_blueprints (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL,
  teacher_id     text NOT NULL,
  subject        text NOT NULL,
  grade          text NOT NULL,
  term           smallint NOT NULL CHECK (term BETWEEN 1 AND 3),
  exam_type      text NOT NULL,
  total_marks    int NOT NULL DEFAULT 100,
  curriculum     text NOT NULL,
  blueprint_json jsonb NOT NULL,
  created_at     timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.exam_blueprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blueprints_select_school" ON public.exam_blueprints
  FOR SELECT TO authenticated USING (school_id = get_my_school_id());

CREATE POLICY "blueprints_insert_school" ON public.exam_blueprints
  FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());

CREATE POLICY "blueprints_update_school" ON public.exam_blueprints
  FOR UPDATE TO authenticated USING (school_id = get_my_school_id());

-- ---------------------------------------------------------------
-- 5. assessment_item_bank
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assessment_item_bank (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL,
  blueprint_id   uuid REFERENCES public.exam_blueprints (id),
  question_text  text NOT NULL,
  question_type  text NOT NULL,   -- 'MCQ' | 'short_answer' | 'structured' | 'competency_task'
  bloom_level    text NOT NULL,
  marks          int NOT NULL DEFAULT 2,
  difficulty     text NOT NULL DEFAULT 'medium',
  topic          text NOT NULL,
  answer_key     text,
  rubric_json    jsonb,
  created_at     timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.assessment_item_bank ENABLE ROW LEVEL SECURITY;

CREATE POLICY "item_bank_select_school" ON public.assessment_item_bank
  FOR SELECT TO authenticated USING (school_id = get_my_school_id());

CREATE POLICY "item_bank_insert_school" ON public.assessment_item_bank
  FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());

CREATE POLICY "item_bank_update_school" ON public.assessment_item_bank
  FOR UPDATE TO authenticated USING (school_id = get_my_school_id());

CREATE POLICY "item_bank_delete_school" ON public.assessment_item_bank
  FOR DELETE TO authenticated USING (school_id = get_my_school_id());

CREATE INDEX IF NOT EXISTS item_bank_blueprint
  ON public.assessment_item_bank (blueprint_id);

-- ---------------------------------------------------------------
-- 6. generated_assessment_instruments
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.generated_assessment_instruments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL,
  blueprint_id uuid REFERENCES public.exam_blueprints (id),
  teacher_id   text NOT NULL,
  title        text NOT NULL,
  instructions text,
  items_json   jsonb NOT NULL,
  status       text DEFAULT 'draft',
  created_at   timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.generated_assessment_instruments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "instruments_select_school" ON public.generated_assessment_instruments
  FOR SELECT TO authenticated USING (school_id = get_my_school_id());

CREATE POLICY "instruments_insert_school" ON public.generated_assessment_instruments
  FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());

CREATE POLICY "instruments_update_school" ON public.generated_assessment_instruments
  FOR UPDATE TO authenticated USING (school_id = get_my_school_id());

-- ---------------------------------------------------------------
-- 7. student_performance_analytics
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_performance_analytics (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id               uuid NOT NULL,
  student_id              text NOT NULL,
  subtopic_id             uuid REFERENCES public.master_curriculum (id),
  subject                 text NOT NULL,
  subtopic_label          text NOT NULL,
  score_pct               numeric(5,2),
  quiz_attempts           int DEFAULT 0,
  flagged_for_remediation boolean DEFAULT false,
  flagged_for_extension   boolean DEFAULT false,
  cleared_at              timestamptz,
  last_assessed_at        timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.student_performance_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "spa_select_school" ON public.student_performance_analytics
  FOR SELECT TO authenticated USING (school_id = get_my_school_id());

CREATE POLICY "spa_insert_school" ON public.student_performance_analytics
  FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());

CREATE POLICY "spa_update_school" ON public.student_performance_analytics
  FOR UPDATE TO authenticated USING (school_id = get_my_school_id());

CREATE INDEX IF NOT EXISTS spa_student_subject
  ON public.student_performance_analytics (school_id, student_id, subject);

CREATE INDEX IF NOT EXISTS spa_flagged
  ON public.student_performance_analytics (school_id, flagged_for_remediation)
  WHERE flagged_for_remediation = true;

-- ---------------------------------------------------------------
-- 8. revision_materials
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.revision_materials (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL,
  subtopic_id    uuid REFERENCES public.master_curriculum (id),
  material_type  text NOT NULL,   -- 'summary' | 'practice_questions' | 'extension'
  difficulty     text NOT NULL,   -- 'remedial' | 'standard' | 'extension'
  title          text NOT NULL,
  body_md        text NOT NULL,
  created_by     text,
  created_at     timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.revision_materials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "revision_select_school" ON public.revision_materials
  FOR SELECT TO authenticated USING (school_id = get_my_school_id());

CREATE POLICY "revision_insert_school" ON public.revision_materials
  FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());

CREATE POLICY "revision_update_school" ON public.revision_materials
  FOR UPDATE TO authenticated USING (school_id = get_my_school_id());

-- ---------------------------------------------------------------
-- 9. personalised_homework_queues
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personalised_homework_queues (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL,
  student_id   text NOT NULL,
  material_id  uuid REFERENCES public.revision_materials (id),
  assigned_by  text,
  due_date     date,
  status       text DEFAULT 'pending',
  submitted_at timestamptz,
  assigned_at  timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.personalised_homework_queues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hwq_select_school" ON public.personalised_homework_queues
  FOR SELECT TO authenticated USING (school_id = get_my_school_id());

CREATE POLICY "hwq_insert_school" ON public.personalised_homework_queues
  FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());

CREATE POLICY "hwq_update_school" ON public.personalised_homework_queues
  FOR UPDATE TO authenticated USING (school_id = get_my_school_id());

CREATE INDEX IF NOT EXISTS hwq_student_status
  ON public.personalised_homework_queues (school_id, student_id, status);

-- ---------------------------------------------------------------
-- 10. school_calendar_events
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_calendar_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL,
  event_date       date NOT NULL,
  event_type       text NOT NULL,
  title            text NOT NULL,
  affects_teaching boolean DEFAULT true,
  created_by       text,
  created_at       timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.school_calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cal_select_school" ON public.school_calendar_events
  FOR SELECT TO authenticated USING (school_id = get_my_school_id());

CREATE POLICY "cal_insert_school" ON public.school_calendar_events
  FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());

CREATE POLICY "cal_update_school" ON public.school_calendar_events
  FOR UPDATE TO authenticated USING (school_id = get_my_school_id());

CREATE POLICY "cal_delete_school" ON public.school_calendar_events
  FOR DELETE TO authenticated USING (school_id = get_my_school_id());

CREATE INDEX IF NOT EXISTS cal_school_date
  ON public.school_calendar_events (school_id, event_date);

-- ---------------------------------------------------------------
-- 11. term_structures
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.term_structures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL,
  year            int NOT NULL,
  term            smallint NOT NULL CHECK (term BETWEEN 1 AND 3),
  open_date       date NOT NULL,
  close_date      date NOT NULL,
  mid_term_start  date,
  mid_term_end    date,
  UNIQUE (school_id, year, term)
);

ALTER TABLE public.term_structures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "terms_select_school" ON public.term_structures
  FOR SELECT TO authenticated USING (school_id = get_my_school_id());

CREATE POLICY "terms_insert_school" ON public.term_structures
  FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());

CREATE POLICY "terms_update_school" ON public.term_structures
  FOR UPDATE TO authenticated USING (school_id = get_my_school_id());

-- ---------------------------------------------------------------
-- 12. generated_schemes_of_work
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.generated_schemes_of_work (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL,
  teacher_id        text NOT NULL,
  subject           text NOT NULL,
  grade             text NOT NULL,
  curriculum        text NOT NULL,
  term              smallint NOT NULL CHECK (term BETWEEN 1 AND 3),
  year              int NOT NULL,
  term_structure_id uuid REFERENCES public.term_structures (id),
  status            text DEFAULT 'draft',
  created_at        timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.generated_schemes_of_work ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gsow_select_school" ON public.generated_schemes_of_work
  FOR SELECT TO authenticated USING (school_id = get_my_school_id());

CREATE POLICY "gsow_insert_school" ON public.generated_schemes_of_work
  FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());

CREATE POLICY "gsow_update_school" ON public.generated_schemes_of_work
  FOR UPDATE TO authenticated USING (school_id = get_my_school_id());

CREATE INDEX IF NOT EXISTS gsow_teacher_term
  ON public.generated_schemes_of_work (school_id, teacher_id, year, term);

-- ---------------------------------------------------------------
-- 13. scheme_rows
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheme_rows (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id         uuid NOT NULL REFERENCES public.generated_schemes_of_work (id) ON DELETE CASCADE,
  week_number       smallint NOT NULL,
  week_start_date   date NOT NULL,
  topic             text NOT NULL,
  subtopic          text NOT NULL,
  objectives        text,
  resources         text,
  is_holiday_week   boolean DEFAULT false,
  holiday_reason    text,
  teaching_days     smallint DEFAULT 5,
  sort_order        smallint NOT NULL
);

CREATE INDEX IF NOT EXISTS scheme_rows_scheme
  ON public.scheme_rows (scheme_id, sort_order);

CREATE INDEX IF NOT EXISTS scheme_rows_date
  ON public.scheme_rows (scheme_id, week_start_date);

-- scheme_rows inherits RLS via scheme_id → generated_schemes_of_work
-- No separate RLS needed; access controlled via join.
ALTER TABLE public.scheme_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scheme_rows_select" ON public.scheme_rows
  FOR SELECT TO authenticated
  USING (
    scheme_id IN (
      SELECT id FROM public.generated_schemes_of_work
      WHERE school_id = get_my_school_id()
    )
  );

CREATE POLICY "scheme_rows_insert" ON public.scheme_rows
  FOR INSERT TO authenticated
  WITH CHECK (
    scheme_id IN (
      SELECT id FROM public.generated_schemes_of_work
      WHERE school_id = get_my_school_id()
    )
  );

CREATE POLICY "scheme_rows_update" ON public.scheme_rows
  FOR UPDATE TO authenticated
  USING (
    scheme_id IN (
      SELECT id FROM public.generated_schemes_of_work
      WHERE school_id = get_my_school_id()
    )
  );

CREATE POLICY "scheme_rows_delete" ON public.scheme_rows
  FOR DELETE TO authenticated
  USING (
    scheme_id IN (
      SELECT id FROM public.generated_schemes_of_work
      WHERE school_id = get_my_school_id()
    )
  );

-- ---------------------------------------------------------------
-- 14. administrative_overrides_audit  (append-only)
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.administrative_overrides_audit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL,
  actor_id        text NOT NULL,
  action_type     text NOT NULL,
  target_table    text,
  before_snapshot jsonb,
  after_snapshot  jsonb,
  hmac_hash       text NOT NULL,
  ip_address      text,
  user_agent      text,
  created_at      timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.administrative_overrides_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "aoa_select_school" ON public.administrative_overrides_audit
  FOR SELECT TO authenticated USING (school_id = get_my_school_id());

CREATE POLICY "aoa_insert_school" ON public.administrative_overrides_audit
  FOR INSERT TO authenticated WITH CHECK (school_id = get_my_school_id());

-- No UPDATE or DELETE policies — append-only log.

CREATE INDEX IF NOT EXISTS aoa_school_created
  ON public.administrative_overrides_audit (school_id, created_at DESC);
