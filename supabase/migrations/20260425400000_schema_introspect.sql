-- Diagnostic: emit column names for problematic tables via RAISE NOTICE
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('fee_balances','marks','attendance_records','discipline_records','notices','fee_records')
    ORDER BY table_name, ordinal_position
  LOOP
    RAISE NOTICE 'TABLE:% COL:% TYPE:% NULL:% DEFAULT:%',
      r.table_name, r.column_name, r.data_type, r.is_nullable, r.column_default;
  END LOOP;
END $$;
