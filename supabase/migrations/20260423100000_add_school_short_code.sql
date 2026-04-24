-- Add 4-digit unique school short code
-- Used by: parent PWA login, NTS SMS attendance, WhatsApp bot pinning, QR labels

ALTER TABLE tenant_configs
  ADD COLUMN IF NOT EXISTS school_short_code CHAR(4) UNIQUE;

-- Function to generate unique 4-digit code
CREATE OR REPLACE FUNCTION generate_school_short_code()
RETURNS CHAR(4) AS $$
DECLARE
  code CHAR(4);
  attempts INTEGER := 0;
BEGIN
  LOOP
    attempts := attempts + 1;
    IF attempts > 9000 THEN
      RAISE EXCEPTION 'Could not generate unique school code after 9000 attempts';
    END IF;
    code := LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM tenant_configs WHERE school_short_code = code
    );
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql;

-- Assign Nkoroi their actual Ministry serial number
UPDATE tenant_configs
SET school_short_code = '1834'
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND school_short_code IS NULL;

-- Auto-generate for any other schools without a code
UPDATE tenant_configs
SET school_short_code = generate_school_short_code()
WHERE school_short_code IS NULL;

-- Add NOT NULL constraint after populating
ALTER TABLE tenant_configs
  ALTER COLUMN school_short_code SET NOT NULL;

-- Index for fast lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_short_code
  ON tenant_configs(school_short_code);

-- Function: resolve school_id from short code (used everywhere)
CREATE OR REPLACE FUNCTION get_school_by_short_code(p_code CHAR(4))
RETURNS UUID AS $$
  SELECT school_id FROM tenant_configs
  WHERE school_short_code = p_code
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Verify
SELECT school_id, name, school_short_code FROM tenant_configs ORDER BY created_at;
