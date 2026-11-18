-- #25: income (sales), for profit figures and the sales side of the VAT return (Boxes 1 and 6).
-- Run once in the Supabase dashboard (SQL Editor → New query → paste → Run) BEFORE merging the PR.
-- Needs the filed_quarters migration first. Safe to run twice.

create table if not exists public.income (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  client_id   uuid not null references public.clients on delete cascade,
  customer    text not null check (length(trim(customer)) > 0),
  reference   text,                             -- invoice number or similar
  description text,
  net         numeric(12,2) not null check (net >= 0),
  vat         numeric(12,2) not null default 0 check (vat >= 0),
  -- standard 20%, reduced 5%, zero-rated, exempt, or outside the scope of VAT
  vat_rate    text not null default 'standard'
              check (vat_rate in ('standard', 'reduced', 'zero', 'exempt', 'outside')),
  date        date not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (vat_rate in ('standard', 'reduced') or vat = 0)
);
create index if not exists income_client_date_idx on public.income (client_id, date desc);

drop trigger if exists income_touch on public.income;
create trigger income_touch before update on public.income
  for each row execute function public.touch_updated_at();

alter table public.income enable row level security;

drop policy if exists "own income" on public.income;
create policy "own income" on public.income for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

-- Income in a filed VAT quarter is locked too (same rule as receipts).
create or replace function public.guard_filed_income() returns trigger
language plpgsql security invoker as $$
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.clients where id = old.client_id) then
    return old;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and exists (
       select 1 from public.filed_quarters f
       where f.client_id = old.client_id and old.date between f.period_start and f.period_end) then
    raise exception 'This income is in a filed VAT quarter. Unfile the quarter to change it.'
      using errcode = 'P0001';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and exists (
       select 1 from public.filed_quarters f
       where f.client_id = new.client_id and new.date between f.period_start and f.period_end) then
    raise exception 'That date is in a filed VAT quarter. Unfile the quarter to add income to it.'
      using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists income_filed_guard on public.income;
create trigger income_filed_guard before insert or update or delete on public.income
  for each row execute function public.guard_filed_income();

-- Filing now records the sales boxes too (null on quarters filed before this).
alter table public.filed_quarters add column if not exists box1 numeric(12,2);
alter table public.filed_quarters add column if not exists box6 numeric(12,0);
