-- ================================================================
-- GATE SHIFT (guard ID) + EXEAT STAFF ISSUANCE
-- 2026-06-12
--
-- Oloolaiser is a boarding school with MANY rotating contracted guards (no single
-- permanent gatekeeper). They share a "Gate Control" login, then identify
-- themselves per shift with name + ID number and confirm shift start/end so the
-- system is always aware who is on the gate (day 06:30–17:30, night 17:30–06:30).
--
-- Also lets the Teacher-on-Duty and School Nurse ISSUE exeats (approved by the
-- deputy/principal), tracked via issued_by_role / issuer_staff_id.
-- ================================================================

-- ── 1. Guard ID number on the shift log ─────────────────────────
ALTER TABLE public.gate_shift_log
  ADD COLUMN IF NOT EXISTS guard_id_number text;

-- ── 2. Current open gate shift (the system is "constantly aware") ─
CREATE OR REPLACE FUNCTION public.current_gate_shift(p_school_id uuid)
RETURNS TABLE (
  id              uuid,
  guard_name      text,
  guard_id_number text,
  shift           text,
  started_at      timestamptz,
  minutes_open    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    g.id, g.guard_name, g.guard_id_number, g.shift, g.started_at,
    (EXTRACT(EPOCH FROM (now() - g.started_at)) / 60)::int AS minutes_open
  FROM public.gate_shift_log g
  WHERE g.school_id = p_school_id
    AND g.ended_at IS NULL
  ORDER BY g.started_at DESC
  LIMIT 1;
$$;

-- ── 3. Exeat staff-issuance audit columns ───────────────────────
ALTER TABLE public.exeat_requests
  ADD COLUMN IF NOT EXISTS issued_by_role  text,
  ADD COLUMN IF NOT EXISTS issuer_staff_id uuid REFERENCES public.staff_records(id) ON DELETE SET NULL;
