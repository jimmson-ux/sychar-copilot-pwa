-- Duty appraisals: TSC-aligned teacher duty performance ratings
CREATE TABLE IF NOT EXISTS public.duty_appraisals (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id      text NOT NULL,
  roster_id      text,            -- duty_rosters.id (null = ad-hoc rating not tied to a slot)
  teacher_id     text NOT NULL,   -- staff_records.id
  appraiser_id   text NOT NULL,   -- staff_records.id of the person rating
  area           text NOT NULL,   -- gate, dining hall, field, library, etc.
  week_starting  date NOT NULL,
  rating         smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        text,
  created_at     timestamptz DEFAULT now() NOT NULL
);

-- One appraisal per roster slot per appraiser (allows multiple appraisers per slot)
CREATE UNIQUE INDEX IF NOT EXISTS duty_appraisals_roster_appraiser
  ON public.duty_appraisals (roster_id, appraiser_id)
  WHERE roster_id IS NOT NULL;

ALTER TABLE public.duty_appraisals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "duty_appraisals_select_school" ON public.duty_appraisals
  FOR SELECT TO authenticated
  USING (school_id = get_my_school_id());

CREATE POLICY "duty_appraisals_insert_school" ON public.duty_appraisals
  FOR INSERT TO authenticated
  WITH CHECK (school_id = get_my_school_id());

CREATE POLICY "duty_appraisals_update_own" ON public.duty_appraisals
  FOR UPDATE TO authenticated
  USING (school_id = get_my_school_id() AND appraiser_id = auth.uid()::text);

-- Add exam_results school_id index for faster per-school queries
CREATE INDEX IF NOT EXISTS exam_results_school_term
  ON public.exam_results (school_id, term, exam_type);
