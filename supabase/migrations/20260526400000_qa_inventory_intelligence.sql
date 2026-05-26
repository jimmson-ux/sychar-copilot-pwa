-- ================================================================
-- QA OBSERVATIONS + INVENTORY INTELLIGENCE — 2026-05-26
--
-- NEW TABLES:
--   qa_observations    — QA officer lesson observation scores (1-5 per dimension)
--   consumption_alerts — AI-generated depletion forecasts for inventory
--   inventory_intake   — delivery note OCR results (pending storekeeper verify)
--
-- qa_observations references timetable_periods for exact lesson linkage.
-- consumption_alerts populated by analyze-consumption edge function (weekly).
-- inventory_intake populated by process-invoice-ocr edge function.
-- ================================================================


-- ── 1. QA OBSERVATIONS ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.qa_observations (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  timetable_period_id   uuid        REFERENCES public.timetable_periods(id) ON DELETE SET NULL,
  observer_id           uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  teacher_id            uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  observation_date      date        NOT NULL DEFAULT CURRENT_DATE,

  -- Scored dimensions (1–5)
  lesson_preparation    int         CHECK (lesson_preparation   BETWEEN 1 AND 5),
  content_accuracy      int         CHECK (content_accuracy     BETWEEN 1 AND 5),
  teaching_aids_used    int         CHECK (teaching_aids_used   BETWEEN 1 AND 5),
  student_engagement    int         CHECK (student_engagement   BETWEEN 1 AND 5),
  time_management       int         CHECK (time_management      BETWEEN 1 AND 5),
  classroom_management  int         CHECK (classroom_management BETWEEN 1 AND 5),

  -- Auto-calculated
  overall_score         numeric(4,2) GENERATED ALWAYS AS (
    CASE
      WHEN lesson_preparation IS NOT NULL
        AND content_accuracy   IS NOT NULL
        AND teaching_aids_used IS NOT NULL
        AND student_engagement IS NOT NULL
        AND time_management    IS NOT NULL
        AND classroom_management IS NOT NULL
      THEN (
        lesson_preparation + content_accuracy + teaching_aids_used
        + student_engagement + time_management + classroom_management
      )::numeric / 6
      ELSE NULL
    END
  ) STORED,

  strengths               text,
  areas_for_improvement   text,
  recommended_actions     text[],

  shared_with_teacher     boolean     DEFAULT false,
  shared_with_principal   boolean     DEFAULT false,
  teacher_response        text,
  teacher_responded_at    timestamptz,

  created_at              timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qao_school_teacher
  ON public.qa_observations (school_id, teacher_id, observation_date DESC);
CREATE INDEX IF NOT EXISTS idx_qao_observer
  ON public.qa_observations (observer_id, observation_date DESC);

ALTER TABLE public.qa_observations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qao_observer_read"   ON public.qa_observations;
DROP POLICY IF EXISTS "qao_principal_all"   ON public.qa_observations;
DROP POLICY IF EXISTS "qao_teacher_own"     ON public.qa_observations;
DROP POLICY IF EXISTS "qao_service"         ON public.qa_observations;

-- QA officers and principals see all; teachers see only their own shared records
CREATE POLICY "qao_observer_read" ON public.qa_observations
  FOR SELECT TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'qaso','qa_officer','principal','deputy_principal',
      'deputy_principal_academic','super_admin'
    )
  );

CREATE POLICY "qao_observer_write" ON public.qa_observations
  FOR INSERT TO authenticated
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'qaso','qa_officer','principal','deputy_principal',
      'deputy_principal_academic','super_admin'
    )
  );

CREATE POLICY "qao_observer_update" ON public.qa_observations
  FOR UPDATE TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'qaso','qa_officer','principal','deputy_principal',
      'deputy_principal_academic','super_admin'
    )
  );

CREATE POLICY "qao_teacher_own" ON public.qa_observations
  FOR SELECT TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND teacher_id = (
      SELECT id FROM public.staff_records
      WHERE user_id = auth.uid()::text
      LIMIT 1
    )
    AND shared_with_teacher = true
  );

CREATE POLICY "qao_service" ON public.qa_observations
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 2. CONSUMPTION ALERTS (AI-generated inventory forecasts) ─────

CREATE TABLE IF NOT EXISTS public.consumption_alerts (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id                 uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  item_id                   uuid        NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  predicted_depletion_date  date,
  days_remaining            int,
  weekly_consumption_rate   numeric(10,2),
  confidence_level          text        DEFAULT 'Medium'
    CHECK (confidence_level IN ('High','Medium','Low')),
  reasoning                 text,
  recommended_order_quantity numeric(10,2),
  recommended_order_date    date,
  is_acknowledged           boolean     DEFAULT false,
  acknowledged_by           uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  acknowledged_at           timestamptz,
  created_at                timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ca_school_active
  ON public.consumption_alerts (school_id, is_acknowledged, days_remaining ASC);

ALTER TABLE public.consumption_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ca_school_read"       ON public.consumption_alerts;
DROP POLICY IF EXISTS "ca_storekeeper_write" ON public.consumption_alerts;
DROP POLICY IF EXISTS "ca_service"           ON public.consumption_alerts;

CREATE POLICY "ca_school_read" ON public.consumption_alerts
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "ca_storekeeper_write" ON public.consumption_alerts
  FOR UPDATE TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'storekeeper','bursar','principal','super_admin'
    )
  );

CREATE POLICY "ca_service" ON public.consumption_alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 3. INVENTORY INTAKE (delivery note OCR results) ──────────────

CREATE TABLE IF NOT EXISTS public.inventory_intake (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            uuid    NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  supplier_name        text,
  invoice_number       text,
  invoice_date         date,
  total_amount         numeric(12,2),
  document_image_url   text,
  ai_extracted_data    jsonb   DEFAULT '{}',
  line_items           jsonb   DEFAULT '[]',
  verification_status  text    DEFAULT 'Pending'
    CHECK (verification_status IN ('Pending','Verified','Disputed')),
  verified_by          uuid    REFERENCES public.staff_records(id) ON DELETE SET NULL,
  verified_at          timestamptz,
  notes                text,
  created_at           timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ii_school_status
  ON public.inventory_intake (school_id, verification_status, created_at DESC);

ALTER TABLE public.inventory_intake ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ii_school_read"       ON public.inventory_intake;
DROP POLICY IF EXISTS "ii_storekeeper_write" ON public.inventory_intake;
DROP POLICY IF EXISTS "ii_service"           ON public.inventory_intake;

CREATE POLICY "ii_school_read" ON public.inventory_intake
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "ii_storekeeper_write" ON public.inventory_intake
  FOR ALL TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'storekeeper','bursar','principal','super_admin'
    )
  )
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'storekeeper','bursar','principal','super_admin'
    )
  );

CREATE POLICY "ii_service" ON public.inventory_intake
  FOR ALL TO service_role USING (true) WITH CHECK (true);
