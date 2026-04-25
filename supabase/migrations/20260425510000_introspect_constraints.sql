-- Introspect check constraints and FK targets for marks, discipline_records, notices
DO $$
DECLARE r record;
BEGIN
  -- Check constraint definitions
  FOR r IN
    SELECT tc.table_name, tc.constraint_name, cc.check_clause
    FROM information_schema.table_constraints tc
    JOIN information_schema.check_constraints cc
      ON cc.constraint_name = tc.constraint_name
    WHERE tc.table_schema = 'public'
      AND tc.table_name IN ('marks','discipline_records','notices')
      AND tc.constraint_type = 'CHECK'
    ORDER BY tc.table_name, tc.constraint_name
  LOOP
    RAISE NOTICE 'CHECK %: % → %', r.table_name, r.constraint_name, r.check_clause;
  END LOOP;

  -- FK targets for marks.recorded_by
  FOR r IN
    SELECT
      kcu.column_name,
      ccu.table_name  AS foreign_table,
      ccu.column_name AS foreign_column
    FROM information_schema.key_column_usage kcu
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = rc.unique_constraint_name
    WHERE kcu.table_schema = 'public'
      AND kcu.table_name = 'marks'
      AND kcu.column_name = 'recorded_by'
  LOOP
    RAISE NOTICE 'marks.recorded_by FK → %.%', r.foreign_table, r.foreign_column;
  END LOOP;
END $$;
