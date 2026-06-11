-- Gate shift sign-in: the shared "Gate Control" login is used by two guards who alternate
-- day/night shifts over a CONSTANT shared visitor logbook. Before starting, the on-duty guard
-- confirms their shift here (an in-app shift record, not a separate auth identity).
CREATE TABLE IF NOT EXISTS public.gate_shift_log (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id      uuid        NOT NULL REFERENCES public.schools (id) ON DELETE CASCADE,
  guard_staff_id uuid        REFERENCES public.staff_records (id) ON DELETE SET NULL,
  guard_name     text        NOT NULL,
  shift          text        NOT NULL CHECK (shift IN ('day','night')),
  started_at     timestamptz DEFAULT now(),
  ended_at       timestamptz,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gate_shift_log_school_started
  ON public.gate_shift_log (school_id, started_at DESC);

ALTER TABLE public.gate_shift_log ENABLE ROW LEVEL SECURITY;

-- Server functions write with the service role (bypasses RLS). Authenticated staff may read
-- their own school's shift log.
DROP POLICY IF EXISTS gate_shift_log_select ON public.gate_shift_log;
CREATE POLICY gate_shift_log_select ON public.gate_shift_log
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());
