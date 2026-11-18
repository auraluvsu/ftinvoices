# Supabase setup

One-time setup for the bookkeeping app's backend.

## 1. Database and storage
Supabase dashboard → **SQL Editor** → New query → paste [`schema.sql`](schema.sql) → **Run**.

This creates `clients`, `categories`, `receipts`, `filed_quarters` and `recurring_expenses` (row-level security on all of them) plus a private `receipts` storage bucket. A signed-in user can only ever read or write their own rows and files.

### Updating an existing database
`schema.sql` always describes the whole, current schema, so a new project only ever runs that. Changes to a database that's already live come as numbered files in [`migrations/`](migrations/). When a pull request adds one, paste it into the SQL Editor and run it **before** merging, since the new app code expects the new columns. Each migration is safe to run twice.

| Migration | Adds |
|---|---|
| `20261118120000_vat_rate.sql` | `receipts.vat_rate` (20% / 5% / 0% / exempt / outside the scope) |
| `20261118130000_filed_quarters.sql` | `filed_quarters` table and the trigger that locks receipts in filed quarters |
| `20261118140000_recurring_expenses.sql` | `recurring_expenses` table |

## 2. Google sign-in
1. Google Cloud Console → APIs & Services → **OAuth consent screen** (External, add your email as a test user), then **Credentials → Create credentials → OAuth client ID** → *Web application*.
   - Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
2. Supabase → **Authentication → Sign In / Providers → Google**: enable it and paste the client ID and secret.
3. Supabase → **Authentication → URL Configuration**: set the Site URL and add redirect URLs for `http://localhost:5173` and your production URL.
4. After you've signed in once, turn off **Allow new users to sign up** (Authentication → Sign In / Providers). Then nobody else can create an account.

## 3. App environment
Create `.env.local` in the project root with the values from **Project Settings → API Keys**:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Only the publishable key belongs in the browser. **Never use the secret key (`sb_secret_…`, formerly `service_role`) here.** If your `.env.local` or host still has `VITE_SUPABASE_ANON_KEY` from before, it keeps working; rename it when convenient.

## 4. Receipt scanning (optional)
The "Read receipt" button calls the `scan-receipt` Edge Function, which sends the photo to Claude (`claude-opus-5-5`, low effort). Your Anthropic API key stays on the server. Each scan costs roughly 1–2p.

```sh
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy scan-receipt
```

JWT verification is left on, so only signed-in users can call the function. If a request is declined by a safety classifier, it is retried on Anthropic's recommended fallback model (`fallbacks: "default"`).

Until the function is deployed, **Read receipt** says it isn't set up the first time it's clicked, then hides itself for the rest of the browser session. To hide it completely, set `VITE_SCAN_ENABLED=false` in `.env.local` (and in your host's environment variables).

## Hosting
The app is a single-page app: configure your host to serve `index.html` for unknown paths (e.g. `/receipts`).
