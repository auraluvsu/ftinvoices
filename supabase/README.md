# Supabase setup

One-time setup for the bookkeeping app's backend.

## 1. Database and storage
Supabase dashboard → **SQL Editor** → New query → paste [`schema.sql`](schema.sql) → **Run**.

This creates `clients`, `categories` and `receipts` (row-level security on all three) plus a private `receipts` storage bucket. A signed-in user can only ever read or write their own rows and files.

## 2. Google sign-in
1. Google Cloud Console → APIs & Services → **OAuth consent screen** (External, add your email as a test user), then **Credentials → Create credentials → OAuth client ID** → *Web application*.
   - Authorised redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
2. Supabase → **Authentication → Sign In / Providers → Google**: enable it and paste the client ID and secret.
3. Supabase → **Authentication → URL Configuration**: set the Site URL and add redirect URLs for `http://localhost:5173` and your production URL.
4. After you've signed in once, turn off **Allow new users to sign up** (Authentication → Sign In / Providers). Then nobody else can create an account.

## 3. App environment
Copy `.env.example` to `.env.local` and fill in the values from **Project Settings → API**:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon / publishable key>
```

Only the anon (publishable) key belongs in the browser. **Never use the `service_role` key here.**

## 4. Receipt scanning (optional)
The "Read receipt" button calls the `scan-receipt` Edge Function, which sends the photo to Claude (`claude-opus-5-5`, low effort). Your Anthropic API key stays on the server. Each scan costs roughly 1–2p.

```sh
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy scan-receipt
```

JWT verification is left on, so only signed-in users can call the function. If a request is declined by a safety classifier, it is retried on Anthropic's recommended fallback model (`fallbacks: "default"`).

## Hosting
The app is a single-page app: configure your host to serve `index.html` for unknown paths (e.g. `/receipts`).
