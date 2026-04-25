-- Inspect triggers on the marks table
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.trigger_name, t.event_manipulation, t.action_timing,
           p.prosrc AS function_body
    FROM information_schema.triggers t
    JOIN pg_catalog.pg_trigger pt
      ON pt.tgname = t.trigger_name
    JOIN pg_catalog.pg_proc p
      ON p.oid = pt.tgfoid
    WHERE t.event_object_schema = 'public'
      AND t.event_object_table = 'marks'
  LOOP
    RAISE NOTICE 'TRIGGER % % % BODY:%..',
      r.trigger_name, r.action_timing, r.event_manipulation,
      LEFT(r.function_body, 300);
  END LOOP;
END $$;
