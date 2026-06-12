-- ================================================================
-- NURSE FOLLOW-UP TRACKING
-- 2026-06-12
--
-- Supports timely, intelligent follow-up reminders (supabase/functions/nurse-followup).
-- followup_due_at is computed from the visit's follow_up_plan; the cron nags the
-- nurse when it falls due and AI (RAG over patient notes) frames the reminder.
-- ================================================================

ALTER TABLE public.sick_bay_visits
  ADD COLUMN IF NOT EXISTS followup_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_done   boolean NOT NULL DEFAULT false;

ALTER TABLE public.staff_patient_visits
  ADD COLUMN IF NOT EXISTS followup_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS followup_done   boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sick_bay_followup_due
  ON public.sick_bay_visits (school_id, followup_due_at)
  WHERE followup_done = false AND followup_due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_visit_followup_due
  ON public.staff_patient_visits (school_id, followup_due_at)
  WHERE followup_done = false AND followup_due_at IS NOT NULL;
