-- Sychar Copilot — duty rosters, discipline records, learner pathway elections

create table if not exists public.duty_rosters (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  teacher_id uuid not null,
  week_starting date not null,
  area text not null,
  day_of_week text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists duty_rosters_school_week_idx
  on public.duty_rosters(school_id, week_starting desc);
create index if not exists duty_rosters_teacher_idx
  on public.duty_rosters(teacher_id, week_starting desc);

alter table public.duty_rosters enable row level security;

drop policy if exists "Staff read own school duties" on public.duty_rosters;
create policy "Staff read own school duties"
  on public.duty_rosters for select
  using (
    school_id in (
      select school_id from public.staff_records where user_id = auth.uid()::text
    )
  );

drop policy if exists "Admins manage duties" on public.duty_rosters;
create policy "Admins manage duties"
  on public.duty_rosters for all
  using (
    school_id in (
      select school_id from public.staff_records
      where user_id = auth.uid()::text
        and sub_role in (
          'principal','deputy_principal','deputy_principal_admin',
          'deputy_principal_academic','super_admin'
        )
    )
  )
  with check (
    school_id in (
      select school_id from public.staff_records
      where user_id = auth.uid()::text
        and sub_role in (
          'principal','deputy_principal','deputy_principal_admin',
          'deputy_principal_academic','super_admin'
        )
    )
  );

create table if not exists public.discipline_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid,
  student_name text,
  class_name text,
  severity text not null default 'low'
    check (severity in ('low','normal','high','critical')),
  incident_type text,
  description text,
  status text not null default 'open' check (status in ('open','resolved','escalated')),
  reported_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists discipline_records_school_idx
  on public.discipline_records(school_id, created_at desc);
create index if not exists discipline_records_severity_idx
  on public.discipline_records(school_id, severity, created_at desc);

alter table public.discipline_records enable row level security;

drop policy if exists "Staff read own school discipline" on public.discipline_records;
create policy "Staff read own school discipline"
  on public.discipline_records for select
  using (
    school_id in (
      select school_id from public.staff_records where user_id = auth.uid()::text
    )
  );

drop policy if exists "Staff insert discipline own school" on public.discipline_records;
create policy "Staff insert discipline own school"
  on public.discipline_records for insert
  with check (
    school_id in (
      select school_id from public.staff_records where user_id = auth.uid()::text
    )
  );

drop policy if exists "Admins update discipline" on public.discipline_records;
create policy "Admins update discipline"
  on public.discipline_records for update
  using (
    school_id in (
      select school_id from public.staff_records
      where user_id = auth.uid()::text
        and sub_role in (
          'principal','deputy_principal','deputy_principal_admin',
          'dean_of_studies','deputy_dean_of_studies','dean_of_students','super_admin'
        )
    )
  );

create table if not exists public.learner_pathways (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  student_id uuid not null,
  pathway text not null check (pathway in ('stem','social_sciences','arts_sports')),
  recorded_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, student_id)
);
create index if not exists learner_pathways_school_idx
  on public.learner_pathways(school_id, pathway);

alter table public.learner_pathways enable row level security;

drop policy if exists "Staff read own school pathways" on public.learner_pathways;
create policy "Staff read own school pathways"
  on public.learner_pathways for select
  using (
    school_id in (
      select school_id from public.staff_records where user_id = auth.uid()::text
    )
  );

drop policy if exists "Pathway leads upsert" on public.learner_pathways;
create policy "Pathway leads upsert"
  on public.learner_pathways for insert
  with check (
    school_id in (
      select school_id from public.staff_records
      where user_id = auth.uid()::text
        and sub_role in (
          'hod_pathways','principal','deputy_principal','deputy_principal_academic',
          'dean_of_studies','class_teacher','form_principal_form4','form_principal_grade10','super_admin'
        )
    )
  );

drop policy if exists "Pathway leads update" on public.learner_pathways;
create policy "Pathway leads update"
  on public.learner_pathways for update
  using (
    school_id in (
      select school_id from public.staff_records
      where user_id = auth.uid()::text
        and sub_role in (
          'hod_pathways','principal','deputy_principal','deputy_principal_academic',
          'dean_of_studies','class_teacher','form_principal_form4','form_principal_grade10','super_admin'
        )
    )
  );
