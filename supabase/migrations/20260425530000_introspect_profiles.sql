-- Introspect auth.users count, profiles structure, and seed a profile if possible
DO $$
DECLARE
  v_auth_id uuid;
  v_auth_email text;
  r record;
BEGIN
  -- Show profiles columns
  FOR r IN
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
    ORDER BY ordinal_position
  LOOP
    RAISE NOTICE 'profiles COL:% TYPE:% NULL:% DEFAULT:%',
      r.column_name, r.data_type, r.is_nullable, r.column_default;
  END LOOP;

  -- Count auth users
  SELECT id, email INTO v_auth_id, v_auth_email FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_auth_id IS NULL THEN
    RAISE NOTICE 'auth.users: 0 rows';
  ELSE
    RAISE NOTICE 'auth.users first row: id=% email=%', v_auth_id, v_auth_email;
  END IF;

  -- Count profiles
  RAISE NOTICE 'profiles count: %', (SELECT COUNT(*) FROM public.profiles);
END $$;
