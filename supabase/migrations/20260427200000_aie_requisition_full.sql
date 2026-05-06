-- ============================================================
-- AIE Requisition Full — Item-level tracking
-- Extends aie_forms with requisition_items + issuances
-- Depletion view, pg_cron alert, RLS
-- ============================================================

-- ── 1. Add 'submitted' and 'partially_fulfilled' to aie_forms status ──────────

ALTER TABLE public.aie_forms
  DROP CONSTRAINT IF EXISTS aie_forms_status_check;

ALTER TABLE public.aie_forms
  ADD CONSTRAINT aie_forms_status_check
  CHECK (status IN ('pending','submitted','approved','partially_fulfilled','fulfilled','received','closed','rejected'));

-- ── 2. Drop existing tables to recreate with correct schema ──────────────────
-- (handles case where a previous partial migration left wrong columns)

DROP TABLE IF EXISTS public.requisition_item_issuances CASCADE;
DROP TABLE IF EXISTS public.requisition_items          CASCADE;

-- ── 3. requisition_items ──────────────────────────────────────────────────────

CREATE TABLE public.requisition_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  aie_form_id         uuid NOT NULL REFERENCES public.aie_forms(id) ON DELETE CASCADE,
  item_name           text NOT NULL,
  unit                text NOT NULL DEFAULT 'unit',
  quantity_requested  integer NOT NULL CHECK (quantity_requested > 0),
  quantity_approved   integer NOT NULL DEFAULT 0 CHECK (quantity_approved >= 0),
  quantity_fulfilled  integer NOT NULL DEFAULT 0 CHECK (quantity_fulfilled >= 0),
  unit_cost           numeric(12,2),
  created_at          timestamptz DEFAULT now()
);

CREATE OR REPLACE VIEW public.requisition_items_view AS
  SELECT *,
    GREATEST(0, quantity_approved - quantity_fulfilled) AS quantity_remaining,
    CASE WHEN quantity_approved > 0
      THEN ROUND((quantity_fulfilled::numeric / quantity_approved) * 100, 1)
      ELSE 0
    END AS pct_fulfilled
  FROM public.requisition_items;

-- ── 4. requisition_item_issuances ─────────────────────────────────────────────

CREATE TABLE public.requisition_item_issuances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  item_id         uuid NOT NULL REFERENCES public.requisition_items(id) ON DELETE CASCADE,
  issued_to       uuid REFERENCES auth.users(id),
  issued_to_name  text,
  quantity_issued integer NOT NULL CHECK (quantity_issued > 0),
  issued_by       uuid REFERENCES auth.users(id),
  issued_at       timestamptz DEFAULT now(),
  acknowledged_at timestamptz,
  notes           text
);

-- ── 5. Trigger: update quantity_fulfilled on issuance ─────────────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_update_quantity_fulfilled()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.requisition_items
  SET quantity_fulfilled = quantity_fulfilled + NEW.quantity_issued
  WHERE id = NEW.item_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_quantity_fulfilled ON public.requisition_item_issuances;
CREATE TRIGGER trg_update_quantity_fulfilled
  AFTER INSERT ON public.requisition_item_issuances
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_update_quantity_fulfilled();

-- ── 6. Trigger: update aie_forms status after item fulfillment ────────────────

CREATE OR REPLACE FUNCTION public.trg_fn_update_aie_status()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_form_id   uuid;
  v_total     integer;
  v_fulfilled integer;
BEGIN
  SELECT aie_form_id INTO v_form_id FROM public.requisition_items WHERE id = NEW.id;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE quantity_approved > 0 AND quantity_fulfilled >= quantity_approved)
  INTO v_total, v_fulfilled
  FROM public.requisition_items
  WHERE aie_form_id = v_form_id;

  IF v_total > 0 AND v_fulfilled = v_total THEN
    UPDATE public.aie_forms SET status = 'fulfilled', fulfilled_at = now()
    WHERE id = v_form_id AND status NOT IN ('received','closed');
  ELSIF v_fulfilled > 0 THEN
    UPDATE public.aie_forms SET status = 'partially_fulfilled'
    WHERE id = v_form_id AND status = 'approved';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_update_aie_status ON public.requisition_items;
CREATE TRIGGER trg_update_aie_status
  AFTER UPDATE OF quantity_fulfilled ON public.requisition_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_update_aie_status();

-- ── 7. Depletion view ─────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.storekeeper_depletion_view;
CREATE VIEW public.storekeeper_depletion_view AS
SELECT
  ri.id                 AS item_id,
  ri.school_id,
  ri.aie_form_id,
  af.form_number,
  af.department,
  af.status             AS form_status,
  ri.item_name,
  ri.unit,
  ri.quantity_approved,
  ri.quantity_fulfilled,
  GREATEST(0, ri.quantity_approved - ri.quantity_fulfilled) AS quantity_remaining,
  CASE WHEN ri.quantity_approved > 0
    THEN ROUND((ri.quantity_fulfilled::numeric / ri.quantity_approved) * 100, 1)
    ELSE 0
  END AS pct_fulfilled,
  ri.unit_cost,
  ri.created_at
FROM public.requisition_items ri
JOIN public.aie_forms af ON af.id = ri.aie_form_id
WHERE af.status IN ('approved', 'partially_fulfilled');

-- ── 8. Depletion alert function ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_item_depletion()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM public.storekeeper_depletion_view
    WHERE pct_fulfilled >= 80
  LOOP
    INSERT INTO public.alerts (school_id, type, severity, title, detail)
    VALUES (
      r.school_id,
      'item_depletion',
      CASE WHEN r.pct_fulfilled >= 95 THEN 'critical' WHEN r.pct_fulfilled >= 90 THEN 'high' ELSE 'medium' END,
      r.item_name || ' is ' || r.pct_fulfilled || '% depleted (' || r.form_number || ')',
      jsonb_build_object(
        'item_id',            r.item_id,
        'aie_form_id',        r.aie_form_id,
        'form_number',        r.form_number,
        'pct_fulfilled',      r.pct_fulfilled,
        'quantity_remaining', r.quantity_remaining
      )
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- ── 9. pg_cron — daily 5 AM UTC (wrapped — fails gracefully if not enabled) ───

DO $$
BEGIN
  PERFORM cron.schedule('check-item-depletion', '0 5 * * *', 'SELECT public.check_item_depletion()');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not enabled — depletion cron skipped: %', SQLERRM;
END;
$$;

-- ── 10. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE public.requisition_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisition_item_issuances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS req_items_select      ON public.requisition_items;
DROP POLICY IF EXISTS req_items_insert      ON public.requisition_items;
DROP POLICY IF EXISTS req_items_update      ON public.requisition_items;
DROP POLICY IF EXISTS req_items_service_all ON public.requisition_items;

CREATE POLICY "req_items_select" ON public.requisition_items
  FOR SELECT USING (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "req_items_insert" ON public.requisition_items
  FOR INSERT WITH CHECK (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "req_items_update" ON public.requisition_items
  FOR UPDATE USING (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "req_items_service_all" ON public.requisition_items
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS req_issues_select      ON public.requisition_item_issuances;
DROP POLICY IF EXISTS req_issues_insert      ON public.requisition_item_issuances;
DROP POLICY IF EXISTS req_issues_service_all ON public.requisition_item_issuances;

CREATE POLICY "req_issues_select" ON public.requisition_item_issuances
  FOR SELECT USING (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "req_issues_insert" ON public.requisition_item_issuances
  FOR INSERT WITH CHECK (school_id::text = public.get_my_school_id()::text);

CREATE POLICY "req_issues_service_all" ON public.requisition_item_issuances
  FOR ALL USING (auth.role() = 'service_role');

-- ── 11. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX idx_req_items_aie_form  ON public.requisition_items (aie_form_id);
CREATE INDEX idx_req_items_school    ON public.requisition_items (school_id);
CREATE INDEX idx_req_issues_item     ON public.requisition_item_issuances (item_id);
CREATE INDEX idx_req_issues_school   ON public.requisition_item_issuances (school_id);
CREATE INDEX idx_req_issues_issued_to ON public.requisition_item_issuances (issued_to);
