-- Get valid values for the profiles.role enum
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT e.enumlabel
    FROM pg_catalog.pg_type t
    JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = (
      SELECT udt_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
    )
    ORDER BY e.enumsortorder
  LOOP
    RAISE NOTICE 'profiles.role enum value: %', r.enumlabel;
  END LOOP;
END $$;
