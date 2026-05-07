-- Procurement Intelligence System
-- Bursar uploads → Gemini OCR → Storekeeper verifies → AI analysis → Principal approves → Inventory updated

-- ── SUPPLIERS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS suppliers (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        uuid,
  name             text NOT NULL,
  normalised_name  text NOT NULL,
  phone            text,
  email            text,
  pin_number       text,
  physical_address text,
  total_orders     integer DEFAULT 0,
  total_spend_kes  numeric DEFAULT 0,
  last_delivery_at date,
  trust_score      integer DEFAULT 50,
  is_active        boolean DEFAULT true,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- Add any columns that may be missing from an earlier partial creation
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS school_id        uuid;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS normalised_name  text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS phone            text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS email            text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS pin_number       text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS physical_address text;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS total_orders     integer DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS total_spend_kes  numeric DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS last_delivery_at date;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS trust_score      integer DEFAULT 50;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_active        boolean DEFAULT true;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS updated_at       timestamptz DEFAULT now();

-- Ensure unique constraint exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'suppliers_school_id_normalised_name_key'
  ) THEN
    ALTER TABLE suppliers ADD CONSTRAINT suppliers_school_id_normalised_name_key
      UNIQUE (school_id, normalised_name);
  END IF;
END $$;

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppliers_school"   ON suppliers;
DROP POLICY IF EXISTS "suppliers_service"  ON suppliers;
CREATE POLICY "suppliers_school"   ON suppliers FOR ALL TO authenticated USING (school_id = get_my_school_id());
CREATE POLICY "suppliers_service"  ON suppliers FOR ALL TO service_role  USING (true) WITH CHECK (true);

-- ── PROCUREMENT DOCUMENTS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS procurement_documents (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        uuid NOT NULL,
  document_type    text NOT NULL
    CHECK (document_type IN ('invoice','delivery_note','receipt','quotation','lpo')),
  document_number  text,
  supplier_id      uuid REFERENCES suppliers(id),
  supplier_name    text,
  file_path        text NOT NULL,
  file_url         text,
  mime_type        text,
  file_size_bytes  bigint,
  ocr_status       text DEFAULT 'pending'
    CHECK (ocr_status IN ('pending','processing','completed','failed','manual_review')),
  ocr_confidence   numeric,
  raw_ocr_text     text,
  extracted_date   date,
  extracted_total_kes numeric,
  extracted_tax_kes   numeric,
  extraction_warnings text[],
  ai_analysis      text,
  workflow_status  text DEFAULT 'uploaded'
    CHECK (workflow_status IN (
      'uploaded','ocr_complete','pending_verification',
      'storekeeper_verified','pending_approval',
      'approved','rejected','discrepancy_raised'
    )),
  uploaded_by      uuid NOT NULL REFERENCES staff_records(id),
  uploaded_at      timestamptz DEFAULT now(),
  verified_by      uuid REFERENCES staff_records(id),
  verified_at      timestamptz,
  verification_notes text,
  approved_by      uuid REFERENCES staff_records(id),
  approved_at      timestamptz,
  approval_notes   text,
  rejection_reason text,
  requisition_id   uuid REFERENCES requisitions(id),
  term             integer,
  academic_year    text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pd_school_status ON procurement_documents(school_id, workflow_status, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_pd_supplier      ON procurement_documents(supplier_id, extracted_date DESC);

ALTER TABLE procurement_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pd_school"   ON procurement_documents;
DROP POLICY IF EXISTS "pd_service"  ON procurement_documents;
CREATE POLICY "pd_school"   ON procurement_documents FOR ALL TO authenticated USING (school_id = get_my_school_id());
CREATE POLICY "pd_service"  ON procurement_documents FOR ALL TO service_role  USING (true) WITH CHECK (true);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'procurement_documents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE procurement_documents;
  END IF;
END $$;

-- ── PROCUREMENT LINE ITEMS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS procurement_line_items (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id             uuid NOT NULL,
  document_id           uuid NOT NULL REFERENCES procurement_documents(id) ON DELETE CASCADE,
  item_name             text NOT NULL,
  item_name_normalised  text,
  unit                  text,
  quantity_invoiced     numeric NOT NULL,
  unit_price_kes        numeric NOT NULL,
  total_price_kes       numeric GENERATED ALWAYS AS (quantity_invoiced * unit_price_kes) STORED,
  tax_kes               numeric DEFAULT 0,
  quantity_received     numeric,
  quantity_variance     numeric GENERATED ALWAYS AS (COALESCE(quantity_received, 0) - quantity_invoiced) STORED,
  condition             text CHECK (condition IN ('good','damaged','wrong_item','short_delivery','not_delivered')),
  storekeeper_note      text,
  last_price_kes        numeric,
  price_variance_pct    numeric GENERATED ALWAYS AS (
    CASE WHEN last_price_kes > 0
    THEN ROUND(((unit_price_kes - last_price_kes) / last_price_kes) * 100, 1)
    ELSE NULL END
  ) STORED,
  price_flag            text CHECK (price_flag IN ('normal','increased','significant_increase','decreased','first_purchase')),
  inventory_item_id     uuid,
  inventory_updated     boolean DEFAULT false,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pli_document  ON procurement_line_items(document_id);
CREATE INDEX IF NOT EXISTS idx_pli_item_name ON procurement_line_items(school_id, item_name_normalised);

ALTER TABLE procurement_line_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pli_school"  ON procurement_line_items;
DROP POLICY IF EXISTS "pli_service" ON procurement_line_items;
CREATE POLICY "pli_school"  ON procurement_line_items FOR ALL TO authenticated USING (school_id = get_my_school_id());
CREATE POLICY "pli_service" ON procurement_line_items FOR ALL TO service_role  USING (true) WITH CHECK (true);

-- ── PRICE HISTORY ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS procurement_price_history (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id      uuid NOT NULL,
  item_name      text NOT NULL,
  supplier_id    uuid REFERENCES suppliers(id),
  supplier_name  text NOT NULL,
  unit           text,
  unit_price_kes numeric NOT NULL,
  quantity       numeric,
  document_id    uuid REFERENCES procurement_documents(id),
  delivery_date  date NOT NULL,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pph_item_supplier ON procurement_price_history(school_id, item_name, delivery_date DESC);
CREATE INDEX IF NOT EXISTS idx_pph_item_all      ON procurement_price_history(school_id, item_name, supplier_id);

ALTER TABLE procurement_price_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pph_school"  ON procurement_price_history;
DROP POLICY IF EXISTS "pph_service" ON procurement_price_history;
CREATE POLICY "pph_school"  ON procurement_price_history FOR ALL TO authenticated USING (school_id = get_my_school_id());
CREATE POLICY "pph_service" ON procurement_price_history FOR ALL TO service_role  USING (true) WITH CHECK (true);

-- ── TRIGGER: price flag on insert ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION flag_price_variance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_last_price numeric;
  v_variance   numeric;
BEGIN
  NEW.item_name_normalised := LOWER(TRIM(REGEXP_REPLACE(NEW.item_name, '\s+', ' ', 'g')));

  SELECT unit_price_kes INTO v_last_price
  FROM procurement_price_history
  WHERE school_id = NEW.school_id
    AND item_name = NEW.item_name_normalised
  ORDER BY delivery_date DESC
  LIMIT 1;

  IF v_last_price IS NULL THEN
    NEW.last_price_kes := NULL;
    NEW.price_flag     := 'first_purchase';
  ELSE
    NEW.last_price_kes := v_last_price;
    v_variance         := ((NEW.unit_price_kes - v_last_price) / v_last_price) * 100;
    NEW.price_flag := CASE
      WHEN v_variance >  30 THEN 'significant_increase'
      WHEN v_variance >  10 THEN 'increased'
      WHEN v_variance < -10 THEN 'decreased'
      ELSE 'normal'
    END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_price_flag ON procurement_line_items;
CREATE TRIGGER trg_price_flag
  BEFORE INSERT OR UPDATE ON procurement_line_items
  FOR EACH ROW EXECUTE FUNCTION flag_price_variance();

-- ── TRIGGER: inventory update on principal approval ────────────────────────────
CREATE OR REPLACE FUNCTION update_inventory_on_approval()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item procurement_line_items%ROWTYPE;
  v_inv_id uuid;
BEGIN
  IF NEW.workflow_status = 'approved' AND OLD.workflow_status != 'approved' THEN
    FOR v_item IN
      SELECT * FROM procurement_line_items
      WHERE document_id = NEW.id
        AND quantity_received IS NOT NULL
        AND quantity_received > 0
        AND condition IN ('good','damaged')
        AND inventory_updated = false
    LOOP
      -- Only add 'good' items to stock (damaged = 0)
      IF v_item.inventory_item_id IS NOT NULL THEN
        UPDATE store_inventory
        SET current_stock  = current_stock + CASE v_item.condition WHEN 'good' THEN v_item.quantity_received ELSE 0 END,
            available_stock = available_stock + CASE v_item.condition WHEN 'good' THEN v_item.quantity_received ELSE 0 END,
            updated_at      = now()
        WHERE id = v_item.inventory_item_id;
        v_inv_id := v_item.inventory_item_id;
      ELSE
        INSERT INTO store_inventory (
          school_id, item_name, category, unit,
          current_stock, available_stock, consumable_type, low_stock_threshold
        ) VALUES (
          NEW.school_id, v_item.item_name, 'consumable', v_item.unit,
          CASE v_item.condition WHEN 'good' THEN v_item.quantity_received ELSE 0 END,
          CASE v_item.condition WHEN 'good' THEN v_item.quantity_received ELSE 0 END,
          'consumable',
          GREATEST(5, ROUND(v_item.quantity_received * 0.2))
        )
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_inv_id;

        IF v_inv_id IS NULL THEN
          SELECT id INTO v_inv_id FROM store_inventory
          WHERE school_id = NEW.school_id AND item_name = v_item.item_name LIMIT 1;
        END IF;
      END IF;

      -- Write price history
      INSERT INTO procurement_price_history (
        school_id, item_name, supplier_id, supplier_name,
        unit, unit_price_kes, quantity, document_id, delivery_date
      )
      SELECT
        NEW.school_id,
        v_item.item_name_normalised,
        pd.supplier_id,
        pd.supplier_name,
        v_item.unit,
        v_item.unit_price_kes,
        v_item.quantity_received,
        NEW.id,
        COALESCE(NEW.extracted_date, CURRENT_DATE)
      FROM procurement_documents pd WHERE pd.id = NEW.id;

      -- Restock history (if table exists)
      INSERT INTO restock_history (inventory_id, supplier_id, quantity_restocked, unit_cost, restocked_by)
      SELECT v_inv_id,
             (SELECT supplier_id FROM procurement_documents WHERE id = NEW.id),
             v_item.quantity_received,
             v_item.unit_price_kes,
             NEW.approved_by
      WHERE v_inv_id IS NOT NULL AND v_item.quantity_received > 0;

      UPDATE procurement_line_items SET inventory_updated = true WHERE id = v_item.id;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_procurement_approval ON procurement_documents;
CREATE TRIGGER trg_procurement_approval
  AFTER UPDATE ON procurement_documents
  FOR EACH ROW
  WHEN (NEW.workflow_status = 'approved' AND OLD.workflow_status != 'approved')
  EXECUTE FUNCTION update_inventory_on_approval();

-- ── SUMMARY VIEW ──────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW procurement_summary_view AS
SELECT
  pd.id,
  pd.school_id,
  pd.document_type,
  pd.document_number,
  pd.workflow_status,
  pd.ocr_confidence,
  pd.extracted_date,
  pd.extracted_total_kes,
  pd.supplier_name,
  s.trust_score  AS supplier_trust_score,
  pd.uploaded_at,
  pd.approved_at,
  COUNT(pli.id)                                                    AS item_count,
  COUNT(CASE WHEN pli.price_flag = 'significant_increase' THEN 1 END) AS significant_price_increases,
  COUNT(CASE WHEN pli.quantity_variance < 0             THEN 1 END) AS short_deliveries,
  SUM(pli.total_price_kes)                                         AS computed_total_kes,
  sr_up.full_name AS uploaded_by_name,
  sr_vf.full_name AS verified_by_name,
  sr_ap.full_name AS approved_by_name
FROM procurement_documents pd
LEFT JOIN suppliers s          ON s.id  = pd.supplier_id
LEFT JOIN procurement_line_items pli ON pli.document_id = pd.id
LEFT JOIN staff_records sr_up  ON sr_up.id = pd.uploaded_by
LEFT JOIN staff_records sr_vf  ON sr_vf.id = pd.verified_by
LEFT JOIN staff_records sr_ap  ON sr_ap.id = pd.approved_by
GROUP BY pd.id, s.trust_score, sr_up.full_name, sr_vf.full_name, sr_ap.full_name;

-- ── PRICE TREND FUNCTION ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_item_price_trend(
  p_school_id uuid,
  p_item_name text,
  p_months    integer DEFAULT 6
) RETURNS TABLE(
  delivery_date  date,
  supplier_name  text,
  unit_price_kes numeric,
  quantity       numeric,
  pct_change     numeric
) LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT
    delivery_date,
    supplier_name,
    unit_price_kes,
    quantity,
    ROUND(
      (unit_price_kes - LAG(unit_price_kes) OVER (ORDER BY delivery_date))
      / NULLIF(LAG(unit_price_kes) OVER (ORDER BY delivery_date), 0) * 100,
    1) AS pct_change
  FROM procurement_price_history
  WHERE school_id = p_school_id
    AND item_name ILIKE '%' || LOWER(TRIM(p_item_name)) || '%'
    AND delivery_date > CURRENT_DATE - (p_months || ' months')::interval
  ORDER BY delivery_date DESC;
$$;

-- ── STORAGE BUCKET + POLICIES ─────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'procurement-docs',
  'procurement-docs',
  false,
  20971520,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']
) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "procurement_docs_upload"  ON storage.objects;
DROP POLICY IF EXISTS "procurement_docs_read"    ON storage.objects;
DROP POLICY IF EXISTS "procurement_service"      ON storage.objects;

CREATE POLICY "procurement_docs_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'procurement-docs'
    AND (storage.foldername(name))[1] = get_my_school_id()::text
    AND EXISTS (
      SELECT 1 FROM staff_records
      WHERE user_id = auth.uid()::text
        AND sub_role IN ('accountant','principal')
      LIMIT 1
    )
  );

CREATE POLICY "procurement_docs_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'procurement-docs'
    AND (storage.foldername(name))[1] = get_my_school_id()::text
    AND EXISTS (
      SELECT 1 FROM staff_records
      WHERE user_id = auth.uid()::text
        AND sub_role IN ('accountant','storekeeper','principal','deputy_principal','dean_of_studies')
      LIMIT 1
    )
  );

CREATE POLICY "procurement_service" ON storage.objects
  FOR ALL TO service_role USING (true) WITH CHECK (true);
