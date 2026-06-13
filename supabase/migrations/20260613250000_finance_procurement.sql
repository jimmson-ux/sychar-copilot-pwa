-- ================================================================
-- FINANCE WITHOUT M-PESA API + PROCUREMENT CHAIN — all schools
-- 2026-06-13 · Sprint 3
--
-- Manual/evidence-based fee capture with anti-fraud, plus the full procurement→PO→
-- delivery→payment chain with approval certificates. Reuses existing fee_payments
-- (ledger), requisitions, suppliers. Parent claim flow is for the parents PWA + all
-- bursar/accounts dashboards. NEVER auto-credits fees — a claim is staged, matched
-- against an uploaded statement, then posted by Accounts.
-- ================================================================

-- ── 1. Parent/accounts payment CLAIMS (staging; never auto-credits) ──
CREATE TABLE IF NOT EXISTS public.payment_claims (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id       uuid REFERENCES public.students(id) ON DELETE SET NULL,
  admission_no     text,
  parent_id        text,                                  -- phone-less: verified-session id
  amount           numeric(12,2) NOT NULL CHECK (amount > 0),
  method           text NOT NULL CHECK (method IN ('mpesa','bank','cash','cheque')),
  transaction_code text,                                  -- M-Pesa code / bank slip no
  txn_date         date,
  paybill          text,
  account_ref      text,
  bank_name        text,
  evidence_url     text,                                  -- screenshot / slip
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','matched','verified','posted','rejected','duplicate')),
  match_type       text,                                  -- 'auto'|'manual'|'amount_mismatch'|'not_found'
  matched_entry_id uuid,
  fee_payment_id   uuid,                                  -- set when posted to the ledger
  reviewed_by      uuid REFERENCES public.staff_records(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_claims_school ON public.payment_claims (school_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_claims_code   ON public.payment_claims (school_id, transaction_code);
-- A given code can only be POSTED once (anti double-credit); duplicates are still
-- recorded with status='duplicate' for the audit trail.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_claims_posted_code
  ON public.payment_claims (school_id, transaction_code)
  WHERE status IN ('verified','posted') AND transaction_code IS NOT NULL;

-- ── 2. Uploaded statement entries (M-Pesa/bank) for auto-matching ──
CREATE TABLE IF NOT EXISTS public.statement_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  source           text NOT NULL CHECK (source IN ('mpesa','bank')),
  transaction_code text NOT NULL,
  amount           numeric(12,2) NOT NULL,
  txn_date         date,
  payer_name       text,
  raw              text,
  matched_claim_id uuid REFERENCES public.payment_claims(id) ON DELETE SET NULL,
  uploaded_by      uuid REFERENCES public.staff_records(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, source, transaction_code)
);
CREATE INDEX IF NOT EXISTS idx_statement_entries_code ON public.statement_entries (school_id, transaction_code);

-- ── 3. Approval certificates (APR-/AUTH-/STK-/VER- with permanent ids) ──
CREATE TABLE IF NOT EXISTS public.approval_certificates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  cert_type     text NOT NULL CHECK (cert_type IN ('APR','AUTH','STK','VER')),
  cert_no       text NOT NULL,                            -- e.g. APR-2026-000145
  document_type text NOT NULL,                            -- requisition|purchase_order|goods_receipt|payment
  document_id   uuid,
  issued_by     uuid REFERENCES public.staff_records(id) ON DELETE SET NULL,
  issued_role   text,
  signature_url text,
  notes         text,
  issued_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, cert_no)
);

-- ── 4. Purchase orders + goods receipts ──
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  po_number      text NOT NULL,
  requisition_id uuid REFERENCES public.requisitions(id) ON DELETE SET NULL,
  supplier_id    uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  total_amount   numeric(12,2),
  status         text NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft','approved','sent','delivered','received','paid','cancelled')),
  approved_by    uuid REFERENCES public.staff_records(id) ON DELETE SET NULL,
  approved_at    timestamptz,
  created_by     uuid REFERENCES public.staff_records(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, po_number)
);

CREATE TABLE IF NOT EXISTS public.goods_receipts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  po_id             uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  item_desc         text,
  expected_qty      numeric(12,2),
  received_qty      numeric(12,2),
  variance          numeric(12,2) GENERATED ALWAYS AS (coalesce(received_qty,0) - coalesce(expected_qty,0)) STORED,
  delivery_note_url text,
  invoice_url       text,
  received_by       uuid REFERENCES public.staff_records(id) ON DELETE SET NULL,
  verified_at       timestamptz NOT NULL DEFAULT now()
);

-- ── RLS: school-scoped; finance/procurement roles manage; service bypass ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['payment_claims','statement_entries','approval_certificates','purchase_orders','goods_receipts']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_read ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_read ON public.%I FOR SELECT TO authenticated
      USING (school_id::text = public.get_my_school_id()::text)
    $f$, t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_manage ON public.%I', t, t);
    EXECUTE format($f$
      CREATE POLICY %I_manage ON public.%I FOR ALL TO authenticated
      USING (school_id::text = public.get_my_school_id()::text
             AND public.get_my_role() IN ('bursar','accounts_clerk','procurement_officer','storekeeper',
                 'principal','deputy_principal','deputy_principal_admin','super_admin','secretary'))
      WITH CHECK (school_id::text = public.get_my_school_id()::text
             AND public.get_my_role() IN ('bursar','accounts_clerk','procurement_officer','storekeeper',
                 'principal','deputy_principal','deputy_principal_admin','super_admin','secretary'))
    $f$, t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_service ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_service ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- ── Anti-fraud claim submission: dedupe by code, auto-match to statement ──
CREATE OR REPLACE FUNCTION public.submit_payment_claim(
  p_school_id uuid, p_student_id uuid, p_admission_no text, p_parent_id text,
  p_amount numeric, p_method text, p_txn_code text, p_txn_date date,
  p_paybill text DEFAULT NULL, p_account_ref text DEFAULT NULL,
  p_bank_name text DEFAULT NULL, p_evidence_url text DEFAULT NULL
) RETURNS TABLE (claim_id uuid, claim_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_status text := 'pending'; v_match text; v_entry uuid;
BEGIN
  -- Layer 1: transaction-code uniqueness — a code already posted/verified = duplicate.
  IF p_txn_code IS NOT NULL AND EXISTS (
    SELECT 1 FROM payment_claims
    WHERE school_id = p_school_id AND transaction_code = p_txn_code
      AND status IN ('verified','posted','pending','matched')
  ) THEN
    INSERT INTO payment_claims (school_id, student_id, admission_no, parent_id, amount, method,
      transaction_code, txn_date, paybill, account_ref, bank_name, evidence_url, status, match_type)
    VALUES (p_school_id, p_student_id, p_admission_no, p_parent_id, p_amount, p_method,
      p_txn_code, p_txn_date, p_paybill, p_account_ref, p_bank_name, p_evidence_url, 'duplicate', 'duplicate')
    RETURNING id INTO v_id;
    RETURN QUERY SELECT v_id, 'duplicate'::text; RETURN;
  END IF;

  -- Layer 2: auto-match against an uploaded statement entry (code + amount).
  IF p_txn_code IS NOT NULL THEN
    SELECT id INTO v_entry FROM statement_entries
    WHERE school_id = p_school_id AND transaction_code = p_txn_code AND matched_claim_id IS NULL
    LIMIT 1;
    IF v_entry IS NOT NULL THEN
      v_status := 'matched';
      v_match  := (SELECT CASE WHEN amount = p_amount THEN 'auto' ELSE 'amount_mismatch' END
                   FROM statement_entries WHERE id = v_entry);
      IF v_match = 'amount_mismatch' THEN v_status := 'pending'; END IF;
    ELSE
      v_match := 'not_found';
    END IF;
  END IF;

  INSERT INTO payment_claims (school_id, student_id, admission_no, parent_id, amount, method,
    transaction_code, txn_date, paybill, account_ref, bank_name, evidence_url, status, match_type, matched_entry_id)
  VALUES (p_school_id, p_student_id, p_admission_no, p_parent_id, p_amount, p_method,
    p_txn_code, p_txn_date, p_paybill, p_account_ref, p_bank_name, p_evidence_url, v_status, v_match, v_entry)
  RETURNING id INTO v_id;

  IF v_entry IS NOT NULL THEN
    UPDATE statement_entries SET matched_claim_id = v_id WHERE id = v_entry;
  END IF;
  RETURN QUERY SELECT v_id, v_status;
END $$;
REVOKE ALL ON FUNCTION public.submit_payment_claim(uuid,uuid,text,text,numeric,text,text,date,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_payment_claim(uuid,uuid,text,text,numeric,text,text,date,text,text,text,text) TO authenticated, service_role;

-- ── Next sequential certificate number per school + type per year ──
CREATE OR REPLACE FUNCTION public.next_certificate_no(p_school_id uuid, p_type text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_year text := to_char(now(), 'YYYY'); v_seq int;
BEGIN
  SELECT count(*) + 1 INTO v_seq FROM approval_certificates
   WHERE school_id = p_school_id AND cert_type = p_type
     AND to_char(issued_at, 'YYYY') = v_year;
  RETURN p_type || '-' || v_year || '-' || lpad(v_seq::text, 6, '0');
END $$;
GRANT EXECUTE ON FUNCTION public.next_certificate_no(uuid, text) TO authenticated, service_role;
