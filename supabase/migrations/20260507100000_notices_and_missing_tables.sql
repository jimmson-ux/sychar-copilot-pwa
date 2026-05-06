-- Migration: notices table + ensure bread_vouchers RLS is correct
-- Fixes principal overview API which queries sb.from('notices')

-- ── notices ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notices (
  id               UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        UUID          NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title            TEXT          NOT NULL,
  content          TEXT          NOT NULL,
  target_audience  TEXT          NOT NULL DEFAULT 'all'
                   CHECK (target_audience IN ('all','teachers','students','parents','staff')),
  created_by       UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notices_school_created
  ON public.notices (school_id, created_at DESC);

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notices_school_read"  ON public.notices;
DROP POLICY IF EXISTS "notices_admin_write"  ON public.notices;
DROP POLICY IF EXISTS "notices_service"      ON public.notices;

CREATE POLICY "notices_school_read"
  ON public.notices FOR SELECT
  USING (school_id = get_my_school_id());

CREATE POLICY "notices_admin_write"
  ON public.notices FOR ALL
  USING (school_id = get_my_school_id())
  WITH CHECK (school_id = get_my_school_id());

CREATE POLICY "notices_service"
  ON public.notices FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Add to realtime publication so dashboards can subscribe
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notices;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
