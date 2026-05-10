-- ================================================================
-- PARENT PWA BACKEND FIX — 2026-05-10
--
-- Creates missing tables and RPCs required by the parent PWA:
--   1. parent_sessions   — OTP auth state (phone→students)
--   2. mpesa_callbacks   — M-Pesa STK push pending tracking + receipt log
--   3. voucher_products  — school's purchasable voucher menu
--   4. increment_wallet_balance() — RPC wrapper for credit_wallet()
--   5. Fix parent_messages INSERT policy (remove hardcoded school UUID)
-- ================================================================


-- ── 1. parent_sessions ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.parent_sessions (
  id              uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id       uuid          NOT NULL,
  parent_phone    text          NOT NULL,
  student_ids     uuid[]        NOT NULL DEFAULT '{}',
  otp_code        text,
  otp_expires_at  timestamptz,
  otp_attempts    integer       DEFAULT 0,
  device_hint     text,
  is_active       boolean       DEFAULT true,
  jwt_issued_at   timestamptz,
  last_seen_at    timestamptz,
  created_at      timestamptz   DEFAULT now()
);

ALTER TABLE public.parent_sessions
  ADD COLUMN IF NOT EXISTS school_id       uuid,
  ADD COLUMN IF NOT EXISTS parent_phone    text,
  ADD COLUMN IF NOT EXISTS student_ids     uuid[],
  ADD COLUMN IF NOT EXISTS otp_code        text,
  ADD COLUMN IF NOT EXISTS otp_expires_at  timestamptz,
  ADD COLUMN IF NOT EXISTS otp_attempts    integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS device_hint     text,
  ADD COLUMN IF NOT EXISTS is_active       boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS jwt_issued_at   timestamptz,
  ADD COLUMN IF NOT EXISTS last_seen_at    timestamptz,
  ADD COLUMN IF NOT EXISTS created_at      timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_parent_sessions_phone
  ON public.parent_sessions (parent_phone, school_id, is_active);
CREATE INDEX IF NOT EXISTS idx_parent_sessions_created_at
  ON public.parent_sessions (created_at DESC);

ALTER TABLE public.parent_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sessions_service" ON public.parent_sessions;
CREATE POLICY "sessions_service" ON public.parent_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 2. mpesa_callbacks ──────────────────────────────────────────
--
-- Stores BOTH the pending STK push context (inserted by topup route)
-- AND the final Safaricom callback (updated on callback arrival).
-- Idempotency key: receipt (UNIQUE, set only on success).

CREATE TABLE IF NOT EXISTS public.mpesa_callbacks (
  id                   uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id            uuid,
  student_id           uuid,
  checkout_request_id  text,
  receipt              text,
  amount               numeric(10,2),
  phone                text,
  reference            text,
  purpose              text,        -- wallet_topup | voucher_purchase | school_fees
  result_code          integer,
  result_desc          text,
  status               text         DEFAULT 'pending',  -- pending | success | failed
  raw                  jsonb,
  created_at           timestamptz  DEFAULT now(),
  updated_at           timestamptz  DEFAULT now()
);

ALTER TABLE public.mpesa_callbacks
  ADD COLUMN IF NOT EXISTS school_id            uuid,
  ADD COLUMN IF NOT EXISTS student_id           uuid,
  ADD COLUMN IF NOT EXISTS checkout_request_id  text,
  ADD COLUMN IF NOT EXISTS receipt              text,
  ADD COLUMN IF NOT EXISTS amount               numeric(10,2),
  ADD COLUMN IF NOT EXISTS phone                text,
  ADD COLUMN IF NOT EXISTS reference            text,
  ADD COLUMN IF NOT EXISTS purpose              text,
  ADD COLUMN IF NOT EXISTS result_code          integer,
  ADD COLUMN IF NOT EXISTS result_desc          text,
  ADD COLUMN IF NOT EXISTS status               text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS raw                  jsonb,
  ADD COLUMN IF NOT EXISTS created_at           timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at           timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE tablename = 'mpesa_callbacks' AND indexname = 'mpesa_callbacks_receipt_unique'
  ) THEN
    CREATE UNIQUE INDEX mpesa_callbacks_receipt_unique
      ON public.mpesa_callbacks (receipt) WHERE receipt IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mpesa_callbacks_ref
  ON public.mpesa_callbacks (reference) WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mpesa_callbacks_checkout
  ON public.mpesa_callbacks (checkout_request_id) WHERE checkout_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mpesa_callbacks_student
  ON public.mpesa_callbacks (student_id, created_at DESC) WHERE student_id IS NOT NULL;

ALTER TABLE public.mpesa_callbacks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mpesa_service" ON public.mpesa_callbacks;
CREATE POLICY "mpesa_service" ON public.mpesa_callbacks
  FOR ALL TO service_role USING (true) WITH CHECK (true);


-- ── 3. voucher_products — school's purchasable voucher menu ─────

CREATE TABLE IF NOT EXISTS public.voucher_products (
  id          uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id   uuid          NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  item_type   text          NOT NULL
              CHECK (item_type IN (
                'bread','lunch','supper','breakfast',
                'snack','milk','transport','activity'
              )),
  item_label  text          NOT NULL,
  unit_label  text          DEFAULT 'piece',
  qty         integer       NOT NULL DEFAULT 10,
  price_kes   numeric(10,2) NOT NULL,
  valid_days  integer       NOT NULL DEFAULT 7,
  is_active   boolean       DEFAULT true,
  created_at  timestamptz   DEFAULT now(),
  UNIQUE (school_id, item_type)
);

ALTER TABLE public.voucher_products
  ADD COLUMN IF NOT EXISTS school_id   uuid,
  ADD COLUMN IF NOT EXISTS item_type   text,
  ADD COLUMN IF NOT EXISTS item_label  text,
  ADD COLUMN IF NOT EXISTS unit_label  text DEFAULT 'piece',
  ADD COLUMN IF NOT EXISTS qty         integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS price_kes   numeric(10,2),
  ADD COLUMN IF NOT EXISTS valid_days  integer DEFAULT 7,
  ADD COLUMN IF NOT EXISTS is_active   boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at  timestamptz DEFAULT now();

ALTER TABLE public.voucher_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vp_school"   ON public.voucher_products;
DROP POLICY IF EXISTS "vp_service"  ON public.voucher_products;
CREATE POLICY "vp_school"  ON public.voucher_products FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());
CREATE POLICY "vp_service" ON public.voucher_products FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ── 4. increment_wallet_balance() — M-Pesa callback RPC ─────────
--
-- Wraps credit_wallet() so the callback handler has a single
-- entrypoint: rpc('increment_wallet_balance', { p_student_id, p_school_id, p_amount })

CREATE OR REPLACE FUNCTION public.increment_wallet_balance(
  p_student_id uuid,
  p_school_id  uuid,
  p_amount     numeric,
  p_mpesa_ref  text DEFAULT NULL,
  p_description text DEFAULT 'M-Pesa wallet topup'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet_id uuid;
BEGIN
  SELECT id INTO v_wallet_id
  FROM public.student_wallets
  WHERE student_id = p_student_id
    AND school_id  = p_school_id;

  IF v_wallet_id IS NULL THEN
    -- Auto-create wallet if it doesn't exist
    INSERT INTO public.student_wallets (school_id, student_id, student_name, admission_no, class_name)
    SELECT p_school_id, p_student_id, s.full_name, s.admission_no, s.class_name
    FROM   public.students s WHERE s.id = p_student_id
    RETURNING id INTO v_wallet_id;
  END IF;

  IF v_wallet_id IS NOT NULL THEN
    PERFORM public.credit_wallet(
      v_wallet_id,
      p_amount,
      'parent_topup',
      p_description,
      p_mpesa_ref
    );
  END IF;
END;
$$;


-- ── 5. Fix parent_messages INSERT policy ─────────────────────────
--
-- Old policy had a hardcoded school UUID. Service_role already bypasses RLS;
-- add a proper school-scoped policy for authenticated staff too.

DROP POLICY IF EXISTS "System inserts messages" ON public.parent_messages;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='parent_messages'
  ) THEN
    DROP POLICY IF EXISTS "pm_insert_school" ON public.parent_messages;
    CREATE POLICY "pm_insert_school" ON public.parent_messages
      FOR INSERT TO authenticated
      WITH CHECK (
        school_id::uuid = public.get_my_school_id()
      );

    DROP POLICY IF EXISTS "pm_service" ON public.parent_messages;
    CREATE POLICY "pm_service" ON public.parent_messages
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;


-- ── Verification ─────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'parent_sessions: %',
    (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema='public' AND table_name='parent_sessions');
  RAISE NOTICE 'mpesa_callbacks: %',
    (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema='public' AND table_name='mpesa_callbacks');
  RAISE NOTICE 'voucher_products: %',
    (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema='public' AND table_name='voucher_products');
  RAISE NOTICE 'increment_wallet_balance: %',
    (SELECT COUNT(*) FROM pg_proc WHERE proname='increment_wallet_balance');
END $$;
