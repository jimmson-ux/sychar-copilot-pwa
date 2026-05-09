-- School Gallery: Vogue-style e-magazine posts uploaded by Dean / HODs / Principal.
create table if not exists public.school_gallery_posts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  staff_id uuid,
  author_name text,
  author_role text,
  section text not null default 'General',
  caption text,
  image_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists school_gallery_posts_school_idx
  on public.school_gallery_posts(school_id, created_at desc);

alter table public.school_gallery_posts enable row level security;

create or replace function public.can_post_school_gallery(_user_id uuid, _school_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_records sr
    where sr.user_id::text = _user_id::text
      and sr.school_id = _school_id
      and sr.is_active = true
      and (
        sr.sub_role in (
          'principal','super_admin',
          'dean_of_studies','deputy_dean_of_studies','dean_of_students'
        )
        or sr.sub_role like 'hod_%'
      )
  )
$$;

drop policy if exists "gallery_select_same_school" on public.school_gallery_posts;
create policy "gallery_select_same_school"
on public.school_gallery_posts
for select
to authenticated
using (
  exists (
    select 1 from public.staff_records sr
    where sr.user_id::text = auth.uid()::text
      and sr.school_id = school_gallery_posts.school_id
  )
);

drop policy if exists "gallery_insert_eligible_authors" on public.school_gallery_posts;
create policy "gallery_insert_eligible_authors"
on public.school_gallery_posts
for insert
to authenticated
with check (
  public.can_post_school_gallery(auth.uid(), school_id)
);

drop policy if exists "gallery_delete_own_or_principal" on public.school_gallery_posts;
create policy "gallery_delete_own_or_principal"
on public.school_gallery_posts
for delete
to authenticated
using (
  exists (
    select 1 from public.staff_records sr
    where sr.user_id::text = auth.uid()::text
      and sr.school_id = school_gallery_posts.school_id
      and (
        sr.id = school_gallery_posts.staff_id
        or sr.sub_role in ('principal','super_admin')
      )
  )
);

-- Storage bucket: public read, authenticated write.
insert into storage.buckets (id, name, public)
values ('school-gallery', 'school-gallery', true)
on conflict (id) do update set public = true;

drop policy if exists "school_gallery_public_read" on storage.objects;
create policy "school_gallery_public_read"
on storage.objects
for select
to public
using (bucket_id = 'school-gallery');

drop policy if exists "school_gallery_authed_write" on storage.objects;
create policy "school_gallery_authed_write"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'school-gallery');

drop policy if exists "school_gallery_owner_delete" on storage.objects;
create policy "school_gallery_owner_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'school-gallery' and owner = auth.uid());
