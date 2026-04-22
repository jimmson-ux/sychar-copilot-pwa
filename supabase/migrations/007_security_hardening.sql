-- ── 1. Auth rate limiting table ──────────────────────────────
CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email            text NOT NULL,
  attempts         integer DEFAULT 1,
  first_attempt_at timestamptz DEFAULT now(),
  locked_until     timestamptz,
  school_id        uuid REFERENCES school_subscriptions(school_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_email ON auth_rate_limits(email);
ALTER TABLE auth_rate_limits ENABLE ROW LEVEL SECURITY;

-- ── 2. Parent query logs (for staff visibility) ──────────────
CREATE TABLE IF NOT EXISTS parent_query_logs (
  id                 uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id          uuid NOT NULL,
  parent_id          uuid,
  parent_name        text,
  student_id         uuid REFERENCES students(id) ON DELETE SET NULL,
  student_name       text,
  query              text NOT NULL,
  response_summary   text,
  context_type       text CHECK (context_type IN ('fee','attendance','marks','discipline','general','alert')),
  relevant_staff_ids uuid[] DEFAULT '{}',
  created_at         timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_parent_queries_school  ON parent_query_logs(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_queries_student ON parent_query_logs(student_id);
ALTER TABLE parent_query_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff see parent queries for their school"
  ON parent_query_logs FOR SELECT
  TO authenticated
  USING (school_id = (SELECT school_id FROM staff_records WHERE user_id = auth.uid() LIMIT 1));

-- ── 3. Add NOT NULL to school_id where missing ───────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='school_id' AND is_nullable='YES') THEN
    ALTER TABLE students ALTER COLUMN school_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='marks' AND column_name='school_id' AND is_nullable='YES') THEN
    ALTER TABLE marks ALTER COLUMN school_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fee_records' AND column_name='school_id' AND is_nullable='YES') THEN
    ALTER TABLE fee_records ALTER COLUMN school_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='attendance' AND column_name='school_id' AND is_nullable='YES') THEN
    ALTER TABLE attendance ALTER COLUMN school_id SET NOT NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='discipline_records' AND column_name='school_id' AND is_nullable='YES') THEN
    ALTER TABLE discipline_records ALTER COLUMN school_id SET NOT NULL;
  END IF;
END $$;

-- ── 4. Fix ocr_log.user_id to UUID FK ────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='ocr_log' AND column_name='user_id' AND data_type='text') THEN
    ALTER TABLE ocr_log ALTER COLUMN user_id TYPE uuid USING user_id::uuid;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE table_name='ocr_log' AND constraint_name='ocr_log_user_id_fkey') THEN
    ALTER TABLE ocr_log ADD CONSTRAINT ocr_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 5. Enable RLS on any table missing it ────────────────────
DO $$
DECLARE tbl text;
BEGIN
  FOR tbl IN
    SELECT t.tablename FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
    WHERE t.schemaname = 'public' AND c.relrowsecurity = false
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    RAISE NOTICE 'Enabled RLS on %', tbl;
  END LOOP;
END $$;

-- ── 6. Performance indexes ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attendance_school    ON attendance(school_id);
CREATE INDEX IF NOT EXISTS idx_marks_school         ON marks(school_id);
CREATE INDEX IF NOT EXISTS idx_fee_records_school   ON fee_records(school_id);
CREATE INDEX IF NOT EXISTS idx_discipline_school    ON discipline_records(school_id);
CREATE INDEX IF NOT EXISTS idx_notices_school       ON notices(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_log_school       ON ocr_log(school_id);

-- ── 7. Verification query ─────────────────────────────────────
SELECT
  t.tablename,
  c.relrowsecurity AS rls_enabled,
  (SELECT COUNT(*) FROM pg_indexes WHERE tablename = t.tablename AND schemaname = 'public') AS index_count
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename AND c.relnamespace = 'public'::regnamespace
WHERE t.schemaname = 'public'
ORDER BY t.tablename;
