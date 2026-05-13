-- Term reschedule RPC — atomic shift of all term-linked dates.
-- SECURITY DEFINER so it can bypass RLS for the atomic transaction.

CREATE OR REPLACE FUNCTION public.execute_term_reschedule(
  p_term_id          uuid,
  p_effective_from   date,
  p_shift_days       int,
  p_actor_id         text,
  p_ip_address       text DEFAULT NULL,
  p_user_agent       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET row_security = off
AS $$
DECLARE
  v_school_id      uuid;
  v_before         jsonb;
  v_after          jsonb;
  v_rows_shifted   int := 0;
  v_hmac_input     text;
  v_hmac_hash      text;
  v_tmp            int;
BEGIN
  -- Lock the term record
  SELECT school_id, to_jsonb(t.*) INTO v_school_id, v_before
  FROM public.term_structures t
  WHERE id = p_term_id
  FOR UPDATE;

  IF v_school_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'term_structure not found');
  END IF;

  -- Shift term_structures dates
  UPDATE public.term_structures
  SET
    open_date      = open_date      + p_shift_days,
    close_date     = close_date     + p_shift_days,
    mid_term_start = CASE WHEN mid_term_start IS NOT NULL THEN mid_term_start + p_shift_days END,
    mid_term_end   = CASE WHEN mid_term_end   IS NOT NULL THEN mid_term_end   + p_shift_days END
  WHERE id = p_term_id;

  -- Shift scheme_rows for this term's schemes
  UPDATE public.scheme_rows sr
  SET week_start_date = week_start_date + p_shift_days
  FROM public.generated_schemes_of_work gsow
  WHERE sr.scheme_id = gsow.id
    AND gsow.term_structure_id = p_term_id
    AND sr.week_start_date >= p_effective_from;

  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_rows_shifted := v_rows_shifted + v_tmp;

  -- Shift homework due dates
  UPDATE public.personalised_homework_queues
  SET due_date = due_date + p_shift_days
  WHERE school_id = v_school_id
    AND due_date >= p_effective_from;

  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_rows_shifted := v_rows_shifted + v_tmp;

  -- Shift school calendar events in the term window
  UPDATE public.school_calendar_events
  SET event_date = event_date + p_shift_days
  WHERE school_id = v_school_id
    AND event_date >= p_effective_from;

  GET DIAGNOSTICS v_tmp = ROW_COUNT;
  v_rows_shifted := v_rows_shifted + v_tmp;

  -- Invalidate AI generation cache for this school (content may be stale)
  DELETE FROM public.ai_generation_cache WHERE school_id = v_school_id;

  -- Capture after snapshot
  SELECT to_jsonb(t.*) INTO v_after
  FROM public.term_structures t
  WHERE id = p_term_id;

  -- HMAC-style audit hash: SHA-256(school_id || actor || action || before || after || now)
  v_hmac_input := v_school_id::text || '|' || p_actor_id || '|term_reschedule|'
                  || v_before::text || '|' || v_after::text || '|' || now()::text;
  v_hmac_hash  := encode(digest(v_hmac_input, 'sha256'), 'hex');

  -- Append-only audit record
  INSERT INTO public.administrative_overrides_audit (
    school_id, actor_id, action_type, target_table,
    before_snapshot, after_snapshot, hmac_hash,
    ip_address, user_agent
  ) VALUES (
    v_school_id, p_actor_id, 'term_reschedule', 'term_structures',
    v_before, v_after, v_hmac_hash,
    p_ip_address, p_user_agent
  );

  RETURN jsonb_build_object(
    'ok', true,
    'rows_shifted', v_rows_shifted,
    'audit_hmac', v_hmac_hash
  );
END;
$$;

-- Requires pgcrypto extension for SHA-256
CREATE EXTENSION IF NOT EXISTS pgcrypto;

GRANT EXECUTE ON FUNCTION public.execute_term_reschedule TO authenticated;
