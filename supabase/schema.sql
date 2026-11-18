-- Bookkeeping schema for Supabase.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- This file is the whole schema for a new project. An existing project instead runs the files in
-- supabase/migrations/ that it hasn't run yet, oldest first (see supabase/README.md).
-- Every table has row-level security: a signed-in user only ever sees their own rows.

-- ===== Clients (one set of books per client) =====
create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  vat_number  text,
  vat_quarter_stagger smallint not null default 0 check (vat_quarter_stagger in (0,1,2)),
  created_at  timestamptz not null default now()
);

-- ===== Categories (per client, with colour) =====
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  client_id   uuid not null references public.clients on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  color       text not null check (color ~ '^#[0-9a-f]{6}$'),
  created_at  timestamptz not null default now(),
  unique (id, client_id)                       -- lets receipts enforce same-client category
);
create unique index categories_client_name_uq on public.categories (client_id, lower(name));

-- ===== Receipts =====
create table public.receipts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  client_id   uuid not null references public.clients on delete cascade,
  category_id uuid not null,
  name        text not null check (length(trim(name)) > 0),
  total       numeric(12,2) not null check (total >= 0),
  vat         numeric(12,2) not null default 0 check (vat >= 0 and vat <= total),
  -- standard 20%, reduced 5%, zero-rated, exempt, or outside (supplier not VAT registered)
  vat_rate    text not null default 'standard'
              constraint receipts_vat_rate_check check (vat_rate in ('standard', 'reduced', 'zero', 'exempt', 'outside')),
  date        date not null,
  image_path  text,                            -- path in the 'receipts' storage bucket
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (category_id, client_id) references public.categories (id, client_id) on delete restrict,
  constraint receipts_vat_rate_vat_check check (vat_rate in ('standard', 'reduced') or vat = 0)
);
create index receipts_client_date_idx on public.receipts (client_id, date desc);

create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger receipts_touch before update on public.receipts
  for each row execute function public.touch_updated_at();

-- New client => seed the 8 default categories with their colours
create function public.seed_default_categories() returns trigger
language plpgsql security invoker as $$
begin
  insert into public.categories (user_id, client_id, name, color) values
    (new.user_id, new.id, 'Equipment',                '#2f5bd3'),
    (new.user_id, new.id, 'Fuel',                     '#e3120b'),
    (new.user_id, new.id, 'Meals & entertainment',    '#d1149a'),
    (new.user_id, new.id, 'Office supplies',          '#00b4d8'),
    (new.user_id, new.id, 'Software & subscriptions', '#b8860b'),
    (new.user_id, new.id, 'Travel',                   '#ffffff'),
    (new.user_id, new.id, 'Utilities',                '#228b22'),
    (new.user_id, new.id, 'Other',                    '#ff8c00');
  return new;
end $$;
create trigger clients_seed after insert on public.clients
  for each row execute function public.seed_default_categories();

-- ===== Filed VAT quarters (their receipts are locked) =====
create table public.filed_quarters (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users on delete cascade,
  client_id    uuid not null references public.clients on delete cascade,
  period_start date not null,
  period_end   date not null,
  filed_at     timestamptz not null default now(),
  box4         numeric(12,2) not null,     -- VAT reclaimed, as filed
  box7         numeric(12,0) not null,     -- net purchases in whole pounds, as filed
  box1         numeric(12,2),              -- VAT on sales, as filed (null if filed before income was recorded)
  box6         numeric(12,0),              -- net sales in whole pounds, as filed
  check (period_end > period_start),
  unique (client_id, period_start)
);

alter table public.filed_quarters enable row level security;

create policy "own filed quarters" on public.filed_quarters for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

-- Receipts dated inside a filed quarter can't be added, deleted or have their figures changed.
-- Moving them to another category is still allowed (category merges and bulk moves).
-- Deleting the whole client is allowed: by the time its receipts cascade, the client row is gone.
create function public.guard_filed_receipts() returns trigger
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

create trigger receipts_filed_guard before insert or update or delete on public.receipts
  for each row execute function public.guard_filed_receipts();

-- ===== Recurring expenses (offered for review when due) =====
create table public.recurring_expenses (
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
create index recurring_expenses_client_idx on public.recurring_expenses (client_id);

alter table public.recurring_expenses enable row level security;

create policy "own recurring expenses" on public.recurring_expenses for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

-- ===== Income (sales) =====
create table public.income (
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
create index income_client_date_idx on public.income (client_id, date desc);

create trigger income_touch before update on public.income
  for each row execute function public.touch_updated_at();

alter table public.income enable row level security;

create policy "own income" on public.income for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

-- Income in a filed VAT quarter is locked too (same rule as receipts).
create function public.guard_filed_income() returns trigger
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

create trigger income_filed_guard before insert or update or delete on public.income
  for each row execute function public.guard_filed_income();

-- ===== Row-level security: you only ever see your own rows =====
alter table public.clients    enable row level security;
alter table public.categories enable row level security;
alter table public.receipts   enable row level security;

create policy "own clients" on public.clients for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own categories" on public.categories for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

create policy "own receipts" on public.receipts for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid()
    and exists (select 1 from public.clients c where c.id = client_id and c.user_id = auth.uid()));

-- ===== Private storage bucket for receipt images =====
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false);

create policy "own receipt images" on storage.objects for all to authenticated
  using      (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
