-- ================================================================
-- NKOROI COMPLETE AUTH + TENANT FIX — 2026-05-09
--
-- Fixes:
--  1. Slug 'nkoroi' → 'nkoroimixed' (proxy was redirecting everyone
--     to sychar.co.ke because slug didn't match subdomain)
--  2. Ensure tenant_configs readable by anon (proxy uses anon key)
--  3. Randomise pre-seeded passwords → Google-OAuth-only from now on
--  4. Clear force_password_change for ALL Nkoroi staff
--  5. Ensure is_active + can_login = true for all Nkoroi staff
--  6. Link NULL user_id staff rows to auth.users by email
-- ================================================================


-- ── 1. Fix the slug ───────────────────────────────────────────────────────────

UPDATE public.tenant_configs
SET    slug = 'nkoroimixed'
WHERE  school_id = '68bd8d34-f2f0-4297-bd18-093328824d84';


-- ── 2. Ensure tenant_configs is readable by anon ─────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'tenant_configs'
  ) THEN
    ALTER TABLE public.tenant_configs ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "tenant_configs_anon_select" ON public.tenant_configs;
    CREATE POLICY "tenant_configs_anon_select"
      ON public.tenant_configs
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;


-- ── 3. Randomise pre-seeded passwords (cast via text to handle UUID or TEXT
--        user_id columns — live DB has TEXT, schema says UUID) ────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'users'
  ) THEN
    -- Join via text comparison so this works regardless of user_id column type
    UPDATE auth.users au
    SET    encrypted_password = crypt(
             gen_random_uuid()::text || gen_random_uuid()::text,
             gen_salt('bf', 10)
           )
    FROM   public.staff_records sr
    WHERE  sr.school_id           = '68bd8d34-f2f0-4297-bd18-093328824d84'
      AND  sr.user_id             IS NOT NULL
      AND  au.id::text            = sr.user_id::text
      AND  au.encrypted_password  IS NOT NULL
      AND  au.encrypted_password  != '';
  END IF;
END $$;


-- ── 4. Clear force_password_change for ALL Nkoroi staff ──────────────────────

UPDATE public.staff_records
SET    force_password_change = false
WHERE  school_id = '68bd8d34-f2f0-4297-bd18-093328824d84';


-- ── 5. Ensure is_active + can_login columns exist and are true ───────────────

ALTER TABLE public.staff_records
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_login BOOLEAN DEFAULT true;

UPDATE public.staff_records
SET    is_active = true,
       can_login = true
WHERE  school_id = '68bd8d34-f2f0-4297-bd18-093328824d84';


-- ── 6. Link unlinked staff_records to auth.users by email ────────────────────
--
-- Handles both UUID and TEXT user_id columns via dynamic SQL.

ALTER TABLE public.staff_records
  ADD COLUMN IF NOT EXISTS email TEXT;

DO $$
DECLARE
  v_col_type text;
BEGIN
  SELECT data_type INTO v_col_type
  FROM   information_schema.columns
  WHERE  table_schema = 'public'
    AND  table_name   = 'staff_records'
    AND  column_name  = 'user_id';

  IF v_col_type = 'uuid' THEN
    UPDATE public.staff_records sr
    SET    user_id = au.id
    FROM   auth.users au
    WHERE  sr.school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'
      AND  sr.user_id   IS NULL
      AND  sr.email     IS NOT NULL
      AND  lower(au.email) = lower(sr.email);
  ELSE
    UPDATE public.staff_records sr
    SET    user_id = au.id::text
    FROM   auth.users au
    WHERE  sr.school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'
      AND  sr.user_id   IS NULL
      AND  sr.email     IS NOT NULL
      AND  lower(au.email) = lower(sr.email);
  END IF;
END $$;


-- ── Verification ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_slug      text;
  v_staff_cnt int;
  v_linked    int;
BEGIN
  SELECT slug INTO v_slug
  FROM   public.tenant_configs
  WHERE  school_id = '68bd8d34-f2f0-4297-bd18-093328824d84';

  SELECT COUNT(*) INTO v_staff_cnt
  FROM   public.staff_records
  WHERE  school_id = '68bd8d34-f2f0-4297-bd18-093328824d84';

  SELECT COUNT(*) INTO v_linked
  FROM   public.staff_records
  WHERE  school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'
    AND  user_id   IS NOT NULL;

  RAISE NOTICE 'slug             : %', v_slug;
  RAISE NOTICE 'total staff rows : %', v_staff_cnt;
  RAISE NOTICE 'linked user_ids  : % / %', v_linked, v_staff_cnt;
END $$;
