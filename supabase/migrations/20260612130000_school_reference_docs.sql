-- ================================================================
-- SCHOOL REFERENCE DOCS + GENDER PROFILE
-- 2026-06-12
--
-- Two small additions needed by Oloolaiser onboarding (and reusable by all):
--
-- 1. school_reference_docs — structured, non-operational config documents
--    (school rules, CBE subject combinations, duty rota, etc.) stored as JSONB
--    so dashboards and the RAG indexer can read them per school.
--
-- 2. gender_profile — marks single-gender schools so the AI frames discipline,
--    performance and mental-health analysis appropriately (Oloolaiser = boys).
--    Stored on both school_metadata (frontend SchoolContext) and tenant_configs
--    (server-side reads) to match the platform's dual feature-store pattern.
-- ================================================================

-- ── 1. Reference documents ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.school_reference_docs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  doc_type    text        NOT NULL,   -- 'school_rules' | 'cbe_combinations' | 'duty_rota' | ...
  title       text,
  content     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, doc_type)
);

CREATE INDEX IF NOT EXISTS idx_school_reference_docs_school
  ON public.school_reference_docs (school_id, doc_type);

ALTER TABLE public.school_reference_docs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_ref_docs_read    ON public.school_reference_docs;
DROP POLICY IF EXISTS school_ref_docs_admin   ON public.school_reference_docs;
DROP POLICY IF EXISTS school_ref_docs_service ON public.school_reference_docs;

-- Any staff of the school may read reference docs (rules, combos, rota are not sensitive).
CREATE POLICY school_ref_docs_read ON public.school_reference_docs
  FOR SELECT TO authenticated
  USING (school_id::text = public.get_my_school_id()::text);

-- Leadership may edit.
CREATE POLICY school_ref_docs_admin ON public.school_reference_docs
  FOR ALL TO authenticated
  USING (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('principal','deputy_principal','deputy_principal_academic',
                                 'deputy_principal_admin','super_admin','dean_of_studies')
  )
  WITH CHECK (
    school_id::text = public.get_my_school_id()::text
    AND public.get_my_role() IN ('principal','deputy_principal','deputy_principal_academic',
                                 'deputy_principal_admin','super_admin','dean_of_studies')
  );

CREATE POLICY school_ref_docs_service ON public.school_reference_docs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. Gender profile ───────────────────────────────────────────
-- 'mixed' (default) | 'boys' | 'girls'
-- school_metadata is an optional/legacy store that does not exist on every
-- deployment — guard the ALTER so this migration never errors (and so future
-- onboarding of a fresh project applies cleanly). tenant_configs always exists.
DO $$
BEGIN
  IF to_regclass('public.school_metadata') IS NOT NULL THEN
    ALTER TABLE public.school_metadata
      ADD COLUMN IF NOT EXISTS gender_profile text NOT NULL DEFAULT 'mixed';
    BEGIN
      ALTER TABLE public.school_metadata
        ADD CONSTRAINT school_metadata_gender_profile_chk
        CHECK (gender_profile IN ('mixed','boys','girls'));
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;

ALTER TABLE public.tenant_configs
  ADD COLUMN IF NOT EXISTS gender_profile text NOT NULL DEFAULT 'mixed';
DO $$
BEGIN
  ALTER TABLE public.tenant_configs
    ADD CONSTRAINT tenant_configs_gender_profile_chk
    CHECK (gender_profile IN ('mixed','boys','girls'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
