import { useCallback, useEffect, useState } from 'react';
import type { Category, Client, FiledQuarter } from '../types';
import * as db from '../lib/db';

export type Phase = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'no-client' } | { kind: 'ready' };

const REFRESH_MIN_GAP_MS = 60_000;

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Which client was last open on this device (a convenience only).
const CLIENT_KEY = 'ftinvoices.clientId';
const readClientId = () => {
  try {
    return localStorage.getItem(CLIENT_KEY);
  } catch {
    return null;
  }
};
const saveClientId = (id: string) => {
  try {
    localStorage.setItem(CLIENT_KEY, id);
  } catch {
    /* non-essential */
  }
};

/**
 * Loads the user's clients and the open client's categories and receipts.
 * `onSigned` receives the photo links signed during each load.
 */
export function useBooks(onSigned: (urls: Map<string, string>) => void) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [categoryList, setCategoryList] = useState<Category[]>([]);
  const [stored, setStored] = useState<db.StoredReceipt[]>([]);
  const [filed, setFiled] = useState<FiledQuarter[]>([]);
  const client = clients.find((c) => c.id === clientId) ?? null;

  /** Fetches everything, then applies it in one go (state is only set after the network calls). */
  // silent: refresh in place, keeping the current screen if it fails.
  const fetchBooks = useCallback(
    async (preferredId?: string, { silent = false } = {}) => {
      try {
        const all = await db.listClients();
        if (!all.length) return setPhase({ kind: 'no-client' });
        const want = preferredId ?? readClientId();
        const c = all.find((x) => x.id === want) ?? all[0];
        const [cats, recs, fq] = await Promise.all([
          db.listCategories(c.id),
          db.listReceipts(c.id),
          db.listFiledQuarters(c.id),
        ]);
        const signed = await db.signImages(recs.flatMap((r) => (r.imagePath ? [r.imagePath] : [])));
        saveClientId(c.id);
        setClients(all);
        setClientId(c.id);
        setCategoryList(cats);
        setStored(recs);
        setFiled(fq);
        onSigned(signed);
        setPhase({ kind: 'ready' });
      } catch (e) {
        if (silent) console.error(e);
        else setPhase({ kind: 'error', message: errMsg(e) });
      }
    },
    [onSigned],
  );

  const reload = useCallback(
    (preferredId?: string, opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setPhase({ kind: 'loading' });
      return fetchBooks(preferredId, opts);
    },
    [fetchBooks],
  );

  useEffect(() => {
    // Initial load from Supabase; state is only set after the awaited network calls.
    // oxlint-disable-next-line react/set-state-in-effect
    void fetchBooks();
  }, [fetchBooks]);

  // Coming back to the tab: pick up changes made on other devices (at most once a minute).
  useEffect(() => {
    if (phase.kind !== 'ready') return;
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < REFRESH_MIN_GAP_MS) return;
      last = Date.now();
      // Stay on this tab's client even if another tab switched (the choice is shared via localStorage).
      void reload(clientId ?? undefined, { silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [phase.kind, reload, clientId]);

  return { phase, clients, setClients, client, categoryList, setCategoryList, stored, setStored, filed, setFiled, reload };
}
