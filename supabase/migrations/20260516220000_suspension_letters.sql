-- ================================================================
-- suspension_letters — AI-generated formal suspension letters
-- with JPEG attachment for parent PWA viewing
-- ================================================================

CREATE TABLE IF NOT EXISTS public.suspension_letters (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id              uuid        NOT NULL REFERENCES public.schools(id)           ON DELETE CASCADE,
  student_id             uuid        NOT NULL REFERENCES public.students(id)          ON DELETE CASCADE,
  discipline_record_id   uuid        REFERENCES public.discipline_records(id)         ON DELETE SET NULL,
  suspension_type        text        NOT NULL
                         CHECK (suspension_type IN ('internal','external','indefinite')),
  violation_summary      text        NOT NULL,
  code_of_conduct_refs   text[]      NOT NULL DEFAULT '{}',
  suspension_start_date  date        NOT NULL,
  suspension_end_date    date,
  duration_days          integer,
  punishments            text[]      NOT NULL DEFAULT '{}',
  apology_required       boolean     NOT NULL DEFAULT true,
  letter_text            text        NOT NULL,
  apology_text           text,
  jpeg_url               text,
  jpeg_path              text,
  generated_by           uuid        REFERENCES public.staff_records(id)              ON DELETE SET NULL,
  status                 text        NOT NULL DEFAULT 'sent'
                         CHECK (status IN ('draft','sent','acknowledged')),
  parent_viewed_at       timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.suspension_letters ENABLE ROW LEVEL SECURITY;

-- Staff can SELECT / UPDATE letters for their school
CREATE POLICY "suspension_letters_staff"
  ON public.suspension_letters
  USING (school_id = get_my_school_id());

-- Staff can INSERT letters for their school
CREATE POLICY "suspension_letters_insert"
  ON public.suspension_letters
  FOR INSERT WITH CHECK (school_id = get_my_school_id());

CREATE INDEX IF NOT EXISTS ix_suspension_letters_student
  ON public.suspension_letters(student_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ix_suspension_letters_school
  ON public.suspension_letters(school_id, created_at DESC);

-- ── Supabase storage bucket ───────────────────────────────────────────────────
-- Public bucket so the parent PWA can embed the JPEG via its URL directly.
-- Path convention: {school_id}/{student_id}/{uuid}.jpg

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'suspension-letters',
  'suspension-letters',
  true,
  5242880,   -- 5 MB per file
  ARRAY['image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'sl_authenticated_upload'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "sl_authenticated_upload" ON storage.objects
        FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'suspension-letters')
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'sl_public_select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "sl_public_select" ON storage.objects
        FOR SELECT USING (bucket_id = 'suspension-letters')
    $p$;
  END IF;
END $$;

-- ── Verification ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'suspension_letters table: %',
    (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'suspension_letters')::text;
  RAISE NOTICE 'suspension-letters bucket: %',
    COALESCE((SELECT name FROM storage.buckets WHERE id = 'suspension-letters'), 'MISSING');
END $$;
