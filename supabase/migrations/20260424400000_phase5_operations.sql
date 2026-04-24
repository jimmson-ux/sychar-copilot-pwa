-- Phase 5 — Operations: visitor log, gate passes, wallet, exeat requests

-- ── visitor_log: add missing premium columns ──────────────────────────────────

ALTER TABLE public.visitor_log
  ADD COLUMN IF NOT EXISTS visitor_name          text,
  ADD COLUMN IF NOT EXISTS id_number             text,
  ADD COLUMN IF NOT EXISTS host_staff_id         uuid REFERENCES public.staff_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visitor_type          text DEFAULT 'other'
    CHECK (visitor_type IN ('contractor','supplier','parent','government','other')),
  ADD COLUMN IF NOT EXISTS company               text,
  ADD COLUMN IF NOT EXISTS vehicle_reg           text,
  ADD COLUMN IF NOT EXISTS expected_duration_minutes integer DEFAULT 60,
  ADD COLUMN IF NOT EXISTS overstay_alerted      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned                boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ban_reason            text,
  ADD COLUMN IF NOT EXISTS check_in_time         timestamptz,
  ADD COLUMN IF NOT EXISTS check_out_time        timestamptz;

-- ── visitor_bans: fast lookup table for banned visitors ───────────────────────

CREATE TABLE IF NOT EXISTS public.visitor_bans (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id   uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  phone       text,
  id_number   text,
  reason      text NOT NULL,
  banned_by   uuid,
  banned_at   timestamptz DEFAULT now()
);

ALTER TABLE public.visitor_bans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "visitor_bans_school" ON public.visitor_bans;
CREATE POLICY "visitor_bans_school" ON public.visitor_bans
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

CREATE INDEX IF NOT EXISTS idx_visitor_bans_school_phone
  ON public.visitor_bans(school_id, phone);

-- ── gate_passes: add premium columns ─────────────────────────────────────────

ALTER TABLE public.gate_passes
  ADD COLUMN IF NOT EXISTS exit_code             text,
  ADD COLUMN IF NOT EXISTS destination           text,
  ADD COLUMN IF NOT EXISTS expected_return       timestamptz,
  ADD COLUMN IF NOT EXISTS expected_duration_minutes integer DEFAULT 60,
  ADD COLUMN IF NOT EXISTS exit_time             timestamptz,
  ADD COLUMN IF NOT EXISTS actual_return         timestamptz,
  ADD COLUMN IF NOT EXISTS late_alerted          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_notified       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS exit_pin              text,
  ADD COLUMN IF NOT EXISTS pin_expires_at        timestamptz;

-- ── student_wallets: add freeze + today_spent columns ────────────────────────

ALTER TABLE public.student_wallets
  ADD COLUMN IF NOT EXISTS today_spent   numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS frozen_by     uuid,
  ADD COLUMN IF NOT EXISTS frozen_at     timestamptz,
  ADD COLUMN IF NOT EXISTS freeze_reason text;

-- ── exeat_requests ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.exeat_requests (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id          uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id         uuid NOT NULL REFERENCES public.students(id),
  parent_id          uuid,
  reason             text NOT NULL,
  destination        text NOT NULL,
  leave_date         date NOT NULL,
  return_date        date NOT NULL,
  leave_type         text DEFAULT 'day'
    CHECK (leave_type IN ('day','overnight','weekend','holiday','medical','emergency')),
  status             text DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','completed')),
  gate_code          text,
  approved_by        uuid,
  approved_at        timestamptz,
  rejection_reason   text,
  created_at         timestamptz DEFAULT now()
);

ALTER TABLE public.exeat_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exeat_school" ON public.exeat_requests;
CREATE POLICY "exeat_school" ON public.exeat_requests
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

CREATE INDEX IF NOT EXISTS idx_exeat_school_date
  ON public.exeat_requests(school_id, leave_date, status);

-- ── nts_attendance_log: add SMS-source columns ───────────────────────────────

ALTER TABLE public.nts_attendance_log
  ADD COLUMN IF NOT EXISTS source       text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS raw_message  text,
  ADD COLUMN IF NOT EXISTS phone_from   text,
  ADD COLUMN IF NOT EXISTS device_id    text,
  ADD COLUMN IF NOT EXISTS recorded_at  timestamptz DEFAULT now();

-- ── pg_cron jobs ──────────────────────────────────────────────────────────────

DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Visitor overstay alert (every 15 minutes)
    PERFORM cron.schedule(
      'visitor-overstay-check',
      '*/15 * * * *',
      $cron$
        INSERT INTO public.notices (school_id, title, content, target_audience, created_at)
        SELECT vl.school_id,
               'Visitor Overstay Alert',
               'Visitor ' || COALESCE(vl.visitor_name, vl.full_name, 'Unknown') ||
               ' (Purpose: ' || vl.purpose || ') has been on premises for ' ||
               EXTRACT(EPOCH FROM (now() - vl.check_in_time))::integer / 60 ||
               ' minutes. Expected: ' || COALESCE(vl.expected_duration_minutes::text, '60') || ' min.',
               'security',
               now()
        FROM public.visitor_log vl
        WHERE vl.check_out_time IS NULL
          AND vl.overstay_alerted = false
          AND vl.expected_duration_minutes IS NOT NULL
          AND now() > vl.check_in_time + (vl.expected_duration_minutes * interval '1 minute')
          AND DATE(vl.check_in_time AT TIME ZONE 'Africa/Nairobi') = CURRENT_DATE;

        UPDATE public.visitor_log SET overstay_alerted = true
        WHERE check_out_time IS NULL
          AND overstay_alerted = false
          AND expected_duration_minutes IS NOT NULL
          AND now() > check_in_time + (expected_duration_minutes * interval '1 minute')
          AND DATE(check_in_time AT TIME ZONE 'Africa/Nairobi') = CURRENT_DATE;
      $cron$
    );

    -- Gate pass late return alert (every 10 minutes)
    PERFORM cron.schedule(
      'gate-pass-late-check',
      '*/10 * * * *',
      $cron$
        INSERT INTO public.notices (school_id, title, content, target_audience, created_at)
        SELECT gp.school_id,
               'Student Late Return',
               s.full_name || ' (' || s.class_name || ') is overdue from gate pass. Expected: ' ||
               to_char(gp.expected_return AT TIME ZONE 'Africa/Nairobi', 'HH12:MI AM'),
               'dean',
               now()
        FROM public.gate_passes gp
        JOIN public.students s ON s.id = gp.student_id
        WHERE gp.status = 'active'
          AND gp.expected_return < now()
          AND gp.late_alerted = false
          AND DATE(gp.exit_time AT TIME ZONE 'Africa/Nairobi') = CURRENT_DATE;

        UPDATE public.gate_passes SET status = 'late', late_alerted = true
        WHERE status = 'active'
          AND expected_return < now()
          AND late_alerted = false
          AND DATE(exit_time AT TIME ZONE 'Africa/Nairobi') = CURRENT_DATE;
      $cron$
    );

    -- Wallet daily reset at midnight (Nairobi time = UTC+3, so 21:00 UTC)
    PERFORM cron.schedule(
      'wallet-daily-reset',
      '0 21 * * *',
      $cron$
        UPDATE public.student_wallets SET today_spent = 0;
      $cron$
    );

  END IF;
END
$outer$;
