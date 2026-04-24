-- Create tenant_configs table (central per-school configuration store)
-- Used by: parent PWA, NTS SMS attendance, WhatsApp bot, QR labels, quick-report

CREATE TABLE IF NOT EXISTS public.tenant_configs (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id        uuid NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  name             text NOT NULL,
  school_short_code CHAR(4) UNIQUE,
  settings         jsonb DEFAULT '{}',
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

ALTER TABLE public.tenant_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_configs_school_select" ON public.tenant_configs;
CREATE POLICY "tenant_configs_school_select"
  ON public.tenant_configs FOR SELECT TO authenticated
  USING (school_id = public.get_my_school_id());

-- Seed Nkoroi pilot school config (idempotent)
INSERT INTO public.tenant_configs (school_id, name, school_short_code)
VALUES (
  '68bd8d34-f2f0-4297-bd18-093328824d84',
  'Nkoroi Mixed Day Secondary School',
  '1834'
)
ON CONFLICT (school_id) DO UPDATE
  SET name = EXCLUDED.name;

-- Add column guard (if table existed before without this column)
ALTER TABLE public.tenant_configs
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

-- Auto-generate codes for any schools without one
UPDATE tenant_configs
SET school_short_code = generate_school_short_code()
WHERE school_short_code IS NULL;

-- Make NOT NULL now that all rows have a value
ALTER TABLE public.tenant_configs
  ALTER COLUMN school_short_code SET NOT NULL;

-- Index for fast lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_short_code
  ON tenant_configs(school_short_code);

-- Function: resolve school_id from short code
CREATE OR REPLACE FUNCTION get_school_by_short_code(p_code CHAR(4))
RETURNS UUID AS $$
  SELECT school_id FROM tenant_configs
  WHERE school_short_code = p_code
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Verify
SELECT school_id, name, school_short_code FROM tenant_configs ORDER BY created_at;
