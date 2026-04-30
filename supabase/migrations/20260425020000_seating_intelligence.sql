-- ============================================================
-- Seating Intelligence Engine
-- ============================================================

CREATE TABLE IF NOT EXISTS public.seating_arrangements (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id       uuid        NOT NULL,
  class_name      text        NOT NULL,
  stream_name     text,
  teacher_id      uuid        NOT NULL REFERENCES public.staff_records(id),
  term            integer     CHECK (term IN (1,2,3)),
  academic_year   text        NOT NULL,
  layout          jsonb       NOT NULL DEFAULT '[]',
  insights        jsonb       DEFAULT '{}',
  last_insight_at timestamptz,
  is_active       boolean     DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(school_id, class_name, stream_name, term, academic_year)
);

CREATE INDEX IF NOT EXISTS idx_seating_class
  ON public.seating_arrangements(school_id, class_name, stream_name);

ALTER TABLE public.seating_arrangements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seating_school" ON public.seating_arrangements;
CREATE POLICY "seating_school" ON public.seating_arrangements
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id());

DROP POLICY IF EXISTS "seating_service" ON public.seating_arrangements;
CREATE POLICY "seating_service" ON public.seating_arrangements
  FOR ALL TO service_role USING (true) WITH CHECK (true);
