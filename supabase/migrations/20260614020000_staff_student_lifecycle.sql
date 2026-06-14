-- ================================================================
-- Staff & student lifecycle (fluid onboard / offboard) — 2026-06-14 · all schools
-- Staff are NEVER deleted — outgoing staff are deactivated with an exit reason/date so
-- their history (marks recorded, duties, approvals) stays intact. Students are archived,
-- not hard-deleted, when they transfer / graduate / withdraw.
-- ================================================================
ALTER TABLE public.staff_records ADD COLUMN IF NOT EXISTS exit_date date;
ALTER TABLE public.staff_records ADD COLUMN IF NOT EXISTS exit_reason text;
ALTER TABLE public.staff_records ADD COLUMN IF NOT EXISTS replaced_by uuid REFERENCES public.staff_records(id) ON DELETE SET NULL;

ALTER TABLE public.students ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','transferred','graduated','withdrawn','archived','suspended'));
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS exit_reason text;
