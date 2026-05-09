-- Sychar Copilot — Exeat (gate pass) requests
create table if not exists public.exeat_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  student_name text not null,
  class_name text,
  requested_by uuid,
  reason text not null,
  leave_at timestamptz not null,
  return_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','closed')),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now()
);

create index if not exists exeat_requests_school_status_idx
  on public.exeat_requests(school_id, status, created_at desc);

alter table public.exeat_requests enable row level security;

drop policy if exists "Staff read own school exeats" on public.exeat_requests;
create policy "Staff read own school exeats"
  on public.exeat_requests for select
  using (
    school_id in (
      select school_id from public.staff_records where user_id = auth.uid()::text
    )
  );

drop policy if exists "Staff insert exeat for own school" on public.exeat_requests;
create policy "Staff insert exeat for own school"
  on public.exeat_requests for insert
  with check (
    school_id in (
      select school_id from public.staff_records where user_id = auth.uid()::text
    )
  );

drop policy if exists "Dean and admins decide exeats" on public.exeat_requests;
create policy "Dean and admins decide exeats"
  on public.exeat_requests for update
  using (
    exists (
      select 1 from public.staff_records s
      where s.user_id = auth.uid()::text
        and s.school_id = exeat_requests.school_id
        and s.sub_role in (
          'dean_of_students','dean_of_studies','deputy_dean_of_studies',
          'deputy_principal_admin','principal','super_admin'
        )
    )
  )
  with check (
    exists (
      select 1 from public.staff_records s
      where s.user_id = auth.uid()::text
        and s.school_id = exeat_requests.school_id
        and s.sub_role in (
          'dean_of_students','dean_of_studies','deputy_dean_of_studies',
          'deputy_principal_admin','principal','super_admin'
        )
    )
  );
