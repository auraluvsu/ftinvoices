import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Publishable key only (sb_publishable_…, formerly the "anon" key). Row-level security protects
// the data; never put the secret key (sb_secret_…, formerly service_role) here.
// VITE_SUPABASE_ANON_KEY is still accepted so existing .env.local files and hosting settings keep working.
const anonKey = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as
  | string
  | undefined;

/** True when the Supabase env vars are present (see .env.local). */
export const supabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient = createClient(url ?? 'http://localhost', anonKey ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
