-- Add push_recipient flag to staff_records (idempotent).
-- Used by Admin Roster to mark which staff get late-arrival, breach
-- and QA push notifications.
ALTER TABLE public.staff_records
  ADD COLUMN IF NOT EXISTS push_recipient BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS staff_records_push_recipient_idx
  ON public.staff_records (school_id) WHERE push_recipient = true;
