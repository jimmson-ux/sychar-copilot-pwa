-- ================================================================
-- STAFF_RECORDS — add missing columns for Nkoroi pilot
-- ================================================================

ALTER TABLE public.staff_records
  ADD COLUMN IF NOT EXISTS tsc_number       text,
  ADD COLUMN IF NOT EXISTS id_number        text,
  ADD COLUMN IF NOT EXISTS photo_url        text,
  ADD COLUMN IF NOT EXISTS totp_secret      text,
  ADD COLUMN IF NOT EXISTS daily_rate       numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employment_type  text DEFAULT 'TSC'
    CHECK (employment_type IN ('TSC','BOM','NTS','contract')),
  ADD COLUMN IF NOT EXISTS assigned_class   text,
  ADD COLUMN IF NOT EXISTS is_form_principal boolean DEFAULT false;

-- Mark form principals for Nkoroi
UPDATE public.staff_records
SET is_form_principal = true
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid
  AND sub_role IN ('form_principal_form4', 'form_principal_grade10');
