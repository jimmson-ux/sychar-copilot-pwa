-- Phase 1 schema additions
-- 1. Extend schools table with theming columns
-- 2. Extend staff_records with force_password_change
-- 3. Allow public read on schools for login-page theming

ALTER TABLE public.schools
  ADD COLUMN IF NOT EXISTS secondary_color  TEXT    NOT NULL DEFAULT '#059669',
  ADD COLUMN IF NOT EXISTS login_style      TEXT    NOT NULL DEFAULT 'clean',
  ADD COLUMN IF NOT EXISTS banner_url       TEXT;

ALTER TABLE public.staff_records
  ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT FALSE;

-- Public (anon) read on schools — needed by /api/school-theme (public endpoint)
-- Row is filtered by NEXT_PUBLIC_SCHOOL_ID at the API layer, not by RLS.
-- Authenticated users already have access via existing policies.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'schools'
      AND policyname = 'schools_public_read'
  ) THEN
    CREATE POLICY "schools_public_read"
      ON public.schools FOR SELECT TO anon
      USING (true);
  END IF;
END $$;

-- Ensure RLS is enabled on schools
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
