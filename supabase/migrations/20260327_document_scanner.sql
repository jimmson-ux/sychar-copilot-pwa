-- Document Scanner tables
-- Run this in your Supabase SQL editor

CREATE TABLE IF NOT EXISTS public.document_inbox (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id     UUID        NOT NULL,
  uploaded_by   UUID        NOT NULL,
  document_type TEXT        NOT NULL,
  raw_extracted_json JSONB,
  status        TEXT        NOT NULL DEFAULT 'processed',
  scanned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS document_inbox_uploaded_by_idx ON public.document_inbox(uploaded_by);
CREATE INDEX IF NOT EXISTS document_inbox_school_id_idx   ON public.document_inbox(school_id);

CREATE TABLE IF NOT EXISTS public.apology_letters (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id           UUID        NOT NULL,
  document_inbox_id   UUID        REFERENCES public.document_inbox(id) ON DELETE SET NULL,
  student_name        TEXT,
  admission_number    TEXT,
  class               TEXT,
  date                TEXT,
  reason_for_apology  TEXT,
  witness_teacher     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE public.document_inbox    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.apology_letters   ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "service_role_all_document_inbox"   ON public.document_inbox    FOR ALL USING (true);
CREATE POLICY "service_role_all_apology_letters"  ON public.apology_letters   FOR ALL USING (true);
