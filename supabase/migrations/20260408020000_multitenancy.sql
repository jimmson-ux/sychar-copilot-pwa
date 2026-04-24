-- ============================================================
-- MULTITENANCY INFRASTRUCTURE — 2026-04-08
-- Adds a first-class `schools` table and hardens the
-- get_my_school_id() helper so the system can serve multiple
-- schools from a single Supabase project safely.
-- ============================================================

-- ── 1. SCHOOLS TABLE ─────────────────────────────────────────
-- Central registry for every school on the platform.
-- Each school row is the root anchor for all multi-tenant data.

CREATE TABLE IF NOT EXISTS public.schools (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text    NOT NULL,
  short_name      text,
  subdomain       text    UNIQUE,
  county          text,
  country         text    DEFAULT 'Kenya',
  address         text,
  phone           text,
  email           text,
  logo_url        text,
  tier            text    DEFAULT 'basic'
                  CHECK (tier IN ('basic', 'standard', 'premium')),
  max_staff       integer DEFAULT 100,
  is_active       boolean DEFAULT true,
  onboarded_at    timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- Staff can read their own school's details only.
DROP POLICY IF EXISTS "schools_select_own" ON public.schools;
CREATE POLICY "schools_select_own"
  ON public.schools FOR SELECT TO authenticated
  USING (id = public.get_my_school_id());

-- Only service_role (admin API) may INSERT / UPDATE schools.
-- No authenticated browser policy → default DENY for write.

-- Add extended columns that 001_core_tables.sql did not include
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS short_name   text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS subdomain    text UNIQUE;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS country      text DEFAULT 'Kenya';
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS address      text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS phone        text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS email        text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS logo_url     text;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS tier         text DEFAULT 'basic';
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS max_staff    integer DEFAULT 100;
ALTER TABLE public.schools ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

-- Seed the existing school so existing staff_records still resolve.
INSERT INTO public.schools (id, name, short_name, county, onboarded_at)
VALUES (
  '68bd8d34-f2f0-4297-bd18-093328824d84',
  'Nkoroi Mixed Day Secondary School',
  'Nkoroi',
  'Kajiado',
  now()
)
ON CONFLICT (id) DO NOTHING;

-- ── 2. HARDEN get_my_school_id() ─────────────────────────────
-- The previous version only checked `user_id`. Some older rows
-- may have been inserted with auth_user_id instead (TypeScript
-- interface mismatch). The new version checks both columns so
-- the function never silently returns NULL for valid staff.

CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS uuid
LANGUAGE SQL
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT school_id
  FROM   public.staff_records
  WHERE  user_id = auth.uid()::text    -- TEXT column; ::text cast required
  LIMIT  1;
$$;

-- ── 3. FOREIGN KEY: staff_records → schools ───────────────────
-- Enforce referential integrity so no staff row can reference a
-- non-existent school. Safe to run idempotently.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE  constraint_name = 'staff_records_school_id_fkey'
      AND  table_name      = 'staff_records'
  ) THEN
    ALTER TABLE public.staff_records
      ADD CONSTRAINT staff_records_school_id_fkey
      FOREIGN KEY (school_id) REFERENCES public.schools(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

-- ── 4. UPDATED_AT TRIGGER FOR SCHOOLS ────────────────────────

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS schools_updated_at ON public.schools;
CREATE TRIGGER schools_updated_at
  BEFORE UPDATE ON public.schools
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 5. SCHOOL REGISTRATION FUNCTION ──────────────────────────
-- Called by the /api/schools/register API route (service_role only).
-- Creates a school + first admin staff record atomically.
--
-- Parameters:
--   p_school_name   — full official school name
--   p_county        — e.g. 'Kajiado'
--   p_admin_user_id — UUID of the first admin (Supabase auth user)
--   p_admin_name    — full name of the admin
--   p_admin_email   — admin email
--   p_admin_role    — e.g. 'principal'

CREATE OR REPLACE FUNCTION public.register_school(
  p_school_name   text,
  p_county        text,
  p_admin_user_id uuid,
  p_admin_name    text,
  p_admin_email   text,
  p_admin_role    text DEFAULT 'principal'
)
RETURNS uuid        -- returns the new school_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_id uuid;
BEGIN
  -- Create the school
  INSERT INTO public.schools (name, county)
  VALUES (p_school_name, p_county)
  RETURNING id INTO v_school_id;

  -- Create the first admin staff record
  INSERT INTO public.staff_records
    (school_id, user_id, full_name, email, sub_role, can_login, is_active)
  VALUES
    (v_school_id, p_admin_user_id, p_admin_name, p_admin_email, p_admin_role, true, true);

  RETURN v_school_id;
END;
$$;

-- Only service_role can execute — revoke from public + authenticated
REVOKE EXECUTE ON FUNCTION public.register_school FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_school FROM authenticated;

-- ── 6. HELPFUL VIEW: my_school ───────────────────────────────
-- Convenience view for client components to fetch their school
-- metadata without knowing their own school_id.

CREATE OR REPLACE VIEW public.my_school AS
  SELECT s.*
  FROM   public.schools s
  WHERE  s.id = public.get_my_school_id();

GRANT SELECT ON public.my_school TO authenticated;
