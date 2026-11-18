# Next steps and recent additions

## Setup checklist

The code is complete, but it hasn't been run against a real Supabase project, Google sign-in or the Claude API yet. It was tested in a headless browser against a mocked Supabase backend. Work through these steps, then try the checks at the end. Full detail is in [`supabase/README.md`](../supabase/README.md).

- [ ] **Create the database.** Supabase → SQL Editor → paste [`supabase/schema.sql`](../supabase/schema.sql) → Run. See [SCHEMA.md](SCHEMA.md) for what it creates.
- [ ] **Google OAuth client.** Google Cloud Console → OAuth consent screen + Credentials → OAuth client ID (Web). Redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
- [ ] **Enable Google in Supabase.** Authentication → Sign In / Providers → Google → paste the client ID and secret.
- [ ] **Redirect URLs.** Authentication → URL Configuration → add `http://localhost:5173` and your production URL.
- [ ] **Environment.** `cp .env.example .env.local`, then fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Project Settings → API). Use the anon key only, never `service_role`.
- [ ] **First sign-in.** `npm run dev` → Continue with Google → name your first client.
- [ ] **Lock down sign-ups.** After that first sign-in, turn off *Allow new users to sign up*.
- [ ] **Receipt scanning (optional).**
  ```sh
  npx supabase login
  npx supabase link --project-ref <project-ref>
  npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
  npx supabase functions deploy scan-receipt
  ```
- [ ] **Hosting.** Serve `index.html` for unknown paths (single-page app), and add the production URL to the Supabase redirect URLs.

### Checks once it's connected
- [ ] Add a receipt with a photo, reload, and see that it's still there with its image.
- [ ] Create a second client and check its books are separate when switching.
- [ ] Sign in on another device and see the same data.
- [ ] Rename and merge a category; recolour one with the wheel.
- [ ] Scan a real receipt with **Read receipt**.
- [ ] Sign out and check the sign-in page shows.

If anything fails, copy the error message from the screen or the browser console.

## Recent additions

| Commit | What changed |
|---|---|
| Colour-coded categories | Each category has a colour, shown on tags, filter chips, the category dropdown and category bars. New categories offer quick-pick swatches and a colour wheel. |
| Google sign-in | The app sits behind a Supabase session with "Continue with Google"; account menu with Sign out. |
| Data in Supabase | Receipts, categories and clients are in Postgres with row-level security; photos are in a private bucket and shown through expiring signed links. Saving shows "Saving…", and failures roll back with a message. |
| Multiple clients | A client switcher in the top bar; client settings for name, VAT number and VAT quarter stagger (now per client). Exports include the client's name and VAT number. |
| Supplier memory | Past suppliers are suggested as you type; choosing one sets its last-used category unless you've picked one yourself. |
| Search | One search box across all receipts by name, category or amount. Matching months open automatically, with a results total. |
| Category management | Rename, recolour, merge (moves receipts, then deletes), delete unused, and add categories. |
| Read receipt | A Supabase Edge Function sends the photo to Claude (`claude-opus-5-5`, low effort) and fills in empty fields. Roughly 1–2p per scan. A declined request is retried on Anthropic's recommended fallback model. |

### Behaviour changes to be aware of
- **Old browser data isn't used.** Receipts saved in this browser before the move to Supabase are ignored (you chose to start fresh). They stay in the browser's storage until cleared.
- **VAT quarter setting moved** from the Quarterly review tab into Client settings, because it's now per client.
- **Storage meter removed.** The ~5 MB browser limit no longer applies.
- **Bundle size.** The Supabase library takes the main bundle just over Vite's 500 kB warning (about 170 kB compressed). It works fine; it could be split into smaller chunks if load time matters.

## Ideas for later

These came up while planning and haven't been built yet.

**VAT returns**
- Box 4 (VAT reclaimed) and Box 7 (net purchases) per quarter, ready to copy into HMRC software.
- Mark a quarter as filed and lock its receipts.
- VAT rate per receipt (20% / 5% / 0% / exempt, or "supplier not VAT registered").
- UK tax year (6 April – 5 April) totals alongside calendar years.

**Data and backup**
- One-click backup and restore of a client's books.
- Delete a client (with its images) from Client settings.

**Faster entry**
- Recurring expenses (monthly subscriptions added automatically).
- Duplicate warning (same supplier, amount and date).
- Install as a phone app that opens the camera directly.
- Select several receipts at once to recategorise, delete or export.

**Reports**
- Printable / PDF quarter or year report for the client or accountant.
- Income and sales invoices, for profit figures and the sales boxes on the VAT return.
