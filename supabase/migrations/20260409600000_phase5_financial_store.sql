-- Phase 5: Financial & Store Modules
-- Tables: inventory_items, inventory_logs (IMMUTABLE), aie_forms,
--         vote_heads, vote_head_transactions, student_wallets, wallet_transactions

-- ── inventory_items ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inventory_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name            text NOT NULL,
  unit            text NOT NULL DEFAULT 'units',
  category        text NOT NULL DEFAULT 'General',  -- e.g. Kitchen, Stationery, Cleaning
  current_stock   numeric(12,2) NOT NULL DEFAULT 0,
  min_stock       numeric(12,2) NOT NULL DEFAULT 0,
  reorder_point   numeric(12,2) NOT NULL DEFAULT 0,
  store_location  text,
  daily_ration    numeric(10,4),    -- per-student expected daily consumption
  geo_lat         double precision, -- store geofence anchor
  geo_lng         double precision,
  geo_radius_m    integer DEFAULT 50,
  is_active       boolean DEFAULT true,
  created_at      timestamptz DEFAULT now()
);

-- ── inventory_logs (IMMUTABLE BIN CARD) ──────────────────────────────────────
-- server_timestamp is forced to now() by trigger — cannot be set by client.
-- UPDATE and DELETE are blocked by triggers — this table is append-only.

CREATE TABLE IF NOT EXISTS public.inventory_logs (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id             uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  item_id               uuid NOT NULL REFERENCES public.inventory_items(id),
  transaction_type      text NOT NULL CHECK (transaction_type IN ('ISSUE','RESTOCK','DAMAGE','WRITE-OFF','RESERVE')),
  quantity_before       numeric(12,2) NOT NULL,
  quantity_change       numeric(12,2) NOT NULL,  -- positive=in, negative=out
  quantity_after        numeric(12,2) NOT NULL,
  issued_to             text,          -- person name
  issued_to_role        text,          -- role/position
  authorized_by         uuid REFERENCES public.requisitions(id), -- approved req required for ISSUE
  storekeeper_id        text NOT NULL,
  geo_verified          boolean DEFAULT false,
  lat                   double precision,
  lng                   double precision,
  photo_evidence_url    text,
  delivery_note_url     text,
  supplier_name         text,
  notes                 text,
  server_timestamp      timestamptz NOT NULL DEFAULT now()
);

-- Trigger: force server_timestamp = now() regardless of what client sends
CREATE OR REPLACE FUNCTION public.force_server_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.server_timestamp := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_logs_force_timestamp ON public.inventory_logs;
CREATE TRIGGER inventory_logs_force_timestamp
  BEFORE INSERT ON public.inventory_logs
  FOR EACH ROW EXECUTE FUNCTION public.force_server_timestamp();

-- Trigger: prevent UPDATE on inventory_logs
CREATE OR REPLACE FUNCTION public.prevent_inventory_log_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inventory_logs is immutable — UPDATE is not permitted';
END;
$$;

DROP TRIGGER IF EXISTS inventory_logs_no_update ON public.inventory_logs;
CREATE TRIGGER inventory_logs_no_update
  BEFORE UPDATE ON public.inventory_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_inventory_log_update();

-- Trigger: prevent DELETE on inventory_logs
CREATE OR REPLACE FUNCTION public.prevent_inventory_log_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inventory_logs is immutable — DELETE is not permitted';
END;
$$;

DROP TRIGGER IF EXISTS inventory_logs_no_delete ON public.inventory_logs;
CREATE TRIGGER inventory_logs_no_delete
  BEFORE DELETE ON public.inventory_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_inventory_log_delete();

-- ── aie_forms ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.aie_forms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  form_number     text,                  -- e.g. AIE/2026/001
  requested_by    text NOT NULL,
  department      text NOT NULL,
  date            date NOT NULL DEFAULT CURRENT_DATE,
  tsc_number      text,
  id_number       text,
  items           jsonb NOT NULL DEFAULT '[]', -- [{description,unit,quantity,amount}]
  total_amount    numeric(14,2) NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','fulfilled','received','closed','rejected')),
  notes           text,
  pdf_url         text,
  pdf_hash        text,    -- SHA-256 of form JSON at time of PDF generation
  pdf_expires_at  timestamptz,
  created_by      text NOT NULL, -- staff_records.id
  approved_by     text,
  approved_at     timestamptz,
  fulfilled_at    timestamptz,
  received_at     timestamptz,
  closed_at       timestamptz,
  created_at      timestamptz DEFAULT now()
);

-- Auto-generate form_number on insert
CREATE OR REPLACE FUNCTION public.generate_aie_form_number()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  seq integer;
BEGIN
  SELECT COALESCE(MAX(CAST(SPLIT_PART(form_number, '/', 3) AS integer)), 0) + 1
  INTO seq
  FROM public.aie_forms
  WHERE school_id = NEW.school_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM now());

  NEW.form_number := 'AIE/' || EXTRACT(YEAR FROM now())::text || '/' || LPAD(seq::text, 3, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aie_forms_number ON public.aie_forms;
CREATE TRIGGER aie_forms_number
  BEFORE INSERT ON public.aie_forms
  FOR EACH ROW WHEN (NEW.form_number IS NULL)
  EXECUTE FUNCTION public.generate_aie_form_number();

-- ── vote_heads ────────────────────────────────────────────────────────────────
-- PRINCIPAL ONLY at both RLS and API level.

CREATE TABLE IF NOT EXISTS public.vote_heads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id        uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name             text NOT NULL,         -- e.g. "RMI", "Activity", "Tuition", "KICD"
  code             text NOT NULL,         -- short code
  category         text NOT NULL DEFAULT 'Operations',  -- virement category grouping
  allocated_amount numeric(14,2) NOT NULL DEFAULT 0,
  spent_amount     numeric(14,2) NOT NULL DEFAULT 0,
  academic_year    text NOT NULL,
  term             integer NOT NULL CHECK (term BETWEEN 1 AND 3),
  created_at       timestamptz DEFAULT now()
);

-- ── vote_head_transactions ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vote_head_transactions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id         uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  from_vote_head_id uuid NOT NULL REFERENCES public.vote_heads(id),
  to_vote_head_id   uuid NOT NULL REFERENCES public.vote_heads(id),
  amount            numeric(14,2) NOT NULL,
  justification     text NOT NULL,
  is_cross_category boolean NOT NULL DEFAULT false,
  is_blocked        boolean NOT NULL DEFAULT false,
  bom_document_url  text,   -- required for cross-category override
  approved_by       text,   -- principal staff_records.id
  created_at        timestamptz DEFAULT now()
);

-- ── student_wallets ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.student_wallets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id     text NOT NULL,
  balance        numeric(10,2) NOT NULL DEFAULT 0,
  daily_limit    numeric(10,2) NOT NULL DEFAULT 100,
  is_frozen      boolean NOT NULL DEFAULT false,
  last_topup_at  timestamptz,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (school_id, student_id)
);

-- ── wallet_transactions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  wallet_id     uuid NOT NULL REFERENCES public.student_wallets(id),
  type          text NOT NULL CHECK (type IN ('purchase','topup','refund','freeze','adjustment')),
  amount        numeric(10,2) NOT NULL,
  balance_after numeric(10,2) NOT NULL,
  description   text,
  processed_by  text,
  mpesa_ref     text,
  timestamp     timestamptz DEFAULT now()
);

-- ── Alerts table (shared) ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.alerts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id    uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  type         text NOT NULL,   -- 'inventory_leakage','canteen_bullying','wallet_zero','no_canteen_use'
  severity     text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  title        text NOT NULL,
  detail       jsonb DEFAULT '{}',
  is_resolved  boolean DEFAULT false,
  resolved_at  timestamptz,
  created_at   timestamptz DEFAULT now()
);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.inventory_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aie_forms             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vote_heads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vote_head_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_wallets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts                ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (idempotent)
DO $$ BEGIN
  DROP POLICY IF EXISTS "inv_items_select"   ON public.inventory_items;
  DROP POLICY IF EXISTS "inv_items_write"    ON public.inventory_items;
  DROP POLICY IF EXISTS "inv_logs_select"    ON public.inventory_logs;
  DROP POLICY IF EXISTS "inv_logs_insert"    ON public.inventory_logs;
  DROP POLICY IF EXISTS "aie_select"         ON public.aie_forms;
  DROP POLICY IF EXISTS "aie_insert"         ON public.aie_forms;
  DROP POLICY IF EXISTS "aie_update"         ON public.aie_forms;
  DROP POLICY IF EXISTS "vote_heads_select"  ON public.vote_heads;
  DROP POLICY IF EXISTS "vote_heads_all"     ON public.vote_heads;
  DROP POLICY IF EXISTS "vht_select"         ON public.vote_head_transactions;
  DROP POLICY IF EXISTS "vht_all"            ON public.vote_head_transactions;
  DROP POLICY IF EXISTS "wallets_select"     ON public.student_wallets;
  DROP POLICY IF EXISTS "wallets_all"        ON public.student_wallets;
  DROP POLICY IF EXISTS "wallet_tx_select"   ON public.wallet_transactions;
  DROP POLICY IF EXISTS "wallet_tx_insert"   ON public.wallet_transactions;
  DROP POLICY IF EXISTS "alerts_select"      ON public.alerts;
  DROP POLICY IF EXISTS "alerts_all"         ON public.alerts;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- inventory_items: all school staff can read; storekeeper+principal can write
CREATE POLICY "inv_items_select" ON public.inventory_items
  FOR SELECT USING (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "inv_items_write" ON public.inventory_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.staff_records sr
      WHERE sr.user_id::text = auth.uid()::text
        AND sr.school_id = public.inventory_items.school_id
        AND sr.sub_role IN ('storekeeper','principal')
    )
  );

-- inventory_logs: SELECT + INSERT only (NO UPDATE, NO DELETE — enforced by triggers)
CREATE POLICY "inv_logs_select" ON public.inventory_logs
  FOR SELECT USING (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "inv_logs_insert" ON public.inventory_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_records sr
      WHERE sr.user_id::text = auth.uid()::text
        AND sr.school_id = public.inventory_logs.school_id
        AND sr.sub_role IN ('storekeeper','principal')
    )
  );

-- aie_forms: school staff can read; requestors can create; principal+approvers can update
CREATE POLICY "aie_select" ON public.aie_forms
  FOR SELECT USING (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "aie_insert" ON public.aie_forms
  FOR INSERT WITH CHECK (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "aie_update" ON public.aie_forms
  FOR UPDATE USING (school_id::text = public.get_my_school_id()::text);

-- vote_heads: PRINCIPAL ONLY
CREATE POLICY "vote_heads_select" ON public.vote_heads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff_records sr
      WHERE sr.user_id::text = auth.uid()::text
        AND sr.school_id = public.vote_heads.school_id
        AND sr.sub_role = 'principal'
    )
  );

CREATE POLICY "vote_heads_all" ON public.vote_heads
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.staff_records sr
      WHERE sr.user_id::text = auth.uid()::text
        AND sr.school_id = public.vote_heads.school_id
        AND sr.sub_role = 'principal'
    )
  );

-- vote_head_transactions: PRINCIPAL ONLY
CREATE POLICY "vht_select" ON public.vote_head_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff_records sr
      WHERE sr.user_id::text = auth.uid()::text
        AND sr.school_id = public.vote_head_transactions.school_id
        AND sr.sub_role = 'principal'
    )
  );

CREATE POLICY "vht_all" ON public.vote_head_transactions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.staff_records sr
      WHERE sr.user_id::text = auth.uid()::text
        AND sr.school_id = public.vote_head_transactions.school_id
        AND sr.sub_role = 'principal'
    )
  );

-- student_wallets: principal + bursar + class teacher (for welfare checks)
CREATE POLICY "wallets_select" ON public.student_wallets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff_records sr
      WHERE sr.user_id::text = auth.uid()::text
        AND sr.school_id = public.student_wallets.school_id
        AND sr.sub_role IN ('principal','bursar','class_teacher','bom_teacher')
    )
  );

CREATE POLICY "wallets_all" ON public.student_wallets
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.staff_records sr
      WHERE sr.user_id::text = auth.uid()::text
        AND sr.school_id = public.student_wallets.school_id
        AND sr.sub_role IN ('principal','bursar')
    )
  );

-- wallet_transactions: principal + bursar
CREATE POLICY "wallet_tx_select" ON public.wallet_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.staff_records sr
      WHERE sr.user_id::text = auth.uid()::text
        AND sr.school_id = public.wallet_transactions.school_id
        AND sr.sub_role IN ('principal','bursar')
    )
  );

CREATE POLICY "wallet_tx_insert" ON public.wallet_transactions
  FOR INSERT WITH CHECK (school_id::text = public.get_my_school_id()::text);

-- alerts: principal + relevant staff
CREATE POLICY "alerts_select" ON public.alerts
  FOR SELECT USING (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "alerts_all" ON public.alerts
  FOR ALL USING (school_id::text = public.get_my_school_id()::text);

-- ── Seed FDSE vote-head structure (template, no data) ────────────────────────
-- Schools will have vote_heads auto-created when principal enters FDSE amount.
-- No static seed data here.
