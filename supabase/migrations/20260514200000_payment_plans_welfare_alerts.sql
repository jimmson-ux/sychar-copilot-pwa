-- Payment installment plans for student fee management
CREATE TABLE IF NOT EXISTS payment_plans (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES tenant_configs(school_id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  created_by    uuid NOT NULL,
  total_balance numeric(12,2) NOT NULL,
  installments  jsonb NOT NULL DEFAULT '[]',
  ai_score      int,
  ai_reasoning  text,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','defaulted')),
  term          text,
  academic_year text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
ALTER TABLE payment_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment_plans_school_isolation" ON payment_plans
  USING (school_id = get_my_school_id());

-- Student welfare anomaly alerts for counselors
CREATE TABLE IF NOT EXISTS welfare_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES tenant_configs(school_id) ON DELETE CASCADE,
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  risk_score      int NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  risk_factors    jsonb NOT NULL DEFAULT '[]',
  recommendation  text,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','closed')),
  reviewed_by     uuid,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE welfare_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "welfare_alerts_school_isolation" ON welfare_alerts
  USING (school_id = get_my_school_id());
