-- Phase 8 — Parent PWA: auth_rate_limits, parent_query_logs, pta_ballots, pta_votes

-- ── auth_rate_limits — stores short-lived OTPs for phone-based parent auth ────

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  phone      text NOT NULL,
  school_id  uuid,
  otp_code   text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts   integer DEFAULT 0,
  used       boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.auth_rate_limits
  ADD COLUMN IF NOT EXISTS school_id  uuid,
  ADD COLUMN IF NOT EXISTS attempts   integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS used       boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_rate_limits_phone
  ON public.auth_rate_limits(phone, created_at DESC);

-- No RLS: accessed only by service role during auth flow

-- Auto-expire: purge entries older than 30 minutes
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'purge-expired-otps',
      '*/30 * * * *',
      $cron$DELETE FROM public.auth_rate_limits WHERE expires_at < now() - interval '5 minutes';$cron$
    );
  END IF;
END
$outer$;

-- ── parent_query_logs — staff visibility into parent chat activity ─────────────

CREATE TABLE IF NOT EXISTS public.parent_query_logs (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  parent_phone text NOT NULL,
  student_id   uuid REFERENCES public.students(id) ON DELETE SET NULL,
  query_text   text NOT NULL,
  response_summary text,
  context_type text,
  language     text DEFAULT 'en',
  sentiment    text DEFAULT 'neutral'
    CHECK (sentiment IN ('concerned', 'neutral', 'positive')),
  topics       jsonb DEFAULT '[]',
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.parent_query_logs
  ADD COLUMN IF NOT EXISTS response_summary text,
  ADD COLUMN IF NOT EXISTS context_type     text,
  ADD COLUMN IF NOT EXISTS language         text DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS sentiment        text DEFAULT 'neutral',
  ADD COLUMN IF NOT EXISTS topics           jsonb DEFAULT '[]';

CREATE INDEX IF NOT EXISTS idx_pql_school
  ON public.parent_query_logs(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pql_student
  ON public.parent_query_logs(school_id, student_id, created_at DESC);

ALTER TABLE public.parent_query_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pql_staff_read" ON public.parent_query_logs;
CREATE POLICY "pql_staff_read" ON public.parent_query_logs
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── pta_ballots ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pta_ballots (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text,
  options         jsonb NOT NULL DEFAULT '[]',
  closing_at      timestamptz NOT NULL,
  min_fee_percent integer DEFAULT 0
    CHECK (min_fee_percent BETWEEN 0 AND 100),
  status          text DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'closed')),
  created_by      uuid,
  created_at      timestamptz DEFAULT now()
);

-- Add columns that may be missing if table existed before this migration
ALTER TABLE public.pta_ballots
  ADD COLUMN IF NOT EXISTS status          text DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'closed')),
  ADD COLUMN IF NOT EXISTS min_fee_percent integer DEFAULT 0
    CHECK (min_fee_percent BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS description     text,
  ADD COLUMN IF NOT EXISTS options         jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS created_by      uuid;

CREATE INDEX IF NOT EXISTS idx_pta_ballots_school
  ON public.pta_ballots(school_id, status, closing_at DESC);

ALTER TABLE public.pta_ballots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pta_ballots_school" ON public.pta_ballots;
CREATE POLICY "pta_ballots_school" ON public.pta_ballots
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id())
  WITH CHECK (school_id = public.get_my_school_id());

-- ── pta_votes — UNIQUE(ballot_id, parent_phone) prevents double-voting ─────────

CREATE TABLE IF NOT EXISTS public.pta_votes (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ballot_id    uuid NOT NULL REFERENCES public.pta_ballots(id) ON DELETE CASCADE,
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  parent_phone text NOT NULL,
  vote_choice  text NOT NULL,
  voted_at     timestamptz DEFAULT now(),
  UNIQUE (ballot_id, parent_phone)
);

CREATE INDEX IF NOT EXISTS idx_pta_votes_ballot
  ON public.pta_votes(ballot_id);

ALTER TABLE public.pta_votes ENABLE ROW LEVEL SECURITY;

-- Votes are write-only for parents (via service role in API); staff can read
DROP POLICY IF EXISTS "pta_votes_staff_read" ON public.pta_votes;
CREATE POLICY "pta_votes_staff_read" ON public.pta_votes
  FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());
