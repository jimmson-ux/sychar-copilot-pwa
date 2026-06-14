-- ================================================================
-- Exeat escalation level — 2026-06-14 · boarding/biometric schools
-- Tiered escalation for overdue exeat returns. escalation_level is the highest tier
-- already notified (0 none, 1 TOD+class teacher+deputy, 2 deputy, 3 principal+parent)
-- so the cron never re-fires the same tier.
-- ================================================================
ALTER TABLE public.exeat_requests ADD COLUMN IF NOT EXISTS escalation_level smallint NOT NULL DEFAULT 0;
ALTER TABLE public.exeat_requests ADD COLUMN IF NOT EXISTS expected_return_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_exeat_overdue
  ON public.exeat_requests (school_id, status, return_time, escalation_level);
