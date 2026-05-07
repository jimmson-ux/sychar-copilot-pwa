-- Fix get_parent_context_for_ai: add missing parent2_phone column + robust RPC
-- The column existed locally but was not pushed to remote.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS parent2_phone text;

CREATE INDEX IF NOT EXISTS idx_students_parent2_phone
  ON public.students(parent2_phone) WHERE parent2_phone IS NOT NULL;

-- Re-create RPC with all 4 parent identifier columns
CREATE OR REPLACE FUNCTION public.get_parent_context_for_ai(p_parent_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context   jsonb;
  v_school_id text;
BEGIN
  SELECT school_id::text INTO v_school_id
  FROM public.students
  WHERE parent_phone  = p_parent_id
     OR parent2_phone = p_parent_id
     OR parent_email  = p_parent_id
     OR parent2_email = p_parent_id
  LIMIT 1;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('error', 'parent not found', 'parent_id', p_parent_id, 'children', '[]'::jsonb);
  END IF;

  SELECT jsonb_build_object(

    'school', (
      SELECT jsonb_build_object(
        'name',        tc.name,
        'code',        tc.school_short_code,
        'county',      tc.county,
        'term',        COALESCE(tc.current_term::text, '1'),
        'year',        COALESCE(tc.current_year::text, '2026'),
        'phone',       tc.phone
      )
      FROM public.tenant_configs tc
      WHERE tc.school_id::text = v_school_id
      LIMIT 1
    ),

    'children', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name',         s.full_name,
          'admission_no', COALESCE(s.admission_no, s.admission_number),
          'class',        s.class_name,
          'stream',       s.stream_name,
          'gender',       s.gender,
          'curriculum',   CASE
                            WHEN s.class_name ILIKE '%grade%' THEN 'CBC'
                            ELSE '8-4-4'
                          END,

          'total_billed', (
            SELECT COALESCE(fb.total_billed, 0)
            FROM public.fee_balances fb
            WHERE fb.student_id = s.id
            ORDER BY fb.updated_at DESC NULLS LAST LIMIT 1
          ),
          'fee_balance', (
            SELECT COALESCE(fb.balance_due, 0)
            FROM public.fee_balances fb
            WHERE fb.student_id = s.id
            ORDER BY fb.updated_at DESC NULLS LAST LIMIT 1
          ),

          'attendance', (
            SELECT jsonb_build_object(
              'present',    COUNT(*) FILTER (WHERE ar.status IN ('present','P')),
              'absent',     COUNT(*) FILTER (WHERE ar.status IN ('absent','A')),
              'late',       COUNT(*) FILTER (WHERE ar.status IN ('late','L')),
              'total',      COUNT(*),
              'percentage', CASE
                WHEN COUNT(*) = 0 THEN 0
                ELSE ROUND(
                  COUNT(*) FILTER (WHERE ar.status IN ('present','P'))
                  * 100.0 / COUNT(*), 1
                )
              END
            )
            FROM public.attendance_records ar
            WHERE ar.student_id::text = s.id::text
              AND ar.school_id = s.school_id
              AND ar.date >= (now() - interval '90 days')::date
          ),

          'recent_marks', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'subject',    m.subject_name,
                'score',      m.raw_score,
                'out_of',     m.total_marks,
                'percentage', m.percentage,
                'grade',      m.grade,
                'exam',       m.exam_type,
                'term',       m.term
              ) ORDER BY m.recorded_at DESC
            )
            FROM (
              SELECT * FROM public.marks
              WHERE student_id = s.id
              ORDER BY recorded_at DESC
              LIMIT 10
            ) m
          ),

          'discipline', (
            SELECT jsonb_agg(
              jsonb_build_object(
                'category', d.category,
                'severity', d.severity,
                'date',     d.incident_date::date,
                'resolved', (d.status = 'resolved')
              ) ORDER BY d.incident_date DESC
            )
            FROM public.discipline_records d
            WHERE d.student_id = s.id
              AND d.incident_date > now() - interval '90 days'
          )
        )
      )
      FROM public.students s
      WHERE s.school_id::text = v_school_id
        AND (
          s.parent_phone  = p_parent_id OR
          s.parent2_phone = p_parent_id OR
          s.parent_email  = p_parent_id OR
          s.parent2_email = p_parent_id
        )
    ), '[]'::jsonb),

    'upcoming_notices', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'title',    n.title,
          'date',     n.created_at::date,
          'body',     LEFT(n.content, 120),
          'category', n.category
        )
      )
      FROM (
        SELECT * FROM public.notices
        WHERE school_id::text = v_school_id
          AND is_published = true
          AND target_audience IN ('all', 'guardians')
          AND created_at >= now() - interval '30 days'
        ORDER BY created_at DESC
        LIMIT 5
      ) n
    ), '[]'::jsonb),

    'context_generated_at', now(),
    'school_id',             v_school_id

  ) INTO v_context;

  RETURN v_context;
END;
$$;
