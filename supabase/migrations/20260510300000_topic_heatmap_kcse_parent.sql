-- TopicHeatmap view + KCSEPredictor parent-read policy
-- Both features are student-scoped; parent routes use the admin client (bypasses RLS).

-- ── v_student_topic_heatmap ──────────────────────────────────────────────────
-- Aggregates subject_performance by (student, subject, topic).
-- Used by GET /api/parent/student/[id]/topic-heatmap

CREATE OR REPLACE VIEW public.v_student_topic_heatmap AS
SELECT
  student_id,
  school_id,
  subject_name,
  topic,
  COUNT(*)                                AS attempts,
  ROUND(AVG(score)::numeric, 1)           AS avg_score,
  MAX(score)                              AS best_score,
  MIN(score)                              AS worst_score,
  MAX(created_at)                         AS last_assessed,
  CASE
    WHEN AVG(score) >= 70 THEN 'strong'
    WHEN AVG(score) >= 50 THEN 'average'
    ELSE                       'weak'
  END                                     AS mastery_level
FROM public.subject_performance
WHERE topic IS NOT NULL AND topic <> ''
GROUP BY student_id, school_id, subject_name, topic;

-- ── service-role bypass for kcse_predictions ─────────────────────────────────
-- The existing "kcse_pred_school" policy covers authenticated (staff) reads.
-- Parent API routes use the service-role key which bypasses RLS entirely.
-- Nothing extra needed — but document the intent here.

-- ── Realtime for topic heatmap (optional, low-frequency) ────────────────────
-- subject_performance is already a regular table; views inherit nothing, so
-- realtime isn't enabled on the view. The parent PWA polls instead.

-- ── Index to speed up per-student topic queries ──────────────────────────────
CREATE INDEX IF NOT EXISTS idx_subj_perf_student_topic
  ON public.subject_performance (student_id, subject_name, topic)
  WHERE topic IS NOT NULL;
