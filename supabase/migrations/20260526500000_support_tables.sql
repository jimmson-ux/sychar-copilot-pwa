-- ================================================================
-- SUPPORT TABLES — 2026-05-26
--
-- Creates tables referenced by the timetable engine sprint:
--   pwa_notifications — notification queue for parents + staff
--   duty_remarks      — Teacher on Duty daily narrative log
-- ================================================================


-- ── 1. PWA NOTIFICATIONS ─────────────────────────────────────────
-- Queue for web-push notifications to parents (via student_id)
-- and staff (via teacher_id). Delivered by push edge functions.

CREATE TABLE IF NOT EXISTS public.pwa_notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id   uuid        REFERENCES public.students(id)      ON DELETE CASCADE,
  teacher_id   uuid        REFERENCES public.staff_records(id) ON DELETE CASCADE,
  title        text        NOT NULL,
  message      text        NOT NULL,
  type         text        DEFAULT 'general',
  severity     text        DEFAULT 'Normal'
    CHECK (severity IN ('Normal','Amber','Red')),
  url          text,
  requires_interaction boolean DEFAULT false,
  is_sent      boolean     DEFAULT false,
  sent_at      timestamptz,
  is_read      boolean     DEFAULT false,
  read_at      timestamptz,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pwa_student_unread
  ON public.pwa_notifications (student_id, is_read, created_at DESC)
  WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pwa_teacher_unread
  ON public.pwa_notifications (teacher_id, is_read, created_at DESC)
  WHERE teacher_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pwa_school_unsent
  ON public.pwa_notifications (school_id, is_sent, created_at ASC)
  WHERE is_sent = false;

ALTER TABLE public.pwa_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pwa_school_read"    ON public.pwa_notifications;
DROP POLICY IF EXISTS "pwa_service"        ON public.pwa_notifications;

-- Staff can read their own notifications; principals see school-wide
CREATE POLICY "pwa_school_read" ON public.pwa_notifications
  FOR SELECT TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND (
      teacher_id = (
        SELECT id FROM public.staff_records
        WHERE user_id = auth.uid()::text LIMIT 1
      )
      OR public.get_my_role() IN ('principal','deputy_principal','super_admin')
    )
  );

CREATE POLICY "pwa_service" ON public.pwa_notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.pwa_notifications REPLICA IDENTITY FULL;


-- ── 2. DUTY REMARKS ──────────────────────────────────────────────
-- Teacher on Duty daily log: incidents, observations, follow-ups.
-- Separate from duty_rosters (schedule) and duty_log (EWS records).

CREATE TABLE IF NOT EXISTS public.duty_remarks (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid        REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id       uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  duty_date        date        NOT NULL DEFAULT CURRENT_DATE,
  duty_week_start  date,
  category         text        NOT NULL DEFAULT 'General',
  remark           text        NOT NULL,
  severity         text        DEFAULT 'Normal',
  requires_followup boolean    DEFAULT false,
  followup_by      uuid        REFERENCES public.staff_records(id) ON DELETE SET NULL,
  resolved_at      timestamptz,
  created_at       timestamptz DEFAULT now()
);

-- Ensure all required columns exist on pre-existing table
ALTER TABLE public.duty_remarks
  ADD COLUMN IF NOT EXISTS school_id        uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS teacher_id       uuid REFERENCES public.staff_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duty_date        date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS duty_week_start  date,
  ADD COLUMN IF NOT EXISTS category         text DEFAULT 'General',
  ADD COLUMN IF NOT EXISTS remark           text,
  ADD COLUMN IF NOT EXISTS severity         text DEFAULT 'Normal',
  ADD COLUMN IF NOT EXISTS requires_followup boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_by      uuid REFERENCES public.staff_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at      timestamptz,
  ADD COLUMN IF NOT EXISTS created_at       timestamptz DEFAULT now();

-- Indexes use partial clauses to avoid failures on nullable columns
CREATE INDEX IF NOT EXISTS idx_dr_school_week
  ON public.duty_remarks (school_id, duty_week_start DESC, duty_date DESC)
  WHERE school_id IS NOT NULL AND duty_week_start IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dr_teacher
  ON public.duty_remarks (teacher_id, duty_date DESC)
  WHERE teacher_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dr_followup
  ON public.duty_remarks (school_id, requires_followup, resolved_at)
  WHERE requires_followup = true;

ALTER TABLE public.duty_remarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dr_school_read"    ON public.duty_remarks;
DROP POLICY IF EXISTS "dr_teacher_write"  ON public.duty_remarks;
DROP POLICY IF EXISTS "dr_service"        ON public.duty_remarks;

CREATE POLICY "dr_school_read" ON public.duty_remarks
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "dr_teacher_write" ON public.duty_remarks
  FOR INSERT TO authenticated
  WITH CHECK (school_id = public.get_my_school_id());

CREATE POLICY "dr_service" ON public.duty_remarks
  FOR ALL TO service_role USING (true) WITH CHECK (true);
