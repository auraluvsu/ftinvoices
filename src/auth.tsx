import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from './lib/supabase';
import { AuthContext } from './authContext';
import { SignInPage } from './pages/SignInPage';

/** Renders children only for a signed-in user; otherwise shows the sign-in page. */
export function AuthGate({ children }: { children: React.ReactNode }) {
  // undefined = still checking, null = signed out
  const [session, setSession] = useState<Session | null | undefined>(supabaseConfigured ? undefined : null);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo(
    () =>
      session
        ? {
            session,
            signOut: async () => {
              await supabase.auth.signOut();
            },
          }
        : null,
    [session],
  );

  if (!supabaseConfigured) return <SignInPage notConfigured />;
  if (session === undefined) return <div className="boot" aria-busy="true" />;
  if (!value) return <SignInPage />;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
