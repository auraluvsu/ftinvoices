-- #19: recurring expenses (subscriptions, phone, rent).
-- Run once in the Supabase dashboard (SQL Editor → New query → paste → Run) BEFORE merging the PR.
-- Safe to run twice.

create table if not exists public.recurring_expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  client_id   uuid not null references public.clients on delete cascade,
  category_id uuid,                             -- null if its category was deleted (shown as Other)
  name        text not null check (length(trim(name)) > 0),
  total       numeric(12,2) not null check (total >= 0),
  vat         numeric(12,2) not null default 0 check (vat >= 0 and vat <= total),
  vat_rate    text not null default 'standard'
              check (vat_rate in ('standard', 'reduced', 'zero', 'exempt', 'outside')),
  frequency   text not null check (frequency in ('monthly', 'quarterly', 'yearly')),
  anchor_day  smallint not null check (anchor_day between 1 and 31),   -- day of month it falls on
  next_date   date not null,                    -- the next one not yet added or skipped
  created_at  timestamptz not null default now(),
  foreign key (category_id, client_id) references public.categories (id, client_id) on delete set null (category_id),
  check (vat_rate in ('standard', 'reduced') or vat = 0)
);
create index if not exists recurring_expenses_client_idx on public.recurring_expenses (client_id);

alter table public.recurring_expenses enable row level security;

drop policy if exists "own recurring expenses" on public.recurring_expenses;
create policy "own recurring expenses" on public.recurring_expenses for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));
