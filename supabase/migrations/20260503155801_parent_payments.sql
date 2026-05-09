-- Parent payments ledger for M-Pesa STK push reconciliation.
create table if not exists public.parent_payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools(id) on delete set null,
  parent_user_id uuid references auth.users(id) on delete set null,
  child_id uuid,
  phone text not null,
  amount integer not null check (amount >= 1),
  account_ref text not null,
  description text not null,
  checkout_request_id text unique,
  merchant_request_id text,
  mpesa_receipt text,
  status text not null default 'pending'
    check (status in ('queued','pending','paid','failed','cancelled')),
  result_code int,
  result_desc text,
  raw_callback jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists parent_payments_status_idx
  on public.parent_payments (status, created_at desc);
create index if not exists parent_payments_parent_idx
  on public.parent_payments (parent_user_id, created_at desc);
create index if not exists parent_payments_school_idx
  on public.parent_payments (school_id, created_at desc);

alter table public.parent_payments enable row level security;

drop policy if exists "parents read own payments" on public.parent_payments;
create policy "parents read own payments"
  on public.parent_payments for select
  to authenticated
  using (parent_user_id = auth.uid());

drop policy if exists "school staff read school payments" on public.parent_payments;
create policy "school staff read school payments"
  on public.parent_payments for select
  to authenticated
  using (
    exists (
      select 1 from public.staff_records sr
      where sr.user_id = auth.uid()::text
        and sr.school_id = parent_payments.school_id
        and sr.sub_role in ('Principal','Deputy Principal Administration','Bursar')
    )
  );

create or replace function public.touch_parent_payments_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_touch_parent_payments on public.parent_payments;
create trigger trg_touch_parent_payments
  before update on public.parent_payments
  for each row execute function public.touch_parent_payments_updated_at();

drop policy if exists "parents insert own payments" on public.parent_payments;
create policy "parents insert own payments"
  on public.parent_payments for insert
  to authenticated
  with check (parent_user_id = auth.uid());

drop policy if exists "parents update own queued payments" on public.parent_payments;
create policy "parents update own queued payments"
  on public.parent_payments for update
  to authenticated
  using (parent_user_id = auth.uid() and status in ('queued','pending'))
  with check (parent_user_id = auth.uid());
