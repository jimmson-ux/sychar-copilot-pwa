ALTER TABLE ai_timetables ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_ai_timetables_active ON ai_timetables (school_id, active);
