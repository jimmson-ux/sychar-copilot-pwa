-- ================================================================
-- SESSION MONITORING, PUSH SUBSCRIPTIONS, SCHEDULE OVERRIDES
-- 2026-05-27
--
-- New tables:
--   push_subscriptions          — teacher browser VAPID subscriptions
--   active_schedule_overrides   — deputy live lesson adjustments
-- New view:
--   current_lesson_view         — timetable_periods + today's overrides
-- New columns:
--   staff_records.device_fingerprint
--   class_qr_tokens.anchor_wifi_bssid / wifi_signal_threshold
-- New trigger:
--   trg_low_stock_alert         — fires when inventory stock ≤ reorder_point
-- New cron:
--   lesson-reminders            — every 5 minutes, push pre-lesson alerts
-- ================================================================


-- ── 1. PUSH SUBSCRIPTIONS ─────────────────────────────────────────
-- Staff browser VAPID subscriptions consumed by the send-push edge fn.
-- send-push/index.ts queries: endpoint, p256dh, auth, staff_id
--
-- NOTE: push_subscriptions was created in 20260426100000_magic_auth with
-- a minimal schema (user_id text, subscription jsonb). We extend it here
-- with the individual VAPID columns that send-push/index.ts expects.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid        REFERENCES public.schools(id) ON DELETE CASCADE,
  endpoint   text,
  created_at timestamptz DEFAULT now()
);

-- Extend pre-existing table with new columns required by send-push
ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS staff_id   uuid REFERENCES public.staff_records(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS p256dh     text,
  ADD COLUMN IF NOT EXISTS auth       text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Unique constraint (may already exist as a different name — use DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'push_sub_unique'
      AND conrelid = 'public.push_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_sub_unique UNIQUE (staff_id, endpoint);
  END IF;
EXCEPTION WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_ps_school ON public.push_subscriptions (school_id);
CREATE INDEX IF NOT EXISTS idx_ps_staff  ON public.push_subscriptions (staff_id)
  WHERE staff_id IS NOT NULL;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ps_owner"   ON public.push_subscriptions;
DROP POLICY IF EXISTS "ps_service" ON public.push_subscriptions;

CREATE POLICY "ps_owner" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (
    staff_id IN (
      SELECT id FROM public.staff_records WHERE user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    staff_id IN (
      SELECT id FROM public.staff_records WHERE user_id = auth.uid()::text
    )
  );

CREATE POLICY "ps_service" ON public.push_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 2. ACTIVE SCHEDULE OVERRIDES ─────────────────────────────────
-- Deputy live adjustments: swap teacher or room for one lesson on a
-- specific date without deleting the original timetable row.

CREATE TABLE IF NOT EXISTS public.active_schedule_overrides (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id          uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  original_lesson_id uuid        NOT NULL REFERENCES public.timetable_periods(id) ON DELETE CASCADE,
  override_date      date        NOT NULL DEFAULT CURRENT_DATE,
  new_teacher_id     uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  new_room           text,
  override_reason    text,
  created_by         uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  is_active          boolean     DEFAULT true,
  created_at         timestamptz DEFAULT now(),
  CONSTRAINT aso_unique_per_day UNIQUE (original_lesson_id, override_date)
);

CREATE INDEX IF NOT EXISTS idx_aso_school_date
  ON public.active_schedule_overrides (school_id, override_date DESC);
CREATE INDEX IF NOT EXISTS idx_aso_new_teacher
  ON public.active_schedule_overrides (new_teacher_id, override_date DESC)
  WHERE new_teacher_id IS NOT NULL;

ALTER TABLE public.active_schedule_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_schedule_overrides REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "aso_school_read"  ON public.active_schedule_overrides;
DROP POLICY IF EXISTS "aso_deputy_write" ON public.active_schedule_overrides;
DROP POLICY IF EXISTS "aso_service"      ON public.active_schedule_overrides;

CREATE POLICY "aso_school_read" ON public.active_schedule_overrides
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "aso_deputy_write" ON public.active_schedule_overrides
  FOR ALL TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'deputy_principal','deputy_principal_academic','dean_of_studies',
      'principal','super_admin'
    )
  )
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() IN (
      'deputy_principal','deputy_principal_academic','dean_of_studies',
      'principal','super_admin'
    )
  );

CREATE POLICY "aso_service" ON public.active_schedule_overrides
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'active_schedule_overrides'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.active_schedule_overrides;
  END IF;
END $$;


-- ── 3. CURRENT LESSON VIEW ────────────────────────────────────────
-- Merges timetable_periods with today's active_schedule_overrides.
-- Consumers use effective_teacher_id and effective_room for live schedule.

CREATE OR REPLACE VIEW public.current_lesson_view AS
SELECT
  tp.id                AS period_id,
  tp.school_id,
  tp.academic_year,
  tp.term,
  tp.class_id,
  tp.class_name,
  tp.subject,
  tp.day_of_week,
  tp.period_number,
  tp.start_time,
  tp.end_time,
  tp.period_type,
  tp.room              AS original_room,
  tp.is_covered,
  tp.covered_by_id,
  tp.is_active,
  COALESCE(aso.new_teacher_id, tp.teacher_id) AS effective_teacher_id,
  COALESCE(aso.new_room,       tp.room)       AS effective_room,
  (aso.id IS NOT NULL)                        AS is_overridden,
  aso.id                                      AS override_id,
  aso.override_reason,
  aso.created_by                              AS override_created_by
FROM public.timetable_periods tp
LEFT JOIN public.active_schedule_overrides aso
  ON  aso.original_lesson_id = tp.id
  AND aso.override_date      = CURRENT_DATE
  AND aso.is_active          = true;


-- ── 4. STAFF DEVICE FINGERPRINT ───────────────────────────────────
ALTER TABLE public.staff_records
  ADD COLUMN IF NOT EXISTS device_fingerprint text;


-- ── 5. WIFI BSSID CALIBRATION ─────────────────────────────────────
ALTER TABLE public.class_qr_tokens
  ADD COLUMN IF NOT EXISTS anchor_wifi_bssid     text,
  ADD COLUMN IF NOT EXISTS wifi_signal_threshold int DEFAULT -70;


-- ── 6. LOW-STOCK WATCHDOG TRIGGER ─────────────────────────────────
-- Fires AFTER UPDATE of current_stock when stock crosses reorder_point
-- downward. Calls low-stock-push edge function asynchronously.

CREATE OR REPLACE FUNCTION public.trg_fn_low_stock_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only alert on threshold-crossing (OLD above, NEW at/below)
  IF NEW.current_stock <= NEW.reorder_point
     AND OLD.current_stock > OLD.reorder_point THEN
    BEGIN
      PERFORM net.http_post(
        url     := 'https://xwgtsldimlrhtgvpnjnd.supabase.co/functions/v1/low-stock-push',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'x-cron-secret', current_setting('app.cron_secret', true)
        ),
        body := jsonb_build_object(
          'school_id',     NEW.school_id,
          'item_id',       NEW.id,
          'item_name',     NEW.name,
          'current_stock', NEW.current_stock,
          'reorder_point', NEW.reorder_point,
          'unit',          NEW.unit
        )
      );
    EXCEPTION WHEN others THEN
      NULL; -- never block a stock update because of a push failure
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_low_stock_alert ON public.inventory_items;
CREATE TRIGGER trg_low_stock_alert
  AFTER UPDATE OF current_stock ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_low_stock_alert();


-- ── 7. LESSON REMINDER CRON ───────────────────────────────────────
-- Every 5 minutes: push notifications to teachers whose lessons
-- start within the next 10 minutes.

SELECT cron.unschedule('lesson-reminders')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'lesson-reminders');

SELECT cron.schedule(
  'lesson-reminders',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://xwgtsldimlrhtgvpnjnd.supabase.co/functions/v1/lesson-reminders',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'x-cron-secret', current_setting('app.cron_secret', true)
      ),
      body := '{}'::jsonb
    );
  $$
);
