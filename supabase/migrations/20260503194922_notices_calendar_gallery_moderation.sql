-- Notices: allow deputies + deans to insert; calendar events; gallery moderation/metadata; parent reads.

-- 1) Notices RLS: broaden author roles
do $$ begin
  if exists (select 1 from pg_tables where schemaname='public' and tablename='notices') then
    alter table public.notices enable row level security;
  end if;
end $$;

drop policy if exists "notices_author_can_insert" on public.notices;
create policy "notices_author_can_insert" on public.notices
for insert to authenticated
with check (
  exists (
    select 1 from public.staff_records sr
    where sr.user_id::text = auth.uid()::text
      and sr.school_id = notices.school_id
      and sr.is_active = true
      and sr.sub_role in (
        'principal','super_admin',
        'deputy_principal','deputy_principal_academic','deputy_principal_admin',
        'dean_of_studies','deputy_dean_of_studies','dean_of_students'
      )
  )
);

-- 2) School calendar events
create table if not exists public.school_calendar_events (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  event_date date not null,
  title text not null,
  kind text not null default 'event' check (kind in ('holiday','exam','event','meeting','term','sports','culture','graduation')),
  emoji text,
  notes text,
  source text not null default 'principal' check (source in ('principal','kenya_holidays','auto')),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists sce_school_date_idx on public.school_calendar_events(school_id, event_date);

alter table public.school_calendar_events enable row level security;

drop policy if exists "sce_select_same_tenant" on public.school_calendar_events;
create policy "sce_select_same_tenant" on public.school_calendar_events
for select to authenticated
using (
  school_id in (select school_id from public.staff_records where user_id::text = auth.uid()::text)
);

drop policy if exists "sce_insert_principal" on public.school_calendar_events;
create policy "sce_insert_principal" on public.school_calendar_events
for insert to authenticated
with check (
  exists (select 1 from public.staff_records sr
    where sr.user_id::text = auth.uid()::text
      and sr.school_id = school_calendar_events.school_id
      and sr.sub_role in ('principal','super_admin','deputy_principal','deputy_principal_academic','deputy_principal_admin'))
);

drop policy if exists "sce_update_principal" on public.school_calendar_events;
create policy "sce_update_principal" on public.school_calendar_events
for update to authenticated
using (
  exists (select 1 from public.staff_records sr
    where sr.user_id::text = auth.uid()::text
      and sr.school_id = school_calendar_events.school_id
      and sr.sub_role in ('principal','super_admin'))
);

drop policy if exists "sce_delete_principal" on public.school_calendar_events;
create policy "sce_delete_principal" on public.school_calendar_events
for delete to authenticated
using (
  exists (select 1 from public.staff_records sr
    where sr.user_id::text = auth.uid()::text
      and sr.school_id = school_calendar_events.school_id
      and sr.sub_role in ('principal','super_admin'))
);

-- Seed Kenyan public holidays for 2026 (school_id = Nkoroi pilot)
insert into public.school_calendar_events (school_id, event_date, title, kind, emoji, source)
values
  ('68bd8d34-f2f0-4297-bd18-093328824d84','2026-01-01','New Year''s Day','holiday','🇰🇪','kenya_holidays'),
  ('68bd8d34-f2f0-4297-bd18-093328824d84','2026-04-03','Good Friday','holiday','🇰🇪','kenya_holidays'),
  ('68bd8d34-f2f0-4297-bd18-093328824d84','2026-04-06','Easter Monday','holiday','🇰🇪','kenya_holidays'),
  ('68bd8d34-f2f0-4297-bd18-093328824d84','2026-05-01','Labour Day','holiday','🇰🇪','kenya_holidays'),
  ('68bd8d34-f2f0-4297-bd18-093328824d84','2026-06-01','Madaraka Day','holiday','🇰🇪','kenya_holidays'),
  ('68bd8d34-f2f0-4297-bd18-093328824d84','2026-10-10','Huduma Day','holiday','🇰🇪','kenya_holidays'),
  ('68bd8d34-f2f0-4297-bd18-093328824d84','2026-10-20','Mashujaa Day','holiday','🇰🇪','kenya_holidays'),
  ('68bd8d34-f2f0-4297-bd18-093328824d84','2026-12-12','Jamhuri Day','holiday','🇰🇪','kenya_holidays'),
  ('68bd8d34-f2f0-4297-bd18-093328824d84','2026-12-25','Christmas Day','holiday','🇰🇪','kenya_holidays'),
  ('68bd8d34-f2f0-4297-bd18-093328824d84','2026-12-26','Boxing Day','holiday','🇰🇪','kenya_holidays')
on conflict do nothing;

-- 3) Gallery moderation + metadata
alter table public.school_gallery_posts
  add column if not exists status text not null default 'published' check (status in ('pending','published','hidden')),
  add column if not exists moderated_by uuid,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderation_reason text,
  add column if not exists title text,
  add column if not exists tags text[] default '{}',
  add column if not exists location text,
  add column if not exists event_date date,
  add column if not exists visibility text not null default 'public' check (visibility in ('public','school'));

-- Replace select policy to honor status & visibility
drop policy if exists "gallery_select_same_school" on public.school_gallery_posts;
create policy "gallery_select_same_school" on public.school_gallery_posts
for select to authenticated
using (
  exists (
    select 1 from public.staff_records sr
    where sr.user_id::text = auth.uid()::text
      and sr.school_id = school_gallery_posts.school_id
      and (
        school_gallery_posts.status = 'published'
        or sr.id = school_gallery_posts.staff_id
        or sr.sub_role in ('principal','super_admin','dean_of_studies','dean_of_students','deputy_principal','deputy_principal_academic','deputy_principal_admin')
      )
  )
);

-- Public anon read for published+public posts (used by /p/... viewer + OG)
drop policy if exists "gallery_public_read" on public.school_gallery_posts;
create policy "gallery_public_read" on public.school_gallery_posts
for select to anon
using (status = 'published' and visibility = 'public');

drop policy if exists "gallery_update_moderators" on public.school_gallery_posts;
create policy "gallery_update_moderators" on public.school_gallery_posts
for update to authenticated
using (
  exists (select 1 from public.staff_records sr
    where sr.user_id::text = auth.uid()::text
      and sr.school_id = school_gallery_posts.school_id
      and sr.sub_role in ('principal','super_admin','dean_of_studies','dean_of_students','deputy_principal','deputy_principal_academic','deputy_principal_admin'))
);

-- 4) Parent notice reads
create table if not exists public.parent_notice_reads (
  parent_user_id uuid not null,
  notice_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (parent_user_id, notice_id)
);
alter table public.parent_notice_reads enable row level security;
drop policy if exists "pnr_self" on public.parent_notice_reads;
create policy "pnr_self" on public.parent_notice_reads
for all to authenticated
using (parent_user_id = auth.uid())
with check (parent_user_id = auth.uid());
