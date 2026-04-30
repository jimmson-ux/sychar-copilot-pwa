-- ============================================================
-- Fix tenant_configs missing columns + staff_records additions
-- ============================================================

ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS current_term      integer   DEFAULT 2,
  ADD COLUMN IF NOT EXISTS current_year      text      DEFAULT '2025/2026',
  ADD COLUMN IF NOT EXISTS term_dates        jsonb     DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS levels            text[]    DEFAULT ARRAY['Form 3','Form 4'],
  ADD COLUMN IF NOT EXISTS streams           text[]    DEFAULT ARRAY['Winners','Achievers','Victors','Champions'],
  ADD COLUMN IF NOT EXISTS curriculum        text      DEFAULT '844'
                           CHECK (curriculum IN ('CBC','844','both')),
  ADD COLUMN IF NOT EXISTS county            text,
  ADD COLUMN IF NOT EXISTS sub_county        text,
  ADD COLUMN IF NOT EXISTS school_day        jsonb     DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS theme             jsonb     DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS principal_name    text,
  ADD COLUMN IF NOT EXISTS principal_email   text,
  ADD COLUMN IF NOT EXISTS principal_phone   text,
  ADD COLUMN IF NOT EXISTS short_name        text,
  ADD COLUMN IF NOT EXISTS motto             text,
  ADD COLUMN IF NOT EXISTS logo_url          text,
  ADD COLUMN IF NOT EXISTS region            text      DEFAULT 'Nairobi',
  ADD COLUMN IF NOT EXISTS subscription_plan text      DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS monthly_fee_kes   integer   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grace_period_days integer   DEFAULT 5,
  ADD COLUMN IF NOT EXISTS teacher_token_secret text,
  ADD COLUMN IF NOT EXISTS mpesa_paybill     text,
  ADD COLUMN IF NOT EXISTS sms_provider      text      DEFAULT 'africastalking',
  ADD COLUMN IF NOT EXISTS sms_sender_id     text;

-- Seed Nkoroi Senior Secondary School
UPDATE public.tenant_configs SET
  current_term    = 2,
  current_year    = '2025/2026',
  levels          = ARRAY['Grade 10', 'Form 3', 'Form 4'],
  streams         = ARRAY['Winners', 'Achievers', 'Victors', 'Champions'],
  curriculum      = 'both',
  county          = 'Kajiado',
  sub_county      = 'Ongata Rongai',
  region          = 'Kajiado',
  short_name      = 'Nkoroi Mixed',
  motto           = 'Excellence Through Discipline',
  principal_name  = 'Rita Thiringi',
  principal_email = 'rita2thiringi@gmail.com',
  sms_sender_id   = 'NKOROI',
  term_dates      = '{
    "term1": {"start": "2026-01-06", "end": "2026-04-04"},
    "term2": {"start": "2026-05-04", "end": "2026-08-07"},
    "term3": {"start": "2026-09-07", "end": "2026-11-27"}
  }'::jsonb,
  school_day      = '{
    "periods": [
      {"number":1,"label":"Period 1","start":"08:20","end":"09:00"},
      {"number":2,"label":"Period 2","start":"09:00","end":"09:40"},
      {"number":3,"label":"Period 3","start":"09:40","end":"10:20"},
      {"number":4,"label":"Break","start":"10:20","end":"10:40","is_break":true},
      {"number":5,"label":"Period 4","start":"10:40","end":"11:20"},
      {"number":6,"label":"Period 5","start":"11:20","end":"12:00"},
      {"number":7,"label":"Period 6","start":"12:00","end":"12:40"},
      {"number":8,"label":"Lunch","start":"12:40","end":"14:00","is_break":true},
      {"number":9,"label":"Period 7","start":"14:00","end":"14:40"},
      {"number":10,"label":"Period 8","start":"14:40","end":"15:20"}
    ]
  }'::jsonb
WHERE school_id = '68bd8d34-f2f0-4297-bd18-093328824d84'::uuid;

-- Add columns to staff_records
ALTER TABLE public.staff_records
  ADD COLUMN IF NOT EXISTS tsc_number          text,
  ADD COLUMN IF NOT EXISTS id_number           text,
  ADD COLUMN IF NOT EXISTS is_form_principal   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_photo_url   text,
  ADD COLUMN IF NOT EXISTS totp_secret         text;
