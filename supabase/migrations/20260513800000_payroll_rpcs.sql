-- ============================================================
-- MIGRATION: Payroll RPCs — AIE authorization, MoE Form A view,
-- counselling trend aggregate
-- ============================================================

-- ============================================================
-- AUTHORIZE FINANCIAL AIE (Principal-only atomic transaction)
-- Approves requisition + deducts from bank balance + marks payroll disbursed
-- ============================================================
CREATE OR REPLACE FUNCTION public.authorize_financial_aie(
  p_aie_id             uuid,
  p_principal_user_id  uuid,
  p_signature_method   text DEFAULT 'Manual',
  p_signature_hash     text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_aie  public.financial_aie_requisitions;
  v_bal  numeric;
BEGIN
  SELECT * INTO v_aie
  FROM public.financial_aie_requisitions
  WHERE id = p_aie_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'aie_not_found');
  END IF;

  IF v_aie.status != 'Pending_Principal_Approval' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'wrong_status', 'current', v_aie.status);
  END IF;

  IF v_aie.bank_account_id IS NOT NULL THEN
    SELECT current_balance INTO v_bal
    FROM public.bank_accounts
    WHERE id = v_aie.bank_account_id;

    IF v_bal < v_aie.total_amount THEN
      RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance',
        'available', v_bal, 'required', v_aie.total_amount);
    END IF;

    -- Deduct from bank account
    UPDATE public.bank_accounts
    SET current_balance = current_balance - v_aie.total_amount
    WHERE id = v_aie.bank_account_id;
  END IF;

  -- Approve AIE with audit trail
  UPDATE public.financial_aie_requisitions SET
    status           = 'Approved_AIE_Granted',
    principal_user_id = p_principal_user_id,
    signature_method = p_signature_method,
    signature_hash   = p_signature_hash,
    signed_at        = now()
  WHERE id = p_aie_id;

  -- Mark linked casual payroll runs as Disbursed
  UPDATE public.casual_payroll_runs
  SET status = 'Disbursed', disbursed_at = now()
  WHERE aie_requisition_id = p_aie_id;

  RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- REJECT FINANCIAL AIE
-- ============================================================
CREATE OR REPLACE FUNCTION public.reject_financial_aie(
  p_aie_id   uuid,
  p_reason   text DEFAULT 'Rejected by Principal'
) RETURNS jsonb AS $$
BEGIN
  UPDATE public.financial_aie_requisitions
  SET status = 'Rejected_By_Principal', rejection_reason = p_reason
  WHERE id = p_aie_id AND status = 'Pending_Principal_Approval';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found_or_wrong_status');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- MoE FORM A — Official financial return view (per term)
-- ============================================================
CREATE OR REPLACE VIEW public.view_moe_form_a AS
SELECT
  a.vote_head_name                                        AS vote_head_description,
  ba.account_name                                         AS bank_account,
  ba.bank_name,
  d.term,
  d.academic_year,
  d.date_disbursed,
  a.per_student_amount,
  a.total_allocated_amount                                AS total_income_capitation,
  COALESCE(SUM(e.amount_spent), 0)                       AS total_expenditures,
  a.total_allocated_amount - COALESCE(SUM(e.amount_spent), 0) AS ending_balance,
  0::numeric                                              AS pending_liabilities,
  a.id                                                    AS allocation_id,
  a.school_id
FROM public.capitation_vote_head_allocations a
JOIN public.moe_capitation_disbursements d ON d.id = a.disbursement_id
LEFT JOIN public.bank_accounts ba ON ba.id = d.bank_account_id
LEFT JOIN public.vote_head_expenditures e ON e.vote_head_allocation_id = a.id
GROUP BY
  a.vote_head_name, ba.account_name, ba.bank_name, d.term, d.academic_year,
  d.date_disbursed, a.per_student_amount, a.total_allocated_amount,
  a.id, a.school_id
ORDER BY d.academic_year, d.term, a.vote_head_name;

-- ============================================================
-- COUNSELLING TREND AGGREGATE (anonymised — HOD counselling only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_counselling_trends(
  p_school_id uuid,
  p_months    int DEFAULT 3
) RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'total_sessions', COUNT(*),
    'high_risk_count', COUNT(*) FILTER (WHERE risk_level = 'High'),
    'by_category', jsonb_object_agg(primary_issue_category, cat_count),
    'by_risk', jsonb_object_agg(risk_level, risk_count)
  )
  FROM (
    SELECT
      primary_issue_category,
      risk_level,
      COUNT(*) OVER (PARTITION BY primary_issue_category) AS cat_count,
      COUNT(*) OVER (PARTITION BY risk_level) AS risk_count
    FROM public.counselling_sessions
    WHERE school_id = p_school_id
      AND session_date >= current_date - (p_months * 30)
  ) sub;
$$ LANGUAGE sql SECURITY DEFINER;
