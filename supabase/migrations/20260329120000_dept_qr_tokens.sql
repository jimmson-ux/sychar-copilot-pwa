-- Add QR token columns to department_codes
ALTER TABLE department_codes
  ADD COLUMN IF NOT EXISTS qr_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS qr_url   text;

-- Generate unique tokens (use uuid-based token — always available in Supabase)
UPDATE department_codes SET
  qr_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  qr_url   = 'https://project-o7htk.vercel.app/record?dept=' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'
  AND qr_token IS NULL;

CREATE INDEX IF NOT EXISTS idx_dept_codes_qr_token ON department_codes(qr_token);
