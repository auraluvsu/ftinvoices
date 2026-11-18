-- #14: mark a VAT quarter as filed and lock its receipts.
-- Run once in the Supabase dashboard (SQL Editor → New query → paste → Run) BEFORE merging the PR.
-- Safe to run twice.

create table if not exists public.filed_quarters (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  client_id    uuid not null references public.clients on delete cascade,
  period_start date not null,
  period_end   date not null,
  filed_at     timestamptz not null default now(),
  box4         numeric(12,2) not null,     -- VAT reclaimed, as filed
  box7         numeric(12,0) not null,     -- net purchases in whole pounds, as filed
  check (period_end > period_start),
  unique (client_id, period_start)
);

alter table public.filed_quarters enable row level security;

drop policy if exists "own filed quarters" on public.filed_quarters;
create policy "own filed quarters" on public.filed_quarters for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

-- Receipts dated inside a filed quarter can't be added, deleted or have their figures changed.
-- Moving them to another category is still allowed (category merges and bulk moves).
-- Deleting the whole client is allowed: by the time its receipts cascade, the client row is gone.
create or replace function public.guard_filed_receipts() returns trigger
language plpgsql security invoker as $$
declare
  r public.receipts := coalesce(old, new);
begin
  if tg_op = 'DELETE' and not exists (select 1 from public.clients where id = old.client_id) then
    return old;
  end if;
  if tg_op = 'UPDATE'
     and (new.client_id, new.name, new.total, new.vat, new.vat_rate, new.date, new.image_path)
         is not distinct from (old.client_id, old.name, old.total, old.vat, old.vat_rate, old.date, old.image_path) then
    return new;
  end if;
  if tg_op in ('UPDATE', 'DELETE') and exists (
       select 1 from public.filed_quarters f
       where f.client_id = old.client_id and old.date between f.period_start and f.period_end) then
    raise exception 'This receipt is in a filed VAT quarter. Unfile the quarter to change it.'
      using errcode = 'P0001';
  end if;
  if tg_op in ('INSERT', 'UPDATE') and exists (
       select 1 from public.filed_quarters f
       where f.client_id = new.client_id and new.date between f.period_start and f.period_end) then
    raise exception 'That date is in a filed VAT quarter. Unfile the quarter to add receipts to it.'
      using errcode = 'P0001';
  end if;
  return r;
end $$;

drop trigger if exists receipts_filed_guard on public.receipts;
create trigger receipts_filed_guard before insert or update or delete on public.receipts
  for each row execute function public.guard_filed_receipts();
