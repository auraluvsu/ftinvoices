# Bookkeeping

A personal bookkeeping app for recording receipts for one or more clients: totals by month, quarter and year, VAT figures for UK VAT returns, and exports to a spreadsheet, CSV or JSON.

Built with React + TypeScript (Vite), with data stored in Supabase behind Google sign-in.

## Features

**Receipts**
- Record a receipt's name, total (inc. VAT), VAT, category, date and an optional photo (upload, drag & drop or paste).
- "Calc 20%" works out VAT from a VAT-inclusive total.
- **Read receipt** fills in the shop name, total, VAT, date and category from the photo using Claude. It only fills empty fields and briefly highlights what it filled.
- **Supplier memory**: the name field suggests past suppliers, and picking one sets the category you last used for it.
- Click any receipt to edit it in a popup; delete with Undo.

**Organising**
- Receipts grouped by year and month, with sort (date, price, VAT, name) and filters (price, VAT, date, category) per month.
- **Search** across all receipts by name, category or amount (`fuel 49`, `£240`).
- **Colour-coded categories**, each with its own colour. Manage them from the popup: rename, recolour with swatches or a colour wheel, merge, delete unused, add new.

**Clients**
- A separate set of books per client, switched from the top bar.
- Client settings: name, VAT number and VAT quarter stagger (calendar quarters, or quarters ending Apr/Jul/Oct/Jan or May/Aug/Nov/Feb).

**Overview and reports**
- Overview page: spend and VAT this quarter and this year, a spend-per-quarter chart, spend by category, and biggest bills.
- Quarterly review: totals per VAT quarter, change on the previous quarter, month-by-month and category breakdowns.
- Export everything, a month, a filtered view or a quarter as **.xlsx** (summary sheet + per-month sheets), **CSV**, or **JSON** (includes images). Exports carry the client's name and VAT number.
- **Photos (.zip)** export: every receipt photo in the selection, named like `2026-11-02_Shell_£60.00.jpg`, plus a CSV.

**General**
- Light (cream + mint) and dark (charcoal + jade) themes, following the system or set by hand.
- Works on phones; respects "reduce motion".

## Tech stack

- React 19, TypeScript, Vite, React Router
- Supabase: Postgres (row-level security), Storage (private image bucket), Auth (Google OAuth), Edge Functions
- Claude API (`claude-opus-5-5`) for receipt reading, called only from the Edge Function
- SheetJS (`xlsx`, lazy-loaded) for spreadsheet export

## Getting started

```sh
npm install
cp .env.example .env.local   # then fill in your Supabase URL and anon key
npm run dev
```

The app needs a Supabase project first. See [docs/NEXT-STEPS.md](docs/NEXT-STEPS.md) for the setup checklist and [docs/SCHEMA.md](docs/SCHEMA.md) for the database design.

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (http://localhost:5173) |
| `npm run build` | Type-check and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint with oxlint |

## Project layout

```
src/
  App.tsx, Layout.tsx       routes, top bar (client switcher, theme, export, account)
  auth.tsx                  Google sign-in gate
  store.tsx                 loads and saves data in Supabase; app-wide toasts
  pages/                    Overview, Receipts, Sign-in
  components/               form, popups, charts, colour wheel, menus
  lib/
    db.ts                   typed Supabase queries, image storage, scan call
    receipts.ts, quarters.ts  grouping, totals, sorting, search, VAT quarters
    export.ts               xlsx / CSV / JSON export
    color.ts, image.ts, format.ts
supabase/
  schema.sql                tables, row-level security, storage bucket
  functions/scan-receipt/   Edge Function that reads receipts with Claude
  README.md                 detailed Supabase setup
docs/
  SCHEMA.md                 database design explained
  NEXT-STEPS.md             setup checklist, recent additions, ideas
```

## Security

- Every table and every image file is limited to the signed-in user by row-level security.
- Only the Supabase **anon** key is used in the browser; the `service_role` key is never needed.
- The Anthropic API key is a Supabase secret, used only by the Edge Function.
- After your first sign-in, turn off new sign-ups in Supabase so nobody else can create an account.

## License

GPL-3.0. See [LICENSE](LICENSE).
