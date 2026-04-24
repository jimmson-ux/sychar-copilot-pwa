-- ── 1. parent_messages (WhatsApp-style chat table) ────────────
CREATE TABLE IF NOT EXISTS parent_messages (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_id     uuid NOT NULL,
  school_id     uuid NOT NULL,
  student_id    uuid REFERENCES students(id) ON DELETE SET NULL,
  message_body  text NOT NULL,
  sender_type   text NOT NULL
                CHECK (sender_type IN ('parent','system_bot','ai_assistant','staff')),
  message_type  text DEFAULT 'text'
                CHECK (message_type IN ('text','alert','fee','attendance','marks','discipline')),
  is_read       boolean DEFAULT false,
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_messages_parent
  ON parent_messages(parent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_messages_school
  ON parent_messages(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_messages_unread
  ON parent_messages(parent_id, is_read) WHERE is_read = false;

ALTER TABLE parent_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parents see own messages" ON parent_messages;
CREATE POLICY "Parents see own messages"
  ON parent_messages FOR SELECT
  TO authenticated
  USING (
    parent_id = auth.uid()
    OR school_id = (SELECT school_id::uuid FROM staff_records WHERE user_id = auth.uid()::text LIMIT 1)
  );

DROP POLICY IF EXISTS "System inserts messages" ON parent_messages;
CREATE POLICY "System inserts messages"
  ON parent_messages FOR INSERT
  TO authenticated
  WITH CHECK (school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'parent_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE parent_messages;
  END IF;
END $$;

-- ── 2. pending_clock_ins (SMS+GPS verification) ───────────────
CREATE TABLE IF NOT EXISTS pending_clock_ins (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  token      text NOT NULL UNIQUE,
  staff_id   uuid NOT NULL,
  school_id  uuid NOT NULL,
  phone      text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '10 minutes'),
  verified   boolean DEFAULT false,
  verified_at timestamptz,
  lat        numeric,
  lng        numeric,
  distance_from_school_m numeric
);

CREATE INDEX IF NOT EXISTS idx_pending_clock_ins_token
  ON pending_clock_ins(token) WHERE verified = false;

ALTER TABLE pending_clock_ins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION cleanup_expired_clock_ins()
RETURNS void AS $$
BEGIN
  DELETE FROM pending_clock_ins
  WHERE expires_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql;

-- ── 3. parent_query_logs (staff visibility into parent queries) ─
CREATE TABLE IF NOT EXISTS parent_query_logs (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        uuid NOT NULL,
  parent_id        uuid,
  parent_name      text,
  student_id       uuid REFERENCES students(id) ON DELETE SET NULL,
  student_name     text,
  query            text NOT NULL,
  response_summary text,
  context_type     text CHECK (context_type IN
                   ('fee','attendance','marks','discipline','general','alert')),
  relevant_subject text,
  sentiment        text CHECK (sentiment IN ('positive','neutral','concerned')),
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parent_query_logs_school
  ON parent_query_logs(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parent_query_logs_student
  ON parent_query_logs(student_id, created_at DESC);

ALTER TABLE parent_query_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff see query logs for their school" ON parent_query_logs;
CREATE POLICY "Staff see query logs for their school"
  ON parent_query_logs FOR SELECT
  TO authenticated
  USING (school_id = (SELECT school_id::uuid FROM staff_records WHERE user_id = auth.uid()::text LIMIT 1));

-- ── 4. TRIGGER — Notify parent when student scanned ───────────
CREATE OR REPLACE FUNCTION notify_parent_on_scan()
RETURNS TRIGGER AS $$
DECLARE
  v_parent_id    uuid;
  v_student_name text;
  v_student_id   uuid;
  v_school_name  text := 'Nkoroi Mixed Day Senior Secondary School';
BEGIN
  SELECT
    s.full_name,
    s.id,
    s.guardian_id
  INTO v_student_name, v_student_id, v_parent_id
  FROM students s
  WHERE s.id = NEW.student_id;

  IF v_parent_id IS NULL THEN
    SELECT p.id INTO v_parent_id
    FROM parents p
    JOIN students s ON s.parent_phone = p.phone
    WHERE s.id = NEW.student_id
    LIMIT 1;
  END IF;

  IF v_parent_id IS NOT NULL THEN
    INSERT INTO parent_messages (
      parent_id,
      school_id,
      student_id,
      message_body,
      sender_type,
      message_type,
      metadata
    ) VALUES (
      v_parent_id,
      NEW.school_id,
      v_student_id,
      '✅ ' || v_student_name || ' arrived at ' || v_school_name ||
      ' at ' || to_char(NEW.created_at AT TIME ZONE 'Africa/Nairobi', 'HH12:MI AM') ||
      ' today.',
      'system_bot',
      'attendance',
      jsonb_build_object(
        'scan_type', 'arrival',
        'scan_time', NEW.created_at,
        'student_name', v_student_name
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_student_scanned ON attendance;
CREATE TRIGGER trigger_student_scanned
  AFTER INSERT ON attendance
  FOR EACH ROW
  WHEN (NEW.status IN ('present', 'Present', 'P'))
  EXECUTE FUNCTION notify_parent_on_scan();

-- ── 5. CRON — Daily absentee sweep at 10:00 AM EAT ───────────
-- Requires pg_cron: Dashboard → Database → Extensions → pg_cron

CREATE OR REPLACE FUNCTION daily_absentee_sweep()
RETURNS void AS $$
DECLARE
  rec RECORD;
  v_parent_id uuid;
BEGIN
  FOR rec IN
    SELECT
      s.id AS student_id,
      s.full_name,
      s.school_id,
      s.guardian_id,
      s.parent_phone
    FROM students s
    WHERE s.school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid
      AND NOT EXISTS (
        SELECT 1 FROM attendance a
        WHERE a.student_id = s.id
          AND DATE(a.created_at AT TIME ZONE 'Africa/Nairobi') = CURRENT_DATE
      )
  LOOP
    v_parent_id := rec.guardian_id;

    IF v_parent_id IS NULL AND rec.parent_phone IS NOT NULL THEN
      SELECT id INTO v_parent_id
      FROM parents
      WHERE phone = rec.parent_phone
      LIMIT 1;
    END IF;

    IF v_parent_id IS NOT NULL THEN
      INSERT INTO parent_messages (
        parent_id, school_id, student_id,
        message_body, sender_type, message_type, metadata
      ) VALUES (
        v_parent_id,
        rec.school_id,
        rec.student_id,
        '⚠️ Absence Alert: ' || rec.full_name ||
        ' has not been marked present at school today (' ||
        to_char(now() AT TIME ZONE 'Africa/Nairobi', 'DD Mon YYYY') ||
        '). Please contact the school if this is unexpected.',
        'system_bot',
        'attendance',
        jsonb_build_object('alert_type', 'absent', 'date', CURRENT_DATE)
      );
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10:00 AM EAT = 07:00 UTC, weekdays
SELECT cron.schedule(
  'daily-absentee-sweep',
  '0 7 * * 1-5',
  $$SELECT daily_absentee_sweep()$$
);

SELECT cron.schedule(
  'cleanup-clock-ins',
  '*/30 * * * *',
  $$SELECT cleanup_expired_clock_ins()$$
);
