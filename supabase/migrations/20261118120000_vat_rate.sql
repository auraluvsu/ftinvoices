-- #15: VAT rate per receipt.
-- Run once in the Supabase dashboard (SQL Editor → New query → paste → Run) BEFORE merging the PR.
-- Safe to run twice. Existing receipts become 'standard' (20%), which is what the app assumed until now.

alter table public.receipts
  add column if not exists vat_rate text not null default 'standard';

alter table public.receipts drop constraint if exists receipts_vat_rate_check;
alter table public.receipts add constraint receipts_vat_rate_check
  check (vat_rate in ('standard', 'reduced', 'zero', 'exempt', 'outside'));

-- Zero-rated, exempt and outside-the-scope receipts never carry VAT.
alter table public.receipts drop constraint if exists receipts_vat_rate_vat_check;
alter table public.receipts add constraint receipts_vat_rate_vat_check
  check (vat_rate in ('standard', 'reduced') or vat = 0);
