-- ============================================================
-- Predictive Intelligence Engine
-- student_risk_scores + sentiment_queue + compute_risk_scores
-- ============================================================

-- ── student_risk_scores ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_risk_scores (
  id                  uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id           uuid    NOT NULL,
  student_id          uuid    NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  risk_probability    numeric DEFAULT 0,
  risk_tier           text    DEFAULT 'low'
                      CHECK (risk_tier IN ('low','medium','high','critical')),
  attendance_score    numeric DEFAULT 0,
  grade_trend_score   numeric DEFAULT 0,
  grade_volatility    numeric DEFAULT 0,
  discipline_score    numeric DEFAULT 0,
  engagement_score    numeric DEFAULT 0,
  flags               jsonb   DEFAULT '[]',
  recommendations     jsonb   DEFAULT '[]',
  computed_at         timestamptz DEFAULT now(),
  UNIQUE (student_id, DATE_TRUNC('week', computed_at))
);

CREATE INDEX IF NOT EXISTS idx_risk_school
  ON public.student_risk_scores(school_id, risk_tier, computed_at DESC);

ALTER TABLE public.student_risk_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "risk_school" ON public.student_risk_scores;
CREATE POLICY "risk_school" ON public.student_risk_scores
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id());

-- ── sentiment_queue ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sentiment_queue (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  record_type  text NOT NULL
               CHECK (record_type IN ('discipline','counselling','notes')),
  record_id    uuid NOT NULL,
  text_content text NOT NULL,
  school_id    uuid NOT NULL,
  sentiment    text CHECK (sentiment IN ('positive','neutral','concerned','critical')),
  score        numeric,
  processed    boolean     DEFAULT false,
  created_at   timestamptz DEFAULT now(),
  UNIQUE (record_type, record_id)
);

ALTER TABLE public.sentiment_queue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sentiment_service" ON public.sentiment_queue;
CREATE POLICY "sentiment_service" ON public.sentiment_queue
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── compute_risk_scores ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.compute_risk_scores(p_school_id uuid)
RETURNS integer AS $$
DECLARE
  rec         RECORD;
  v_score     numeric;
  v_flags     jsonb;
  v_recs      jsonb;
  v_tier      text;
  v_count     integer := 0;
  att_score   numeric;
  grade_score numeric;
  vol_score   numeric;
  disc_score  numeric;
  eng_score   numeric;
  v_prev_avg  numeric;
  v_curr_avg  numeric;
BEGIN
  FOR rec IN
    SELECT s.id, s.full_name, s.class_name
    FROM public.students s
    WHERE s.school_id::text = p_school_id::text
      AND s.is_active = true
  LOOP
    v_flags := '[]'::jsonb;
    v_recs  := '[]'::jsonb;

    -- COMPONENT 1: Attendance (25 pts — lower attendance = higher risk score)
    SELECT CASE
      WHEN COUNT(*) = 0 THEN 12
      ELSE GREATEST(0, 25 - ROUND(
        COUNT(*) FILTER (WHERE ar.status IN ('present','P'))
        * 25.0 / COUNT(*), 1
      ))
    END INTO att_score
    FROM public.attendance_records ar
    WHERE ar.student_id::text = rec.id::text
      AND ar.date >= (now() - interval '60 days')::date;

    IF att_score > 15 THEN
      v_flags := v_flags || '["Attendance below 60%"]'::jsonb;
      v_recs  := v_recs  || '["Urgent: Contact parent about attendance"]'::jsonb;
    END IF;

    -- COMPONENT 2: Grade trend (25 pts — declining = higher risk)
    SELECT AVG(raw_score::numeric) INTO v_prev_avg
    FROM public.marks
    WHERE student_id = rec.id AND term < (
      SELECT MAX(term) FROM public.marks WHERE student_id = rec.id
    );

    SELECT AVG(raw_score::numeric) INTO v_curr_avg
    FROM public.marks
    WHERE student_id = rec.id AND term = (
      SELECT MAX(term) FROM public.marks WHERE student_id = rec.id
    );

    grade_score := CASE
      WHEN v_curr_avg IS NULL OR v_prev_avg IS NULL THEN 10
      WHEN v_curr_avg < v_prev_avg THEN 20
      ELSE 5
    END;

    IF grade_score > 15 THEN
      v_flags := v_flags || '["Declining grade trend"]'::jsonb;
    END IF;

    -- COMPONENT 3: Grade volatility (20 pts — high std dev = risk)
    SELECT COALESCE(
      CASE
        WHEN STDDEV(raw_score::numeric) > 20 THEN 20
        WHEN STDDEV(raw_score::numeric) > 10 THEN 10
        ELSE 0
      END, 0
    ) INTO vol_score
    FROM public.marks
    WHERE student_id = rec.id
      AND recorded_at > now() - interval '90 days';

    -- COMPONENT 4: Discipline (15 pts — serious incidents = high risk)
    SELECT LEAST(15, COUNT(*) * 5)::numeric INTO disc_score
    FROM public.discipline_records
    WHERE student_id = rec.id
      AND incident_date > now() - interval '90 days'
      AND severity IN ('moderate','serious','critical');

    IF disc_score > 10 THEN
      v_flags := v_flags || '["Multiple serious discipline incidents"]'::jsonb;
    END IF;

    -- COMPONENT 5: Parent engagement (15 pts — no messages = low engagement)
    SELECT CASE WHEN COUNT(*) = 0 THEN 15 ELSE 0 END INTO eng_score
    FROM public.parent_messages
    WHERE student_id::text = rec.id::text
      AND created_at > now() - interval '30 days';

    -- TOTAL (0 = safe, 100 = critical)
    v_score := COALESCE(att_score,0) + COALESCE(grade_score,0)
             + COALESCE(vol_score,0) + COALESCE(disc_score,0)
             + COALESCE(eng_score,0);

    v_tier := CASE
      WHEN v_score >= 70 THEN 'critical'
      WHEN v_score >= 50 THEN 'high'
      WHEN v_score >= 30 THEN 'medium'
      ELSE 'low'
    END;

    INSERT INTO public.student_risk_scores (
      school_id, student_id, risk_probability, risk_tier,
      attendance_score, grade_trend_score, grade_volatility,
      discipline_score, engagement_score, flags, recommendations,
      computed_at
    ) VALUES (
      p_school_id, rec.id, v_score / 100.0, v_tier,
      COALESCE(att_score,0), COALESCE(grade_score,0), COALESCE(vol_score,0),
      COALESCE(disc_score,0), COALESCE(eng_score,0),
      v_flags, v_recs, now()
    )
    ON CONFLICT (student_id, DATE_TRUNC('week', computed_at))
    DO UPDATE SET
      risk_probability  = EXCLUDED.risk_probability,
      risk_tier         = EXCLUDED.risk_tier,
      attendance_score  = EXCLUDED.attendance_score,
      grade_trend_score = EXCLUDED.grade_trend_score,
      grade_volatility  = EXCLUDED.grade_volatility,
      discipline_score  = EXCLUDED.discipline_score,
      engagement_score  = EXCLUDED.engagement_score,
      flags             = EXCLUDED.flags,
      recommendations   = EXCLUDED.recommendations,
      computed_at       = EXCLUDED.computed_at;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── sentiment trigger ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_sentiment_analysis()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.sentiment_queue (
    record_type, record_id, text_content, school_id, created_at
  ) VALUES (
    'discipline', NEW.id, NEW.description, NEW.school_id, now()
  ) ON CONFLICT (record_type, record_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sentiment_discipline ON public.discipline_records;
CREATE TRIGGER trg_sentiment_discipline
  AFTER INSERT ON public.discipline_records
  FOR EACH ROW
  WHEN (NEW.description IS NOT NULL AND LENGTH(NEW.description) > 20)
  EXECUTE FUNCTION public.trigger_sentiment_analysis();

-- ── Weekly cron (requires pg_cron extension — safe to skip if not enabled) ────
DO $$
BEGIN
  PERFORM cron.schedule(
    'weekly-risk-scores',
    '0 22 * * 0',
    $$
      SELECT public.compute_risk_scores(school_id)
      FROM public.tenant_configs
      WHERE subscription_status IN ('active','trial');
    $$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — skip weekly risk cron: %', SQLERRM;
END $$;
