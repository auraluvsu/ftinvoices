import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
// Anon / publishable key only. Row-level security protects the data; never put the service_role key here.
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when the Supabase env vars are present (see .env.local). */
export const supabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient<Database> = createClient<Database>(url ?? 'http://localhost', anonKey ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
