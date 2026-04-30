-- ================================================================
-- SYCHAR WALLET SYSTEM — 3-TABLE FINANCIAL ARCHITECTURE
-- Rule: NEVER update a balance directly. Always INSERT to
-- transactions first. Triggers update the wallet from there.
-- ================================================================

-- pg_cron required for daily reset job
CREATE EXTENSION IF NOT EXISTS pg_cron;


-- ── TABLE 1: WALLETS — liquid balance per student ─────────────
CREATE TABLE IF NOT EXISTS student_wallets (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id       uuid NOT NULL,
  student_id      uuid NOT NULL REFERENCES students(id)
                  ON DELETE CASCADE UNIQUE,
  student_name    text NOT NULL,
  admission_no    text,
  class_name      text,
  balance_kes     numeric(10,2) NOT NULL DEFAULT 0.00,
  daily_limit_kes numeric(10,2) DEFAULT 200.00,
  today_spent_kes numeric(10,2) DEFAULT 0.00,
  is_frozen       boolean DEFAULT false,
  frozen_by       text,
  frozen_at       timestamptz,
  freeze_reason   text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  CONSTRAINT wallet_balance_non_negative CHECK (balance_kes >= 0)
);

-- Ensure all columns exist (idempotent — handles pre-existing table with partial schema)
ALTER TABLE student_wallets
  ADD COLUMN IF NOT EXISTS school_id       uuid,
  ADD COLUMN IF NOT EXISTS student_id      uuid,
  ADD COLUMN IF NOT EXISTS student_name    text,
  ADD COLUMN IF NOT EXISTS admission_no    text,
  ADD COLUMN IF NOT EXISTS class_name      text,
  ADD COLUMN IF NOT EXISTS balance_kes     numeric(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS daily_limit_kes numeric(10,2) DEFAULT 200.00,
  ADD COLUMN IF NOT EXISTS today_spent_kes numeric(10,2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS is_frozen       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS frozen_by       text,
  ADD COLUMN IF NOT EXISTS frozen_at       timestamptz,
  ADD COLUMN IF NOT EXISTS freeze_reason   text,
  ADD COLUMN IF NOT EXISTS created_at      timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_wallets_school   ON student_wallets(school_id);
CREATE INDEX IF NOT EXISTS idx_wallets_student  ON student_wallets(student_id);

ALTER TABLE student_wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wallets_school"   ON student_wallets;
DROP POLICY IF EXISTS "wallets_service"  ON student_wallets;
CREATE POLICY "wallets_school"  ON student_wallets FOR ALL TO authenticated
  USING (school_id = get_my_school_id());
CREATE POLICY "wallets_service" ON student_wallets FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'student_wallets'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE student_wallets;
  END IF;
END $$;


-- ── TABLE 2: VOUCHERS — prepaid items per student ─────────────
CREATE TABLE IF NOT EXISTS student_vouchers (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id       uuid NOT NULL,
  student_id      uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  student_name    text NOT NULL,
  admission_no    text,
  item_type       text NOT NULL
                  CHECK (item_type IN (
                    'bread','lunch','supper','breakfast',
                    'snack','milk','transport','activity'
                  )),
  item_label      text NOT NULL,
  unit_label      text DEFAULT 'piece',
  qty_remaining   integer NOT NULL DEFAULT 0,
  qty_issued      integer NOT NULL DEFAULT 0,
  qty_used        integer NOT NULL DEFAULT 0,
  CONSTRAINT voucher_qty_check CHECK (
    qty_remaining = qty_issued - qty_used AND qty_remaining >= 0
  ),
  valid_from      date NOT NULL DEFAULT CURRENT_DATE,
  valid_until     date NOT NULL,
  token_hash      text UNIQUE,
  token_payload   jsonb DEFAULT '{}',
  qr_data         text,
  low_qty_threshold integer DEFAULT 2,
  low_alert_sent  boolean DEFAULT false,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(school_id, student_id, item_type, valid_from)
);

-- Ensure all columns exist (idempotent)
ALTER TABLE student_vouchers
  ADD COLUMN IF NOT EXISTS school_id          uuid,
  ADD COLUMN IF NOT EXISTS student_id         uuid,
  ADD COLUMN IF NOT EXISTS student_name       text,
  ADD COLUMN IF NOT EXISTS admission_no       text,
  ADD COLUMN IF NOT EXISTS item_type          text,
  ADD COLUMN IF NOT EXISTS item_label         text,
  ADD COLUMN IF NOT EXISTS unit_label         text DEFAULT 'piece',
  ADD COLUMN IF NOT EXISTS qty_remaining      integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_issued         integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_used           integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valid_from         date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS valid_until        date,
  ADD COLUMN IF NOT EXISTS token_hash         text,
  ADD COLUMN IF NOT EXISTS token_payload      jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS qr_data            text,
  ADD COLUMN IF NOT EXISTS low_qty_threshold  integer DEFAULT 2,
  ADD COLUMN IF NOT EXISTS low_alert_sent     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active          boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at         timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at         timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_vouchers_student ON student_vouchers(student_id, item_type, valid_until DESC);
CREATE INDEX IF NOT EXISTS idx_vouchers_active  ON student_vouchers(school_id, item_type, valid_until) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_vouchers_token   ON student_vouchers(token_hash) WHERE token_hash IS NOT NULL;

ALTER TABLE student_vouchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vouchers_school"  ON student_vouchers;
DROP POLICY IF EXISTS "vouchers_service" ON student_vouchers;
CREATE POLICY "vouchers_school"  ON student_vouchers FOR ALL TO authenticated
  USING (school_id = get_my_school_id());
CREATE POLICY "vouchers_service" ON student_vouchers FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'student_vouchers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE student_vouchers;
  END IF;
END $$;


-- ── TABLE 3: TRANSACTIONS — the immutable ledger ───────────────
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id       uuid NOT NULL,
  student_id      uuid NOT NULL REFERENCES students(id),
  student_name    text NOT NULL,
  admission_no    text,
  ledger          text NOT NULL CHECK (ledger IN ('wallet','voucher')),
  direction       text NOT NULL CHECK (direction IN ('credit','debit')),
  amount_kes      numeric(10,2),
  qty             integer,
  item_type       text,
  wallet_id       uuid REFERENCES student_wallets(id),
  voucher_id      uuid REFERENCES student_vouchers(id),
  balance_after_kes numeric(10,2),
  qty_after         integer,
  tx_type         text NOT NULL CHECK (tx_type IN (
    'parent_topup','school_credit','refund','adjustment',
    'canteen_purchase','wallet_transfer',
    'voucher_issued','voucher_topup','voucher_refund',
    'voucher_redeemed','voucher_expired'
  )),
  mpesa_ref       text,
  payment_method  text,
  authorised_by   text,
  auth_method     text,
  pos_location    text,
  pos_staff_id    text,
  description     text NOT NULL,
  internal_note   text,
  created_at      timestamptz DEFAULT now() NOT NULL
);

-- Ensure all columns exist (idempotent — this is the key fix for pre-existing tables)
ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS school_id         uuid,
  ADD COLUMN IF NOT EXISTS student_id        uuid,
  ADD COLUMN IF NOT EXISTS student_name      text,
  ADD COLUMN IF NOT EXISTS admission_no      text,
  ADD COLUMN IF NOT EXISTS ledger            text,
  ADD COLUMN IF NOT EXISTS direction         text,
  ADD COLUMN IF NOT EXISTS amount_kes        numeric(10,2),
  ADD COLUMN IF NOT EXISTS qty               integer,
  ADD COLUMN IF NOT EXISTS item_type         text,
  ADD COLUMN IF NOT EXISTS wallet_id         uuid,
  ADD COLUMN IF NOT EXISTS voucher_id        uuid,
  ADD COLUMN IF NOT EXISTS balance_after_kes numeric(10,2),
  ADD COLUMN IF NOT EXISTS qty_after         integer,
  ADD COLUMN IF NOT EXISTS tx_type           text,
  ADD COLUMN IF NOT EXISTS mpesa_ref         text,
  ADD COLUMN IF NOT EXISTS payment_method    text,
  ADD COLUMN IF NOT EXISTS authorised_by     text,
  ADD COLUMN IF NOT EXISTS auth_method       text,
  ADD COLUMN IF NOT EXISTS pos_location      text,
  ADD COLUMN IF NOT EXISTS pos_staff_id      text,
  ADD COLUMN IF NOT EXISTS description       text,
  ADD COLUMN IF NOT EXISTS internal_note     text,
  ADD COLUMN IF NOT EXISTS created_at        timestamptz DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_tx_student    ON wallet_transactions(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_wallet     ON wallet_transactions(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_voucher    ON wallet_transactions(voucher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_school_date ON wallet_transactions(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_mpesa      ON wallet_transactions(mpesa_ref) WHERE mpesa_ref IS NOT NULL;

ALTER TABLE wallet_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tx_school_read" ON wallet_transactions;
DROP POLICY IF EXISTS "tx_service"     ON wallet_transactions;
DROP POLICY IF EXISTS "tx_no_update"   ON wallet_transactions;
DROP POLICY IF EXISTS "tx_no_delete"   ON wallet_transactions;

CREATE POLICY "tx_school_read" ON wallet_transactions
  FOR SELECT TO authenticated USING (school_id = get_my_school_id());
CREATE POLICY "tx_service"     ON wallet_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "tx_no_update"   ON wallet_transactions
  FOR UPDATE TO authenticated USING (false);
CREATE POLICY "tx_no_delete"   ON wallet_transactions
  FOR DELETE TO authenticated USING (false);


-- ================================================================
-- TRIGGERS
-- ================================================================

-- ── TRIGGER 1: Update wallet balance ──────────────────────────
CREATE OR REPLACE FUNCTION apply_wallet_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_new_balance   numeric(10,2);
  v_daily_limit   numeric(10,2);
BEGIN
  IF NEW.ledger != 'wallet' OR NEW.wallet_id IS NULL THEN RETURN NEW; END IF;

  SELECT balance_kes, daily_limit_kes
  INTO v_new_balance, v_daily_limit
  FROM student_wallets WHERE id = NEW.wallet_id FOR UPDATE;

  IF NEW.direction = 'credit' THEN
    v_new_balance := v_new_balance + COALESCE(NEW.amount_kes, 0);
  ELSIF NEW.direction = 'debit' THEN
    IF v_new_balance < COALESCE(NEW.amount_kes, 0) THEN
      RAISE EXCEPTION 'Insufficient wallet balance. Available: KES %, Requested: KES %',
        v_new_balance, NEW.amount_kes;
    END IF;
    v_new_balance := v_new_balance - COALESCE(NEW.amount_kes, 0);
  END IF;

  UPDATE student_wallets
  SET
    balance_kes     = v_new_balance,
    today_spent_kes = CASE
      WHEN NEW.direction = 'debit'
        THEN today_spent_kes + COALESCE(NEW.amount_kes, 0)
      ELSE today_spent_kes
    END,
    updated_at = now()
  WHERE id = NEW.wallet_id;

  UPDATE wallet_transactions SET balance_after_kes = v_new_balance WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_wallet_tx ON wallet_transactions;
CREATE TRIGGER trg_wallet_tx
  AFTER INSERT ON wallet_transactions
  FOR EACH ROW WHEN (NEW.ledger = 'wallet')
  EXECUTE FUNCTION apply_wallet_transaction();


-- ── TRIGGER 2: Update voucher qty + low-qty alert ─────────────
CREATE OR REPLACE FUNCTION apply_voucher_transaction()
RETURNS TRIGGER AS $$
DECLARE
  v_qty_remaining integer;
  v_low_threshold integer;
  v_student_name  text;
  v_parent_id     text;
BEGIN
  IF NEW.ledger != 'voucher' OR NEW.voucher_id IS NULL THEN RETURN NEW; END IF;

  SELECT qty_remaining, low_qty_threshold
  INTO v_qty_remaining, v_low_threshold
  FROM student_vouchers WHERE id = NEW.voucher_id FOR UPDATE;

  IF NEW.direction = 'credit' THEN
    v_qty_remaining := v_qty_remaining + COALESCE(NEW.qty, 0);
    UPDATE student_vouchers
    SET qty_issued = qty_issued + COALESCE(NEW.qty, 0),
        qty_remaining = v_qty_remaining,
        updated_at = now()
    WHERE id = NEW.voucher_id;
  ELSIF NEW.direction = 'debit' THEN
    IF v_qty_remaining < COALESCE(NEW.qty, 1) THEN
      RAISE EXCEPTION 'Insufficient vouchers. Remaining: %, Requested: %',
        v_qty_remaining, NEW.qty;
    END IF;
    v_qty_remaining := v_qty_remaining - COALESCE(NEW.qty, 1);
    UPDATE student_vouchers
    SET qty_used = qty_used + COALESCE(NEW.qty, 1),
        qty_remaining = v_qty_remaining,
        updated_at = now()
    WHERE id = NEW.voucher_id;
  END IF;

  UPDATE wallet_transactions SET qty_after = v_qty_remaining WHERE id = NEW.id;

  -- Low-quantity alert to parent (graceful — won't fail if parent_messages missing)
  IF v_qty_remaining <= v_low_threshold THEN
    SELECT sv.student_name, s.guardian_id::text
    INTO v_student_name, v_parent_id
    FROM student_vouchers sv
    JOIN students s ON s.id = sv.student_id
    WHERE sv.id = NEW.voucher_id;

    IF v_parent_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM student_vouchers WHERE id = NEW.voucher_id AND low_alert_sent = true
    ) THEN
      BEGIN
        INSERT INTO parent_messages (
          parent_id, school_id, student_id,
          message_body, sender_type, message_type, metadata
        ) VALUES (
          v_parent_id, NEW.school_id::text, NEW.student_id::text,
          '🍞 ' || v_student_name || ' has only ' || v_qty_remaining ||
          ' ' || COALESCE(NEW.item_type, 'voucher') ||
          ' voucher(s) remaining. Top up to keep them covered.',
          'system_bot', 'alert',
          jsonb_build_object(
            'type',       'voucher_low',
            'item_type',  NEW.item_type,
            'remaining',  v_qty_remaining,
            'voucher_id', NEW.voucher_id::text,
            'action',     'topup_voucher'
          )
        );
        UPDATE student_vouchers SET low_alert_sent = true WHERE id = NEW.voucher_id;
      EXCEPTION WHEN OTHERS THEN
        NULL; -- parent_messages may not exist yet; alert is non-critical
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_voucher_tx ON wallet_transactions;
CREATE TRIGGER trg_voucher_tx
  AFTER INSERT ON wallet_transactions
  FOR EACH ROW WHEN (NEW.ledger = 'voucher')
  EXECUTE FUNCTION apply_voucher_transaction();


-- ── TRIGGER 3: Reset today_spent at midnight EAT ──────────────
SELECT cron.unschedule('wallet-daily-reset') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'wallet-daily-reset'
);
SELECT cron.schedule(
  'wallet-daily-reset',
  '0 21 * * *',
  $$
    UPDATE student_wallets
    SET today_spent_kes = 0, updated_at = now()
    WHERE today_spent_kes > 0;
  $$
);


-- ================================================================
-- HELPER FUNCTIONS
-- ================================================================

-- Credit wallet (parent top-up, school credit)
CREATE OR REPLACE FUNCTION credit_wallet(
  p_wallet_id     uuid,
  p_amount_kes    numeric,
  p_tx_type       text,
  p_description   text,
  p_mpesa_ref     text DEFAULT NULL,
  p_authorised_by text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_wallet student_wallets%ROWTYPE;
  v_tx_id  uuid;
BEGIN
  SELECT * INTO v_wallet FROM student_wallets WHERE id = p_wallet_id;
  INSERT INTO wallet_transactions (
    school_id, student_id, student_name, admission_no,
    ledger, direction, amount_kes, wallet_id,
    tx_type, description, mpesa_ref, authorised_by, pos_location
  ) VALUES (
    v_wallet.school_id, v_wallet.student_id,
    v_wallet.student_name, v_wallet.admission_no,
    'wallet', 'credit', p_amount_kes, p_wallet_id,
    p_tx_type, p_description, p_mpesa_ref, p_authorised_by, 'parent_app'
  ) RETURNING id INTO v_tx_id;
  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Debit wallet (canteen purchase)
CREATE OR REPLACE FUNCTION debit_wallet(
  p_wallet_id    uuid,
  p_amount_kes   numeric,
  p_description  text,
  p_pos_staff_id text DEFAULT NULL,
  p_pos_location text DEFAULT 'canteen'
) RETURNS uuid AS $$
DECLARE
  v_wallet student_wallets%ROWTYPE;
  v_tx_id  uuid;
BEGIN
  SELECT * INTO v_wallet FROM student_wallets WHERE id = p_wallet_id;

  IF v_wallet.is_frozen THEN
    RAISE EXCEPTION 'Wallet is frozen: %', COALESCE(v_wallet.freeze_reason, 'locked by parent');
  END IF;
  IF v_wallet.today_spent_kes + p_amount_kes > v_wallet.daily_limit_kes THEN
    RAISE EXCEPTION 'Daily limit of KES % would be exceeded', v_wallet.daily_limit_kes;
  END IF;

  INSERT INTO wallet_transactions (
    school_id, student_id, student_name, admission_no,
    ledger, direction, amount_kes, wallet_id,
    tx_type, description, pos_staff_id, pos_location
  ) VALUES (
    v_wallet.school_id, v_wallet.student_id,
    v_wallet.student_name, v_wallet.admission_no,
    'wallet', 'debit', p_amount_kes, p_wallet_id,
    'canteen_purchase', p_description, p_pos_staff_id, p_pos_location
  ) RETURNING id INTO v_tx_id;
  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Issue vouchers (daily bread token)
CREATE OR REPLACE FUNCTION issue_vouchers(
  p_voucher_id  uuid,
  p_qty         integer,
  p_description text DEFAULT 'Daily voucher issued'
) RETURNS uuid AS $$
DECLARE
  v_voucher student_vouchers%ROWTYPE;
  v_tx_id   uuid;
BEGIN
  SELECT * INTO v_voucher FROM student_vouchers WHERE id = p_voucher_id;
  INSERT INTO wallet_transactions (
    school_id, student_id, student_name, admission_no,
    ledger, direction, qty, item_type, voucher_id,
    tx_type, description, pos_location
  ) VALUES (
    v_voucher.school_id, v_voucher.student_id,
    v_voucher.student_name, v_voucher.admission_no,
    'voucher', 'credit', p_qty, v_voucher.item_type, p_voucher_id,
    'voucher_issued', p_description, 'school_office'
  ) RETURNING id INTO v_tx_id;
  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Redeem voucher (canteen scans student QR)
CREATE OR REPLACE FUNCTION redeem_voucher(
  p_token_hash   text,
  p_pos_staff_id text,
  p_item_type    text DEFAULT NULL
) RETURNS TABLE(
  success       boolean,
  student_name  text,
  item_type     text,
  qty_remaining integer,
  message       text
) AS $$
DECLARE
  v_voucher student_vouchers%ROWTYPE;
  v_tx_id   uuid;
BEGIN
  SELECT * INTO v_voucher
  FROM student_vouchers
  WHERE token_hash = p_token_hash
    AND is_active = true
    AND valid_until >= CURRENT_DATE
    AND qty_remaining > 0
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, ''::text, ''::text, 0, 'Invalid or expired voucher'::text;
    RETURN;
  END IF;

  INSERT INTO wallet_transactions (
    school_id, student_id, student_name, admission_no,
    ledger, direction, qty, item_type, voucher_id,
    tx_type, description, pos_staff_id, pos_location
  ) VALUES (
    v_voucher.school_id, v_voucher.student_id,
    v_voucher.student_name, v_voucher.admission_no,
    'voucher', 'debit', 1, v_voucher.item_type, v_voucher.id,
    'voucher_redeemed', 'Voucher redeemed at canteen',
    p_pos_staff_id, 'canteen'
  ) RETURNING id INTO v_tx_id;

  SELECT sv.qty_remaining INTO v_voucher.qty_remaining
  FROM student_vouchers sv WHERE sv.id = v_voucher.id;

  RETURN QUERY SELECT
    true,
    v_voucher.student_name,
    v_voucher.item_type,
    v_voucher.qty_remaining,
    ('✓ ' || v_voucher.item_type || ' collected. ' ||
     v_voucher.qty_remaining || ' remaining today.')::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
