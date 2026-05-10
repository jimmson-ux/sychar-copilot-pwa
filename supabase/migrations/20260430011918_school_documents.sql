-- School documents (calendar PDFs, ministry circulars, policies).
-- Uploaded by Principal / Deputy Admin; visible to all staff in the same school.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'school_doc_kind' AND typnamespace = 'public'::regnamespace) THEN
    CREATE TYPE public.school_doc_kind AS ENUM (
      'school_calendar',
      'ministry_circular',
      'policy',
      'other'
    );
  END IF;
END $$;

create table if not exists public.school_documents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  kind public.school_doc_kind not null,
  title text not null,
  description text,
  /* Path inside the `school-documents` storage bucket. */
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.staff_records(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  /* Optional issue/effective date (e.g. circular date). */
  effective_date date
);

create index if not exists school_documents_school_kind_idx
  on public.school_documents (school_id, kind, uploaded_at desc);

alter table public.school_documents enable row level security;

-- All staff in the school can read.
create policy "school staff can read documents"
  on public.school_documents
  for select
  to authenticated
  using (
    exists (
      select 1 from public.staff_records sr
      where sr.user_id = auth.uid()::text
        and sr.school_id = school_documents.school_id
        and sr.is_active = true
    )
  );

-- Principal & Deputy Admin can insert/update/delete.
create policy "principal/deputy admin can write documents"
  on public.school_documents
  for all
  to authenticated
  using (
    exists (
      select 1 from public.staff_records sr
      where sr.user_id = auth.uid()::text
        and sr.school_id = school_documents.school_id
        and sr.is_active = true
        and sr.sub_role in ('principal','deputy_principal_admin','deputy_principal','super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_records sr
      where sr.user_id = auth.uid()::text
        and sr.school_id = school_documents.school_id
        and sr.is_active = true
        and sr.sub_role in ('principal','deputy_principal_admin','deputy_principal','super_admin')
    )
  );

-- Storage bucket (public read; uploads gated by RLS on storage.objects).
insert into storage.buckets (id, name, public)
values ('school-documents', 'school-documents', true)
on conflict (id) do nothing;

-- Allow authenticated staff to read objects in this bucket (any school —
-- discoverability is enforced by `school_documents` row visibility above).
create policy "Authenticated staff can read school-documents"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'school-documents');

-- Allow Principal / Deputy Admin to upload / replace / delete.
create policy "Principal & Deputy Admin can write school-documents"
  on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'school-documents'
    and exists (
      select 1 from public.staff_records sr
      where sr.user_id = auth.uid()::text
        and sr.is_active = true
        and sr.sub_role in ('principal','deputy_principal_admin','deputy_principal','super_admin')
    )
  )
  with check (
    bucket_id = 'school-documents'
    and exists (
      select 1 from public.staff_records sr
      where sr.user_id = auth.uid()::text
        and sr.is_active = true
        and sr.sub_role in ('principal','deputy_principal_admin','deputy_principal','super_admin')
    )
  );
