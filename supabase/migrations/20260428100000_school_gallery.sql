-- ============================================================
-- School Gallery — media storage + DB metadata
-- ============================================================

-- Storage buckets (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('school-gallery',      'school-gallery',      false, 52428800,
   ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4']),
  ('student-photos',      'student-photos',      false, 5242880,
   ARRAY['image/jpeg','image/png','image/webp']),
  ('staff-photos',        'staff-photos',        false, 5242880,
   ARRAY['image/jpeg','image/png','image/webp']),
  ('fee-documents',       'fee-documents',       false, 10485760,
   ARRAY['image/jpeg','image/png','application/pdf']),
  ('requisition-forms',   'requisition-forms',   false, 10485760,
   ARRAY['image/jpeg','image/png','application/pdf']),
  ('discipline-evidence', 'discipline-evidence', false, 20971520,
   ARRAY['image/jpeg','image/png','application/pdf','video/mp4']),
  ('schemes-of-work',     'schemes-of-work',     false, 10485760,
   ARRAY['application/pdf','application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('lesson-plans',        'lesson-plans',        false, 10485760,
   ARRAY['application/pdf','application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('report-cards',        'report-cards',        false, 5242880,
   ARRAY['application/pdf']),
  ('school-branding',     'school-branding',     false, 5242880,
   ARRAY['image/jpeg','image/png','image/svg+xml','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
DROP POLICY IF EXISTS "gallery_upload"         ON storage.objects;
DROP POLICY IF EXISTS "gallery_select_staff"   ON storage.objects;
DROP POLICY IF EXISTS "gallery_delete_admin"   ON storage.objects;
DROP POLICY IF EXISTS "student_photos_school"  ON storage.objects;
DROP POLICY IF EXISTS "fee_docs_finance"       ON storage.objects;
DROP POLICY IF EXISTS "storage_service_bypass" ON storage.objects;

CREATE POLICY "gallery_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'school-gallery'
    AND (storage.foldername(name))[1] = public.get_my_school_id()::text
  );

CREATE POLICY "gallery_select_staff" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'school-gallery'
    AND (storage.foldername(name))[1] = public.get_my_school_id()::text
  );

CREATE POLICY "gallery_delete_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'school-gallery'
    AND (storage.foldername(name))[1] = public.get_my_school_id()::text
    AND EXISTS (
      SELECT 1 FROM public.staff_records
      WHERE user_id = auth.uid()::text
        AND sub_role IN ('principal','deputy_principal','dean_of_studies')
      LIMIT 1
    )
  );

CREATE POLICY "student_photos_school" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'student-photos'
    AND (storage.foldername(name))[1] = public.get_my_school_id()::text
  )
  WITH CHECK (
    bucket_id = 'student-photos'
    AND (storage.foldername(name))[1] = public.get_my_school_id()::text
  );

CREATE POLICY "fee_docs_finance" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'fee-documents'
    AND (storage.foldername(name))[1] = public.get_my_school_id()::text
    AND EXISTS (
      SELECT 1 FROM public.staff_records
      WHERE user_id = auth.uid()::text
        AND sub_role IN ('principal','accountant','deputy_principal')
      LIMIT 1
    )
  );

CREATE POLICY "storage_service_bypass" ON storage.objects
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ── school_gallery table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.school_gallery (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id       uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  bucket_id       text DEFAULT 'school-gallery',
  file_path       text NOT NULL,
  file_name       text NOT NULL,
  file_size_bytes bigint,
  mime_type       text,
  title           text,
  description     text,
  category        text DEFAULT 'general'
                  CHECK (category IN (
                    'general','events','academics','sports',
                    'graduation','facilities','staff','alumni'
                  )),
  academic_year   text,
  term            integer,
  uploaded_by     uuid REFERENCES public.staff_records(id),
  is_featured     boolean DEFAULT false,
  is_public       boolean DEFAULT false,
  is_approved     boolean DEFAULT false,
  approved_by     uuid REFERENCES public.staff_records(id),
  approved_at     timestamptz,
  ai_caption      text,
  view_count      integer DEFAULT 0,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gallery_school
  ON public.school_gallery(school_id, category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gallery_featured
  ON public.school_gallery(school_id, is_featured, is_approved)
  WHERE is_featured = true;

ALTER TABLE public.school_gallery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gallery_db_school"   ON public.school_gallery;
DROP POLICY IF EXISTS "gallery_db_service"  ON public.school_gallery;

CREATE POLICY "gallery_db_school" ON public.school_gallery
  FOR ALL TO authenticated
  USING (school_id = public.get_my_school_id());

CREATE POLICY "gallery_db_service" ON public.school_gallery
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'school_gallery'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.school_gallery;
  END IF;
END $$;
