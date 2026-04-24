-- Phase 4 — G&C sanctuary tables + immutable daily diary

-- ── counselling_logs ──────────────────────────────────────────────────────────
-- Used by /talk public endpoint. Separate from anonymous_referrals.

CREATE TABLE IF NOT EXISTS public.counselling_logs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id     uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  student_name  text,
  class_name    text,
  content       text NOT NULL,
  is_anonymous  boolean DEFAULT true,
  source        text DEFAULT 'self_referral_qr'
    CHECK (source IN ('self_referral_qr','whatsapp','counselor','teacher_referral')),
  status        text DEFAULT 'new'
    CHECK (status IN ('new','acknowledged','in_progress','resolved','escalated')),
  counselor_id  uuid,
  created_at    timestamptz DEFAULT now()
);

-- Add columns that may be missing from pre-existing table
ALTER TABLE public.counselling_logs
  ADD COLUMN IF NOT EXISTS student_name text,
  ADD COLUMN IF NOT EXISTS class_name   text,
  ADD COLUMN IF NOT EXISTS content      text,
  ADD COLUMN IF NOT EXISTS is_anonymous boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS source       text DEFAULT 'self_referral_qr',
  ADD COLUMN IF NOT EXISTS status       text DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS counselor_id uuid,
  ADD COLUMN IF NOT EXISTS created_at   timestamptz DEFAULT now();

ALTER TABLE public.counselling_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "counselling_logs_school" ON public.counselling_logs;
CREATE POLICY "counselling_logs_school" ON public.counselling_logs
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

CREATE INDEX IF NOT EXISTS idx_counselling_logs_school
  ON public.counselling_logs(school_id, created_at DESC);

-- ── gc_access_log ─────────────────────────────────────────────────────────────
-- Tracks principal requests to access counselling case notes.

CREATE TABLE IF NOT EXISTS public.gc_access_log (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id          uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  case_id            uuid,
  counselling_log_id uuid REFERENCES public.counselling_logs(id),
  requested_by       uuid NOT NULL,
  accessor_role      text DEFAULT 'principal',
  request_reason     text,
  requested_at       timestamptz DEFAULT now(),
  authorized_at      timestamptz,
  authorized_by      uuid,
  declined_at        timestamptz,
  declined_by        uuid,
  decline_reason     text,
  expires_at         timestamptz,
  approved_by        uuid,
  approved_at        timestamptz,
  access_expires_at  timestamptz,
  action             text,
  status             text DEFAULT 'pending'
    CHECK (status IN ('pending','approved','denied','expired')),
  created_at         timestamptz DEFAULT now()
);

-- Add missing columns to pre-existing table
ALTER TABLE public.gc_access_log
  ADD COLUMN IF NOT EXISTS counselling_log_id uuid,
  ADD COLUMN IF NOT EXISTS accessor_role      text DEFAULT 'principal',
  ADD COLUMN IF NOT EXISTS requested_at       timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS authorized_by      uuid,
  ADD COLUMN IF NOT EXISTS declined_at        timestamptz,
  ADD COLUMN IF NOT EXISTS declined_by        uuid,
  ADD COLUMN IF NOT EXISTS decline_reason     text,
  ADD COLUMN IF NOT EXISTS approved_by        uuid,
  ADD COLUMN IF NOT EXISTS approved_at        timestamptz,
  ADD COLUMN IF NOT EXISTS access_expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS status             text DEFAULT 'pending';

ALTER TABLE public.gc_access_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gc_log_principal_counsellor" ON public.gc_access_log;
CREATE POLICY "gc_log_principal_counsellor" ON public.gc_access_log
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

-- ── school_daily_diary ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.school_daily_diary (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  diary_date     date NOT NULL,
  content        jsonb NOT NULL DEFAULT '{}',
  sealed         boolean DEFAULT false,
  sealed_at      timestamptz,
  sealed_by      uuid,
  document_hash  text,
  pdf_url        text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now(),
  UNIQUE(school_id, diary_date)
);

ALTER TABLE public.school_daily_diary ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "diary_school" ON public.school_daily_diary;
CREATE POLICY "diary_school" ON public.school_daily_diary
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

CREATE INDEX IF NOT EXISTS idx_diary_school_date
  ON public.school_daily_diary(school_id, diary_date DESC);

-- ── trigger: prevent_diary_update ────────────────────────────────────────────
-- Once sealed, diary entries are immutable.

CREATE OR REPLACE FUNCTION public.prevent_diary_update()
RETURNS TRIGGER AS $outer$
BEGIN
  IF OLD.sealed = true THEN
    RAISE EXCEPTION 'Diary entry for % is sealed (sealed at %) — immutable', OLD.diary_date, OLD.sealed_at;
  END IF;
  RETURN NEW;
END;
$outer$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_diary_update ON public.school_daily_diary;
CREATE TRIGGER trg_prevent_diary_update
  BEFORE UPDATE ON public.school_daily_diary
  FOR EACH ROW EXECUTE FUNCTION public.prevent_diary_update();
