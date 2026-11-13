-- Bookkeeping schema for Supabase.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
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
  date        date not null,
  image_path  text,                            -- path in the 'receipts' storage bucket
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (category_id, client_id) references public.categories (id, client_id) on delete restrict
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
