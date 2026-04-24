-- Fix document_inbox: was USING(true) — change to school-scoped
DROP POLICY IF EXISTS "document_inbox_open" ON document_inbox;
DROP POLICY IF EXISTS "Allow all" ON document_inbox;
CREATE POLICY "document_inbox_school" ON document_inbox
  FOR ALL TO authenticated
  USING (school_id = (SELECT school_id FROM users WHERE id = auth.uid() LIMIT 1));

-- Fix apology_letters: same issue
DROP POLICY IF EXISTS "apology_letters_open" ON apology_letters;
DROP POLICY IF EXISTS "Allow all" ON apology_letters;
CREATE POLICY "apology_letters_school" ON apology_letters
  FOR ALL TO authenticated
  USING (
    discipline_record_id IN (
      SELECT id FROM discipline_records
      WHERE school_id = (SELECT school_id FROM users WHERE id = auth.uid() LIMIT 1)
    )
  );

-- Fix department_codes: enable RLS if table exists
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'department_codes') THEN
    ALTER TABLE department_codes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "dept_codes_school" ON department_codes;
    CREATE POLICY "dept_codes_school" ON department_codes
      FOR ALL TO authenticated
      USING (school_id = (SELECT school_id FROM users WHERE id = auth.uid() LIMIT 1));
  END IF;
END $$;

-- Fix appraisals: add school-scoped policy
DROP POLICY IF EXISTS "appraisals_school" ON appraisals;
CREATE POLICY "appraisals_school" ON appraisals
  FOR ALL TO authenticated
  USING (school_id = (SELECT school_id FROM users WHERE id = auth.uid() LIMIT 1));

-- Verify: show all tables with their RLS status
SELECT
  t.tablename,
  c.relrowsecurity AS rls_enabled,
  COUNT(p.policyname) AS policy_count
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
LEFT JOIN pg_policies p ON p.tablename = t.tablename
WHERE t.schemaname = 'public'
GROUP BY t.tablename, c.relrowsecurity
ORDER BY rls_enabled, t.tablename;
