-- Fix broken RLS helper functions that reference non-existent columns
-- or the legacy Clerk-era profiles table.

-- 1. get_my_role() — was COALESCE(sub_role, role) but staff_records has no 'role' column
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT sub_role
  FROM   public.staff_records
  WHERE  user_id = auth.uid()::text
  LIMIT  1;
$$;

-- 2. current_school_id() — was querying profiles.clerk_user_id which never matches
--    Supabase auth UIDs; align with get_my_school_id() which already works
CREATE OR REPLACE FUNCTION current_school_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT school_id
  FROM   public.staff_records
  WHERE  user_id = auth.uid()::text
  LIMIT  1;
$$;

-- 3. is_leadership() — was reading profiles.role (Clerk-era USER-DEFINED type)
CREATE OR REPLACE FUNCTION is_leadership()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT sub_role = ANY(ARRAY[
    'principal','deputy_principal','dean_of_studies',
    'dean_of_students','deputy_dean_of_studies','deputy_principal_academic'
  ])
  FROM public.staff_records
  WHERE user_id = auth.uid()::text
  LIMIT 1;
$$;

-- 4. is_super_admin() — was reading profiles.role
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT sub_role = 'super_admin'
  FROM public.staff_records
  WHERE user_id = auth.uid()::text
  LIMIT 1;
$$;
