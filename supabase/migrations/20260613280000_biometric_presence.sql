-- ================================================================
-- BIOMETRIC PRESENCE ENGINE + MOVEMENT TIMELINE + DEVICE HEALTH
-- 2026-06-13 · Oloolaiser biometric platform (Phase 1) — gated by features.biometric_gate
--
-- Extends the existing ingest (attendance_events + lib/biometric.ts) with a proper
-- presence state machine, an immutable movement timeline, on-prem device health, and
-- a bridge high-water mark. All school_id-scoped with RLS. Used by all biometric schools.
-- ================================================================

-- ── Presence state machine (one row per student) ────────────────
CREATE TABLE IF NOT EXISTS public.student_presence (
  student_id     uuid PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  current_status text NOT NULL DEFAULT 'UNKNOWN'
    CHECK (current_status IN ('ON_CAMPUS','OFF_CAMPUS','ON_LEAVE','ON_EXEAT','HOSPITAL','SUSPENDED','UNKNOWN')),
  last_event     text,
  last_device    text,
  last_seen_at   timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_student_presence_school ON public.student_presence (school_id, current_status);

-- ── Immutable movement timeline ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_movements (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  movement_type text NOT NULL,                 -- ARRIVAL|DEPARTURE|RETURN_FROM_LEAVE|RETURN_FROM_EXEAT|RETURN_FROM_HOSPITAL|CLINIC_VISIT|...
  event_at      timestamptz NOT NULL,
  device        text,
  actor         text,                          -- 'biometric' | staff name
  remarks       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_student_movements_student ON public.student_movements (school_id, student_id, event_at DESC);

-- ── On-prem device health (fed by the bridge + last_seen_at) ─────
CREATE TABLE IF NOT EXISTS public.device_health (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  device_serial text NOT NULL,
  status        text NOT NULL DEFAULT 'unknown' CHECK (status IN ('online','offline','degraded','unknown')),
  last_poll_at  timestamptz,
  latency_ms    integer,
  error_count   integer NOT NULL DEFAULT 0,
  drift_seconds integer,
  firmware      text,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, device_serial)
);

-- ── Bridge high-water mark (server-side, complements the bridge's SQLite) ──
CREATE TABLE IF NOT EXISTS public.device_import_state (
  device_serial   text PRIMARY KEY,
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  last_log_id     text,
  last_imported_at timestamptz NOT NULL DEFAULT now()
);

-- ── biometric_ready on students (onboarding manager) ────────────
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS biometric_ready boolean NOT NULL DEFAULT false;

-- ── RLS: school staff read; leadership/ICT + service manage ─────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['student_presence','student_movements','device_health','device_import_state']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_read ON public.%I FOR SELECT TO authenticated
      USING (school_id::text = public.get_my_school_id()::text)
    $f$, t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_service ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_service ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- ── Presence summary (emergency roll-call backbone) ─────────────
CREATE OR REPLACE FUNCTION public.presence_summary(p_school_id uuid)
RETURNS TABLE (current_status text, n integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_status, count(*)::int FROM public.student_presence
  WHERE school_id = p_school_id GROUP BY current_status;
$$;
GRANT EXECUTE ON FUNCTION public.presence_summary(uuid) TO authenticated, service_role;

-- ── Student movement timeline ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.student_timeline(p_student_id uuid)
RETURNS SETOF public.student_movements
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.student_movements WHERE student_id = p_student_id ORDER BY event_at DESC LIMIT 200;
$$;
GRANT EXECUTE ON FUNCTION public.student_timeline(uuid) TO authenticated, service_role;

-- ── Device health upsert (bridge heartbeat) ─────────────────────
CREATE OR REPLACE FUNCTION public.touch_device_health(
  p_school_id uuid, p_serial text, p_status text, p_latency_ms integer DEFAULT NULL,
  p_drift_seconds integer DEFAULT NULL, p_firmware text DEFAULT NULL, p_error boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.device_health (school_id, device_serial, status, last_poll_at, latency_ms, drift_seconds, firmware, error_count)
  VALUES (p_school_id, p_serial, p_status, now(), p_latency_ms, p_drift_seconds, p_firmware, CASE WHEN p_error THEN 1 ELSE 0 END)
  ON CONFLICT (school_id, device_serial) DO UPDATE SET
    status = EXCLUDED.status, last_poll_at = now(), latency_ms = EXCLUDED.latency_ms,
    drift_seconds = EXCLUDED.drift_seconds, firmware = COALESCE(EXCLUDED.firmware, public.device_health.firmware),
    error_count = public.device_health.error_count + (CASE WHEN p_error THEN 1 ELSE 0 END),
    updated_at = now();
END $$;
GRANT EXECUTE ON FUNCTION public.touch_device_health(uuid, text, text, integer, integer, text, boolean) TO service_role;
