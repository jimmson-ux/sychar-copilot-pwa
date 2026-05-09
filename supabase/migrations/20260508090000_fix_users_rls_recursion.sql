-- Sychar Copilot — stop recursive RLS on public.users.
-- The app's auth source of truth is staff_records, so public.users must never
-- use policies that query public.users again to decide access.
do $$
declare
  pol record;
  owner_col text;
begin
  if to_regclass('public.users') is null then
    return;
  end if;

  -- Remove any existing recursive policies on users.
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'users'
  loop
    execute format('drop policy if exists %I on public.users', pol.policyname);
  end loop;

  alter table public.users enable row level security;

  select column_name into owner_col
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'users'
    and column_name in ('id', 'user_id')
  order by case column_name when 'id' then 1 else 2 end
  limit 1;

  -- Recreate only direct owner policies; no subqueries, no role lookups, no recursion.
  if owner_col is not null then
    execute format(
      'create policy "users_select_own" on public.users for select to authenticated using ((%I)::text = (auth.uid())::text)',
      owner_col
    );
    execute format(
      'create policy "users_insert_own" on public.users for insert to authenticated with check ((%I)::text = (auth.uid())::text)',
      owner_col
    );
    execute format(
      'create policy "users_update_own" on public.users for update to authenticated using ((%I)::text = (auth.uid())::text) with check ((%I)::text = (auth.uid())::text)',
      owner_col,
      owner_col
    );
    execute format(
      'create policy "users_delete_own" on public.users for delete to authenticated using ((%I)::text = (auth.uid())::text)',
      owner_col
    );
  end if;
end $$;
