-- AI-generated timetable snapshots stored per school per week.
CREATE TABLE IF NOT EXISTS ai_timetables (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  week_start   date NOT NULL,
  generated_by uuid REFERENCES staff_records(id) ON DELETE SET NULL,
  payload      jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE ai_timetables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_timetables_school_isolation" ON ai_timetables
  USING (school_id = get_my_school_id());

CREATE INDEX IF NOT EXISTS idx_ai_timetables_school_week ON ai_timetables (school_id, week_start);
