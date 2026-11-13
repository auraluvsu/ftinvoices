import { createContext, useContext } from 'react';
import type { Session } from '@supabase/supabase-js';

export interface Auth {
  session: Session;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth must be used inside <AuthGate>');
  return v;
}
