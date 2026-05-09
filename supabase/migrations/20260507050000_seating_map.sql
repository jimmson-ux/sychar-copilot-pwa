-- Seating map: per-class seat assignments + audit log
create table if not exists public.seating_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  class_name text not null,
  student_id uuid not null,
  row_idx int not null check (row_idx >= 0),
  col_idx int not null check (col_idx >= 0),
  rows_total int not null default 6,
  cols_total int not null default 6,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  unique (school_id, class_name, student_id),
  unique (school_id, class_name, row_idx, col_idx)
);
create index if not exists sa_school_class_idx on public.seating_assignments(school_id, class_name);

create table if not exists public.seating_moves (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  class_name text not null,
  student_id uuid not null,
  swap_student_id uuid,
  from_row int, from_col int,
  to_row int not null, to_col int not null,
  reason_code text not null check (reason_code in ('discipline','performance','teacher_choice','ai_suggestion')),
  note text,
  moved_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists sm_school_class_idx on public.seating_moves(school_id, class_name, created_at desc);

alter table public.seating_assignments enable row level security;
alter table public.seating_moves enable row level security;

drop policy if exists "sa_select_tenant" on public.seating_assignments;
create policy "sa_select_tenant" on public.seating_assignments
for select to authenticated
using (school_id in (select school_id from public.staff_records where user_id::text = auth.uid()::text and is_active = true));

drop policy if exists "sa_write_teacher" on public.seating_assignments;
create policy "sa_write_teacher" on public.seating_assignments
for all to authenticated
using (
  exists (select 1 from public.staff_records sr
    where sr.user_id::text = auth.uid()::text
      and sr.school_id = seating_assignments.school_id
      and sr.is_active = true
      and sr.sub_role in ('class_teacher','principal','super_admin','deputy_principal','deputy_principal_academic','deputy_principal_admin','dean_of_students','dean_of_studies'))
) with check (
  exists (select 1 from public.staff_records sr
    where sr.user_id::text = auth.uid()::text
      and sr.school_id = seating_assignments.school_id
      and sr.is_active = true
      and sr.sub_role in ('class_teacher','principal','super_admin','deputy_principal','deputy_principal_academic','deputy_principal_admin','dean_of_students','dean_of_studies'))
);

drop policy if exists "sm_select_tenant" on public.seating_moves;
create policy "sm_select_tenant" on public.seating_moves
for select to authenticated
using (school_id in (select school_id from public.staff_records where user_id::text = auth.uid()::text and is_active = true));

drop policy if exists "sm_insert_tenant" on public.seating_moves;
create policy "sm_insert_tenant" on public.seating_moves
for insert to authenticated
with check (school_id in (select school_id from public.staff_records where user_id::text = auth.uid()::text and is_active = true));

create or replace function public.seating_move(
  p_school_id uuid,
  p_class_name text,
  p_student_id uuid,
  p_to_row int,
  p_to_col int,
  p_reason_code text,
  p_note text default null,
  p_rows int default 6,
  p_cols int default 6
) returns void
language plpgsql
security definer
set search_path = public
as $FN$
declare
  v_from_row int; v_from_col int;
  v_swap_id uuid;
  v_user uuid := auth.uid();
begin
  if not exists (
    select 1 from public.staff_records sr
    where sr.user_id::text = v_user::text
      and sr.school_id = p_school_id
      and sr.is_active = true
      and sr.sub_role in ('class_teacher','principal','super_admin','deputy_principal','deputy_principal_academic','deputy_principal_admin','dean_of_students','dean_of_studies')
  ) then
    raise exception 'not authorised to move seats';
  end if;

  select row_idx, col_idx into v_from_row, v_from_col
    from public.seating_assignments
    where school_id = p_school_id and class_name = p_class_name and student_id = p_student_id;

  select student_id into v_swap_id
    from public.seating_assignments
    where school_id = p_school_id and class_name = p_class_name and row_idx = p_to_row and col_idx = p_to_col;

  if v_swap_id is not null and v_swap_id <> p_student_id then
    delete from public.seating_assignments
      where school_id = p_school_id and class_name = p_class_name and student_id = v_swap_id;
  end if;

  insert into public.seating_assignments(school_id, class_name, student_id, row_idx, col_idx, rows_total, cols_total, updated_by)
    values (p_school_id, p_class_name, p_student_id, p_to_row, p_to_col, p_rows, p_cols, v_user)
  on conflict (school_id, class_name, student_id)
    do update set row_idx = excluded.row_idx, col_idx = excluded.col_idx, rows_total = excluded.rows_total, cols_total = excluded.cols_total, updated_by = excluded.updated_by, updated_at = now();

  if v_swap_id is not null and v_swap_id <> p_student_id and v_from_row is not null then
    insert into public.seating_assignments(school_id, class_name, student_id, row_idx, col_idx, rows_total, cols_total, updated_by)
      values (p_school_id, p_class_name, v_swap_id, v_from_row, v_from_col, p_rows, p_cols, v_user);
  end if;

  insert into public.seating_moves(school_id, class_name, student_id, swap_student_id, from_row, from_col, to_row, to_col, reason_code, note, moved_by)
    values (p_school_id, p_class_name, p_student_id, nullif(v_swap_id, p_student_id), v_from_row, v_from_col, p_to_row, p_to_col, p_reason_code, p_note, v_user);
end;
$FN$;

grant execute on function public.seating_move(uuid, text, uuid, int, int, text, text, int, int) to authenticated;
