-- ============================================================
-- Financial Intelligence — regional benchmarks, health log, alerts extension
-- ============================================================

-- ── regional_benchmarks ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.regional_benchmarks (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  region_name     text    NOT NULL DEFAULT 'National',
  metric_name     text    NOT NULL,
  metric_value    numeric NOT NULL,
  school_count    integer DEFAULT 0,
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(region_name, metric_name)
);

ALTER TABLE public.regional_benchmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "benchmarks_read" ON public.regional_benchmarks;
CREATE POLICY "benchmarks_read" ON public.regional_benchmarks
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "benchmarks_service" ON public.regional_benchmarks;
CREATE POLICY "benchmarks_service" ON public.regional_benchmarks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.regional_benchmarks (region_name, metric_name, metric_value, school_count)
VALUES
  ('National', 'avg_fee_collection_rate', 62.0, 1),
  ('Kajiado',  'avg_fee_collection_rate', 58.0, 1)
ON CONFLICT (region_name, metric_name) DO NOTHING;

-- ── school_financial_health_log ───────────────────────────────────────────────
-- school_financial_health already exists as a VIEW — use _log for snapshots
CREATE TABLE IF NOT EXISTS public.school_financial_health_log (
  id              uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id       uuid    NOT NULL,
  computed_at     timestamptz DEFAULT now(),
  collection_rate numeric,
  regional_avg    numeric,
  gap_percent     numeric,
  health_score    integer,
  health_tier     text    CHECK (health_tier IN ('excellent','good','warning','critical')),
  monthly_data    jsonb   DEFAULT '{}'
);

ALTER TABLE public.school_financial_health_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fin_health_principal" ON public.school_financial_health_log;
CREATE POLICY "fin_health_principal" ON public.school_financial_health_log
  FOR ALL TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND EXISTS (
      SELECT 1 FROM public.staff_records
      WHERE user_id = auth.uid()::text
        AND sub_role IN ('principal','bursar','deputy_principal')
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS "fin_health_service" ON public.school_financial_health_log;
CREATE POLICY "fin_health_service" ON public.school_financial_health_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── alerts — extend existing table with new columns ───────────────────────────
-- existing: id, school_id, type, severity, title, detail, is_resolved, resolved_at, created_at
ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS alert_type  text,
  ADD COLUMN IF NOT EXISTS message     text,
  ADD COLUMN IF NOT EXISTS target_role text,
  ADD COLUMN IF NOT EXISTS student_id  uuid,
  ADD COLUMN IF NOT EXISTS is_read     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS action_url  text,
  ADD COLUMN IF NOT EXISTS expires_at  timestamptz;

-- Extend severity check to cover 'info' and 'warning' (existing: low/medium/high/critical)
ALTER TABLE public.alerts DROP CONSTRAINT IF EXISTS alerts_severity_check;
ALTER TABLE public.alerts ADD CONSTRAINT alerts_severity_check
  CHECK (severity IN ('low','medium','high','critical','info','warning'));

CREATE INDEX IF NOT EXISTS idx_alerts_school
  ON public.alerts(school_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_role
  ON public.alerts(school_id, target_role, severity);

-- Ensure service_role bypass exists
DROP POLICY IF EXISTS "alerts_service" ON public.alerts;
CREATE POLICY "alerts_service" ON public.alerts
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── check_financial_health ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_financial_health(p_school_id uuid)
RETURNS void AS $$
DECLARE
  v_collection_rate numeric;
  v_regional_avg    numeric;
  v_gap             numeric;
  v_health_tier     text;
  v_health_score    integer;
  v_region          text;
BEGIN
  SELECT COALESCE(region, 'National') INTO v_region
  FROM public.tenant_configs WHERE school_id = p_school_id LIMIT 1;

  SELECT
    CASE WHEN SUM(total_billed) = 0 THEN 0
         ELSE ROUND(SUM(total_paid) * 100.0 / SUM(total_billed), 1)
    END INTO v_collection_rate
  FROM public.fee_balances
  WHERE school_id::text = p_school_id::text;

  SELECT COALESCE(metric_value, 60) INTO v_regional_avg
  FROM public.regional_benchmarks
  WHERE metric_name = 'avg_fee_collection_rate'
    AND region_name = v_region;

  v_gap         := COALESCE(v_collection_rate, 0) - COALESCE(v_regional_avg, 60);
  v_health_tier := CASE
    WHEN v_collection_rate >= 80 THEN 'excellent'
    WHEN v_collection_rate >= 60 THEN 'good'
    WHEN v_collection_rate >= 45 THEN 'warning'
    ELSE 'critical'
  END;
  v_health_score := LEAST(100, GREATEST(0, ROUND(COALESCE(v_collection_rate, 0))));

  INSERT INTO public.school_financial_health_log (
    school_id, computed_at, collection_rate, regional_avg, gap_percent, health_score, health_tier
  ) VALUES (
    p_school_id, now(), v_collection_rate, v_regional_avg, v_gap, v_health_score, v_health_tier
  );

  IF v_gap < -15 THEN
    INSERT INTO public.alerts (
      school_id, type, alert_type, title, message, severity, target_role
    ) VALUES (
      p_school_id,
      'financial_leak',
      'financial_leak',
      'Fee Collection Below Regional Average',
      'Your collection rate (' || ROUND(COALESCE(v_collection_rate,0), 1) ||
      '%) is ' || ABS(ROUND(v_gap, 1)) ||
      '% below the ' || v_region || ' average (' || ROUND(COALESCE(v_regional_avg,60), 1) ||
      '%). Consider escalating parent communication.',
      'critical',
      'principal'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── refresh_regional_benchmarks ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.refresh_regional_benchmarks()
RETURNS void AS $$
BEGIN
  INSERT INTO public.regional_benchmarks (region_name, metric_name, metric_value, school_count, updated_at)
  SELECT
    COALESCE(tc.region, 'National'),
    'avg_fee_collection_rate',
    ROUND(AVG(
      CASE WHEN fb_totals.total_billed = 0 THEN 0
           ELSE fb_totals.total_paid * 100.0 / fb_totals.total_billed
      END
    ), 1),
    COUNT(DISTINCT tc.school_id),
    now()
  FROM public.tenant_configs tc
  JOIN (
    SELECT school_id::uuid AS sid,
           SUM(total_billed) AS total_billed,
           SUM(total_paid)   AS total_paid
    FROM public.fee_balances
    GROUP BY school_id
  ) fb_totals ON fb_totals.sid = tc.school_id
  WHERE tc.subscription_status IN ('active','trial')
  GROUP BY COALESCE(tc.region, 'National')
  ON CONFLICT (region_name, metric_name)
  DO UPDATE SET
    metric_value = EXCLUDED.metric_value,
    school_count = EXCLUDED.school_count,
    updated_at   = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── pg_cron schedules ─────────────────────────────────────────────────────────
DO $outer$
BEGIN
  PERFORM cron.schedule(
    'nightly-benchmarks',
    '0 23 * * *',
    $cron$ SELECT public.refresh_regional_benchmarks() $cron$
  );
  PERFORM cron.schedule(
    'nightly-financial-health',
    '30 23 * * *',
    $cron$
      SELECT public.check_financial_health(school_id)
      FROM public.tenant_configs
      WHERE subscription_status IN ('active','trial')
    $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — skip financial cron: %', SQLERRM;
END $outer$;
