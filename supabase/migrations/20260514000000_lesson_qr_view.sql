-- ================================================================
-- LESSON QR — VIEW + printed_at column — 2026-05-14
-- ================================================================

-- 1. Add printed_at to class_qr_tokens
ALTER TABLE public.class_qr_tokens
  ADD COLUMN IF NOT EXISTS printed_at timestamptz;

-- 2. v_lesson_qr_today: today's lessons LEFT JOINed with active QR tokens
--    Shown in the lesson-qr issuer page; filtered by school_id client-side.
CREATE OR REPLACE VIEW public.v_lesson_qr_today AS
SELECT
  tp.id                                                   AS timetable_entry_id,
  tp.school_id,
  tp.class_id,
  tp.class_name,
  tp.subject,
  tp.period_number,
  tp.start_time::text                                     AS scheduled_start,
  tp.end_time::text                                       AS scheduled_end,
  tp.teacher_id,
  tp.teacher_name,
  -- token columns (NULL when no active QR)
  qt.id                                                   AS token_id,
  CASE
    WHEN qt.id IS NULL THEN NULL
    WHEN qt.last_scanned_at IS NOT NULL THEN 'scanned'
    WHEN qt.printed_at IS NOT NULL THEN 'printed'
    ELSE 'issued'
  END                                                     AS token_status,
  qt.generated_by                                         AS issued_by_staff_id,
  sr.user_id                                              AS issued_by,
  COALESCE(sr.full_name, sr.email)                        AS issued_by_name,
  qt.generated_at                                         AS issued_at,
  qt.printed_at,
  qt.last_scanned_at                                      AS scanned_at
FROM public.timetable_periods tp
LEFT JOIN public.class_qr_tokens qt
  ON  qt.school_id = tp.school_id
  AND qt.class_id  = tp.class_id
  AND qt.is_active = true
LEFT JOIN public.staff_records sr
  ON sr.id = qt.generated_by
WHERE
  tp.period_type  = 'lesson'
  AND tp.day_of_week = EXTRACT(ISODOW FROM (now() AT TIME ZONE 'Africa/Nairobi'))::integer
ORDER BY tp.period_number;

-- Grant view access to authenticated users (RLS on underlying tables still applies)
GRANT SELECT ON public.v_lesson_qr_today TO authenticated;
GRANT SELECT ON public.v_lesson_qr_today TO service_role;

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'class_qr_tokens.printed_at : %',
    (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='class_qr_tokens' AND column_name='printed_at');
  RAISE NOTICE 'v_lesson_qr_today view     : %',
    (SELECT COUNT(*) FROM information_schema.views
     WHERE table_schema='public' AND table_name='v_lesson_qr_today');
END $$;
