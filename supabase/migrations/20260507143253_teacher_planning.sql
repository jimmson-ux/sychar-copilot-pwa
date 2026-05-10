-- Sychar Copilot — Lesson plans, schemes of work, record of work
create table if not exists public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  teacher_id uuid not null,
  subject text not null,
  grade text not null,
  curriculum text not null check (curriculum in ('CBC','8-4-4')),
  topic text not null,
  sub_topic text,
  duration_min int not null check (duration_min in (40, 80, 120)),
  lesson_date date,
  body_md text not null,
  status text not null default 'draft'
    check (status in ('draft','submitted','approved','rejected')),
  reviewer_id uuid,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Ensure columns exist on pre-existing table
alter table public.lesson_plans
  add column if not exists lesson_date date,
  add column if not exists sub_topic text,
  add column if not exists reviewer_id uuid,
  add column if not exists reviewer_note text,
  add column if not exists reviewed_at timestamptz;

create index if not exists lesson_plans_school_teacher_idx
  on public.lesson_plans(school_id, teacher_id, lesson_date desc nulls last);
create index if not exists lesson_plans_school_status_idx
  on public.lesson_plans(school_id, status);

create table if not exists public.schemes_of_work (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  teacher_id uuid not null,
  subject text not null,
  grade text not null,
  curriculum text not null check (curriculum in ('CBC','8-4-4')),
  term int not null check (term between 1 and 3),
  year int not null,
  title text not null,
  body_md text not null,
  status text not null default 'draft'
    check (status in ('draft','submitted','approved','rejected')),
  reviewer_id uuid,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Ensure columns exist on pre-existing schemes_of_work table
alter table public.schemes_of_work
  add column if not exists school_id uuid,
  add column if not exists teacher_id uuid,
  add column if not exists subject text,
  add column if not exists grade text,
  add column if not exists curriculum text,
  add column if not exists term int,
  add column if not exists year int,
  add column if not exists title text,
  add column if not exists body_md text,
  add column if not exists status text default 'draft',
  add column if not exists reviewer_id uuid,
  add column if not exists reviewer_note text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists updated_at timestamptz default now();

create index if not exists schemes_of_work_school_teacher_idx
  on public.schemes_of_work(school_id, teacher_id, year desc, term desc);

create table if not exists public.record_of_work (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  teacher_id uuid not null,
  subject text not null,
  grade text not null,
  week_starting date not null,
  lesson_date date not null,
  topic text not null,
  sub_topic text,
  coverage_pct int check (coverage_pct between 0 and 100),
  remarks text,
  status text not null default 'draft'
    check (status in ('draft','submitted','approved','rejected')),
  reviewer_id uuid,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
-- Ensure columns exist on pre-existing record_of_work table
alter table public.record_of_work
  add column if not exists school_id uuid,
  add column if not exists teacher_id uuid,
  add column if not exists subject text,
  add column if not exists grade text,
  add column if not exists week_starting date,
  add column if not exists lesson_date date,
  add column if not exists topic text,
  add column if not exists sub_topic text,
  add column if not exists coverage_pct int,
  add column if not exists remarks text,
  add column if not exists status text default 'draft',
  add column if not exists reviewer_id uuid,
  add column if not exists reviewer_note text,
  add column if not exists reviewed_at timestamptz;

create index if not exists record_of_work_school_teacher_idx
  on public.record_of_work(school_id, teacher_id, lesson_date desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists lesson_plans_touch on public.lesson_plans;
create trigger lesson_plans_touch before update on public.lesson_plans
  for each row execute function public.touch_updated_at();

drop trigger if exists schemes_of_work_touch on public.schemes_of_work;
create trigger schemes_of_work_touch before update on public.schemes_of_work
  for each row execute function public.touch_updated_at();

alter table public.lesson_plans    enable row level security;
alter table public.schemes_of_work enable row level security;
alter table public.record_of_work  enable row level security;

drop policy if exists "Staff read own school lesson plans" on public.lesson_plans;
create policy "Staff read own school lesson plans"
  on public.lesson_plans for select
  using (school_id::text in (select school_id::text from public.staff_records where user_id = auth.uid()::text));

drop policy if exists "Teacher manage own lesson plans" on public.lesson_plans;
create policy "Teacher manage own lesson plans"
  on public.lesson_plans for all
  using (teacher_id::text in (select id::text from public.staff_records where user_id = auth.uid()::text))
  with check (teacher_id::text in (select id::text from public.staff_records where user_id = auth.uid()::text));

drop policy if exists "Reviewers update lesson plans" on public.lesson_plans;
create policy "Reviewers update lesson plans"
  on public.lesson_plans for update
  using (exists (
    select 1 from public.staff_records s
    where s.user_id = auth.uid()::text
      and s.school_id = lesson_plans.school_id
      and s.sub_role in (
        'principal','deputy_principal','deputy_principal_academic',
        'dean_of_studies','deputy_dean_of_studies','quality_assurance','qaso',
        'hod_sciences','hod_arts','hod_languages','hod_mathematics',
        'hod_social_sciences','hod_humanities','hod_applied_sciences',
        'hod_games_sports','hod_pathways','super_admin'
      )
  ));

drop policy if exists "Staff read own school schemes" on public.schemes_of_work;
create policy "Staff read own school schemes"
  on public.schemes_of_work for select
  using (school_id::text in (select school_id::text from public.staff_records where user_id = auth.uid()::text));

drop policy if exists "Teacher manage own schemes" on public.schemes_of_work;
create policy "Teacher manage own schemes"
  on public.schemes_of_work for all
  using (teacher_id::text in (select id::text from public.staff_records where user_id = auth.uid()::text))
  with check (teacher_id::text in (select id::text from public.staff_records where user_id = auth.uid()::text));

drop policy if exists "Reviewers update schemes" on public.schemes_of_work;
create policy "Reviewers update schemes"
  on public.schemes_of_work for update
  using (exists (
    select 1 from public.staff_records s
    where s.user_id = auth.uid()::text
      and s.school_id = schemes_of_work.school_id
      and s.sub_role in (
        'principal','deputy_principal','deputy_principal_academic',
        'dean_of_studies','deputy_dean_of_studies','quality_assurance','qaso',
        'hod_sciences','hod_arts','hod_languages','hod_mathematics',
        'hod_social_sciences','hod_humanities','hod_applied_sciences',
        'hod_games_sports','hod_pathways','super_admin'
      )
  ));

drop policy if exists "Staff read own school record of work" on public.record_of_work;
create policy "Staff read own school record of work"
  on public.record_of_work for select
  using (school_id::text in (select school_id::text from public.staff_records where user_id = auth.uid()::text));

drop policy if exists "Teacher manage own record of work" on public.record_of_work;
create policy "Teacher manage own record of work"
  on public.record_of_work for all
  using (teacher_id::text in (select id::text from public.staff_records where user_id = auth.uid()::text))
  with check (teacher_id::text in (select id::text from public.staff_records where user_id = auth.uid()::text));

drop policy if exists "Reviewers update record of work" on public.record_of_work;
create policy "Reviewers update record of work"
  on public.record_of_work for update
  using (exists (
    select 1 from public.staff_records s
    where s.user_id = auth.uid()::text
      and s.school_id = record_of_work.school_id
      and s.sub_role in (
        'principal','deputy_principal','deputy_principal_academic',
        'dean_of_studies','deputy_dean_of_studies','quality_assurance','qaso',
        'hod_sciences','hod_arts','hod_languages','hod_mathematics',
        'hod_social_sciences','hod_humanities','hod_applied_sciences',
        'hod_games_sports','hod_pathways','super_admin'
      )
  ));
