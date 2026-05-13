-- Duty appraisals: TSC-aligned teacher duty performance ratings.
-- school_id is uuid (matches get_my_school_id() return type).
DROP TABLE IF EXISTS public.duty_appraisals CASCADE;

CREATE TABLE public.duty_appraisals (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id      uuid NOT NULL,     -- uuid, matches get_my_school_id()
  roster_id      text,              -- duty_rosters.id (nullable = ad-hoc)
  teacher_id     text NOT NULL,     -- staff_records.id
  appraiser_id   text NOT NULL,     -- staff_records.id of rater
  area           text NOT NULL,
  week_starting  date NOT NULL,
  rating         smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        text,
  created_at     timestamptz DEFAULT now() NOT NULL
);

-- One appraisal per duty slot per appraiser
CREATE UNIQUE INDEX duty_appraisals_roster_appraiser
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
