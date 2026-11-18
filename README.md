# Bookkeeping

A personal bookkeeping app for recording receipts and income for one or more clients: totals by month, quarter and year, VAT figures for UK VAT returns, and exports to a spreadsheet, CSV or JSON.

Built with React + TypeScript (Vite), with data stored in Supabase behind Google sign-in.

## Features

**Receipts**
- Record a receipt's name, total (inc. VAT), VAT, category, date and an optional photo (upload, drag & drop or paste).
- Each receipt has a **VAT rate**: standard 20%, reduced 5%, zero-rated, exempt, or no VAT (supplier not VAT registered). "Calc" works out VAT from the VAT-inclusive total at that rate; the last three fix VAT at £0. A known supplier brings its last rate with it.
- **Read receipt** fills in the shop name, total, VAT, date and category from the photo using Claude. It only fills empty fields and briefly highlights what it filled.
- **Supplier memory**: the name field suggests past suppliers, and picking one sets the category you last used for it.
- **Duplicate warning**: saving a receipt with the same supplier and total as one within 3 days asks before saving it twice.
- Click any receipt to edit it in a popup; delete with Undo.

**Organising**
- Receipts grouped by year and month, with sort (date, price, VAT, name) and filters (price, VAT, date, category, VAT rate) per month.
- **Search** across all receipts by name, category or amount (`fuel 49`, `£240`).
- **Select** several receipts (or all search results) to move them to a category, export them or delete them in one go, with a single Undo.
- **Colour-coded categories**, each with its own colour. Manage them from the popup: rename, recolour with swatches or a colour wheel, merge, delete unused, add new.

**Clients**
- A separate set of books per client, switched from the top bar.
- **Recurring expenses**: set a new receipt to repeat monthly, every 3 months or yearly. When one is due, a banner offers it for review with the amounts prefilled (untick to skip a month, or change the price for this and later months); nothing is added without you confirming. Manage them under *Recurring expenses…* in the client menu.
- **Backup and restore** (client menu): one JSON file per client with receipts, photos, categories and settings; restore as a new client or into the open one without duplicates.
- Client settings: name, VAT number and VAT quarter stagger (calendar quarters, or quarters ending Apr/Jul/Oct/Jan or May/Aug/Nov/Feb).
- Delete a client (with its receipts and photos) from the client menu, after downloading a backup and typing its name.

**Overview and reports**
- UK tax year (6 April – 5 April) totals on the Overview, alongside the calendar year, and an Export period menu for the quarter, year, tax year or all time.
- Overview page: spend and VAT this quarter and this year, a spend-per-quarter chart, spend by category, and biggest bills.
- Quarterly review: totals per VAT quarter, change on the previous quarter, month-by-month and category breakdowns, and the VAT return's **Box 4** and **Box 7** with copy buttons.
- **Income**: record what you've invoiced (customer, invoice number, net, VAT rate and VAT, date) on the Income page, grouped by month with CSV export. It adds profit figures to the overview and the sales side of the VAT return: **Box 1**, **3**, **5** (whether VAT is owed or due back) and **6** appear next to Boxes 4 and 7 in the quarterly review.
- **Mark a VAT quarter as filed** once its return is submitted. Box 4 and Box 7 are saved as filed, and the quarter's receipts are locked (shown with a padlock, read-only in the editor, and refused by the database) until you unfile it. Moving them to another category is still allowed.
- **Printable report** for each VAT quarter (Report button in the Quarterly review): summary with Box 4/7, by category, by month and every receipt; print it or save as PDF.
- Export everything, a month, a filtered view or a quarter as **.xlsx** (summary sheet + per-month sheets), **CSV**, or **JSON** (includes images). Exports carry the client's name and VAT number.
- **Photos (.zip)** export: every receipt photo in the selection, named like `2026-11-02_Shell_£60.00.jpg`, plus a CSV.

**General**
- Light (cream + mint) and dark (charcoal + jade) themes, following the system or set by hand.
- Works on phones; respects "reduce motion".
- **Installable**: "Add to Home Screen" (iPhone/Android) or "Install app" (Chrome/Edge) opens it in its own window with the receipt icon; adding a photo on a phone opens the camera.

## Tech stack

- React 19, TypeScript, Vite, React Router
- Supabase: Postgres (row-level security), Storage (private image bucket), Auth (Google OAuth), Edge Functions
- Claude API (`claude-opus-5-5`) for receipt reading, called only from the Edge Function
- SheetJS (`xlsx`, lazy-loaded) for spreadsheet export
- Vitest for unit tests (`*.test.ts` next to the code they cover)

## Getting started

```sh
npm install
# create .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (see below)
npm run dev
```

`.env.local` (never committed):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The app needs a Supabase project first. See [docs/NEXT-STEPS.md](docs/NEXT-STEPS.md) for the setup checklist and [docs/SCHEMA.md](docs/SCHEMA.md) for the database design.

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server (http://localhost:5173) |
| `npm run build` | Type-check and build to `dist/` |
| `npm run gen:types` | Regenerate `src/lib/database.types.ts` from Supabase (set `SUPABASE_PROJECT_REF`, after `npx supabase login`) |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Lint with oxlint |
| `npm test` | Run the unit tests once (Vitest) |
| `npm run test:watch` | Re-run tests as files change |

Every push and pull request runs lint, build and tests in GitHub Actions (`.github/workflows/ci.yml`). A second workflow reports lines of TypeScript in the run summary.

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
    database.types.ts       table types for the Supabase client (regenerate after schema changes)
    receipts.ts, quarters.ts  grouping, totals, sorting, search, VAT quarters
    export.ts               xlsx / CSV / JSON export
    color.ts, image.ts, format.ts
    scan.ts                 which form fields a receipt scan fills
supabase/
  schema.sql                tables, row-level security, storage bucket
  functions/scan-receipt/   Edge Function that reads receipts with Claude
                            (index.ts wires Deno; handler.ts holds the tested logic)
  README.md                 detailed Supabase setup
docs/
  SCHEMA.md                 database design explained
  NEXT-STEPS.md             setup checklist, recent additions, ideas
```

## Security

- Every table and every image file is limited to the signed-in user by row-level security.
- Only the Supabase **publishable** key (`sb_publishable_…`, formerly "anon") is used in the browser; the **secret** key (`sb_secret_…`, formerly `service_role`) is never needed.
- The Anthropic API key is a Supabase secret, used only by the Edge Function.
- After your first sign-in, turn off new sign-ups in Supabase so nobody else can create an account.

## License

GPL-3.0. See [LICENSE](LICENSE).
