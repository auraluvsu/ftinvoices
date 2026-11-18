import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Category, Client, Receipt } from './types';
import { AppDataContext as Ctx, type AppData, type Toast } from './appData';
import { useAuth } from './authContext';
import { exportReceipts } from './lib/export';
import { fallbackColor } from './lib/color';
import { dataUrlToBlob } from './lib/image';
import * as db from './lib/db';
import { BootScreen } from './components/BootScreen';
import { ClientSettingsModal } from './components/ClientSettingsModal';
import { ManageCategoriesModal } from './components/ManageCategoriesModal';

type Phase = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'no-client' } | { kind: 'ready' };

const RESIGN_EVERY_MS = 6 * 60 * 60 * 1000; // well inside the 12h signed-URL lifetime
const REFRESH_MIN_GAP_MS = 60_000;
const IMAGE_DELETE_DELAY_MS = 8000; // keep the image until the Undo toast is gone

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

/** Owns all data for the signed-in user (loaded from Supabase) and app-wide toasts. */
export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session.user.id;

  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [settings, setSettings] = useState<'edit' | 'new' | null>(null);
  const [managingCategories, setManagingCategories] = useState(false);
  const client = clients.find((c) => c.id === clientId) ?? null;
  const [categoryList, setCategoryList] = useState<Category[]>([]);
  const [stored, setStored] = useState<db.StoredReceipt[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map());
  const [toast, setToast] = useState<Toast | null>(null);
  const storedRef = useRef(stored);
  useEffect(() => {
    storedRef.current = stored;
  }, [stored]);

  const notify = useCallback((msg: string, kind: Toast['kind'] = 'info', undo?: () => void) => {
    const id = Date.now();
    setToast({ id, msg, kind, undo });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), undo ? 6000 : 4000);
  }, []);

  /** Fetches everything, then applies it in one go (state is only set after the network calls). */
  // silent: refresh in place, keeping the current screen if it fails.
  const fetchBooks = useCallback(async (preferredId?: string, { silent = false } = {}) => {
    try {
      const all = await db.listClients();
      if (!all.length) return setPhase({ kind: 'no-client' });
      const want = preferredId ?? readClientId();
      const c = all.find((x) => x.id === want) ?? all[0];
      const [cats, recs] = await Promise.all([db.listCategories(c.id), db.listReceipts(c.id)]);
      const signed = await db.signImages(recs.flatMap((r) => (r.imagePath ? [r.imagePath] : [])));
      saveClientId(c.id);
      setClients(all);
      setClientId(c.id);
      setCategoryList(cats);
      setStored(recs);
      setUrls(signed);
      setPhase({ kind: 'ready' });
    } catch (e) {
      if (silent) console.error(e);
      else setPhase({ kind: 'error', message: errMsg(e) });
    }
  }, []);

  const reload = useCallback(
    (preferredId?: string, opts: { silent?: boolean } = {}) => {
      if (!opts.silent) setPhase({ kind: 'loading' });
      return fetchBooks(preferredId, opts);
    },
    [fetchBooks],
  );

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

  const createClient = useCallback(
    async (c: Omit<Client, 'id'>) => {
      const created = await db.createClient(c);
      await reload(created.id);
    },
    [reload],
  );

  const updateClient = useCallback(
    async (id: string, patch: Omit<Client, 'id'>) => {
      await db.updateClient(id, patch);
      setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    },
    [],
  );

  useEffect(() => {
    // Initial load from Supabase; state is only set after the awaited network calls.
    // oxlint-disable-next-line react/set-state-in-effect
    void fetchBooks();
  }, [fetchBooks]);

  // Signed URLs expire; refresh them periodically while the app stays open.
  useEffect(() => {
    if (phase.kind !== 'ready') return;
    const t = setInterval(() => {
      const paths = storedRef.current.flatMap((r) => (r.imagePath ? [r.imagePath] : []));
      db.signImages(paths).then((m) => setUrls((prev) => new Map([...prev, ...m])), console.error);
    }, RESIGN_EVERY_MS);
    return () => clearInterval(t);
  }, [phase.kind]);

  const categoryNames = useMemo(() => new Map(categoryList.map((c) => [c.id, c.name])), [categoryList]);

  const receipts = useMemo<Receipt[]>(
    () =>
      stored.map((r) => ({
        ...r,
        category: categoryNames.get(r.categoryId) ?? 'Uncategorised',
        image: r.imagePath ? urls.get(r.imagePath) : undefined,
      })),
    [stored, categoryNames, urls],
  );

  const categories = useMemo(
    () =>
      categoryList
        .map((c) => c.name)
        .sort((a, b) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b))),
    [categoryList],
  );

  const categoryColor = useCallback(
    (name: string) => categoryList.find((c) => c.name === name)?.color ?? fallbackColor(name),
    [categoryList],
  );

  const value = useMemo<AppData | null>(() => {
    if (!client) return null;

    return {
      client,
      clients,
      switchClient: (id) => {
        if (id !== client.id) void reload(id);
      },
      openClientSettings: (mode = 'edit') => setSettings(mode),
      receipts,
      categories,
      categoryList,
      categoryColor,
      openCategoryManager: () => setManagingCategories(true),
      addCategory: async (name, color) => {
        try {
          const created = await db.insertCategory(client.id, name, color);
          setCategoryList((prev) => [...prev, created]);
          return true;
        } catch (e) {
          notify(`Couldn’t add category: ${errMsg(e)}`, 'error');
          return false;
        }
      },
      updateCategory: async (id, patch) => {
        const before = categoryList;
        setCategoryList((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
        try {
          await db.updateCategory(id, patch);
          return true;
        } catch (e) {
          setCategoryList(before);
          notify(`Couldn’t update category: ${errMsg(e)}`, 'error');
          return false;
        }
      },
      mergeCategory: async (fromId, toId) => {
        try {
          await db.reassignReceipts(client.id, fromId, toId);
          setStored((prev) => prev.map((r) => (r.categoryId === fromId ? { ...r, categoryId: toId } : r)));
          await db.deleteCategory(fromId);
          setCategoryList((prev) => prev.filter((c) => c.id !== fromId));
          return true;
        } catch (e) {
          notify(`Couldn’t merge: ${errMsg(e)}`, 'error');
          return false;
        }
      },
      deleteCategory: async (id) => {
        try {
          await db.deleteCategory(id);
          setCategoryList((prev) => prev.filter((c) => c.id !== id));
          return true;
        } catch (e) {
          notify(`Couldn’t delete category: ${errMsg(e)}`, 'error');
          return false;
        }
      },
      stagger: client.stagger,

      saveReceipt: async (draft, newCategory) => {
        const existing = stored.find((r) => r.id === draft.id);
        let uploadedPath: string | undefined;
        try {
          // 1. Category (create it first if new)
          let category = categoryList.find((c) => c.name === draft.category);
          if (newCategory) {
            category = await db.insertCategory(client.id, newCategory.name, newCategory.color);
            const created = category;
            setCategoryList((prev) => [...prev, created]);
          }
          if (!category) throw new Error(`Unknown category “${draft.category}”`);

          // 2. Image: upload a new one, keep the old one, or drop it
          let imagePath = existing?.imagePath;
          const isNewImage = draft.image?.startsWith('data:');
          if (isNewImage) {
            uploadedPath = db.imagePathFor(userId, client.id, draft.id);
            await db.uploadImage(uploadedPath, await dataUrlToBlob(draft.image!));
            imagePath = uploadedPath;
          } else if (!draft.image) {
            imagePath = undefined;
          }

          // 3. Row. Edits only apply if nobody changed the receipt elsewhere meanwhile.
          const row: db.StoredReceipt = {
            id: draft.id,
            clientId: client.id,
            categoryId: category.id,
            name: draft.name,
            total: draft.total,
            vat: draft.vat,
            date: draft.date,
            imagePath,
            createdAt: existing?.createdAt ?? Date.now(),
          };
          const saved = existing?.updatedAt ? await db.updateReceipt(row, existing.updatedAt) : await db.upsertReceipt(row);

          // Show the freshly uploaded image straight from memory; no need to sign it yet.
          if (isNewImage && imagePath) {
            const path = imagePath;
            setUrls((prev) => new Map(prev).set(path, draft.image!));
          }
          setStored((prev) => (existing ? prev.map((r) => (r.id === saved.id ? saved : r)) : [...prev, saved]));

          // Old image replaced or removed → delete it from storage.
          if (existing?.imagePath && existing.imagePath !== imagePath) {
            db.removeImages([existing.imagePath]).catch(console.error);
          }
          notify(existing ? 'Receipt updated' : `Added “${draft.name}”`);
          return true;
        } catch (e) {
          if (uploadedPath) db.removeImages([uploadedPath]).catch(console.error);
          if (e instanceof db.ReceiptConflictError) {
            // Load the newer version; the form stays open, so saving again overwrites it on purpose.
            void reload(client.id, { silent: true });
            notify(`${e.message}. The latest version is loaded — save again to replace it.`, 'error');
            return false;
          }
          notify(`Couldn’t save: ${errMsg(e)}`, 'error');
          return false;
        }
      },

      deleteReceipt: (receipt) => {
        const row = stored.find((r) => r.id === receipt.id);
        if (!row) return;
        setStored((prev) => prev.filter((r) => r.id !== row.id));
        db.deleteReceipt(row.id).then(
          () => {
            const timer = row.imagePath
              ? setTimeout(() => db.removeImages([row.imagePath!]).catch(console.error), IMAGE_DELETE_DELAY_MS)
              : undefined;
            notify(`Deleted “${row.name}”`, 'info', async () => {
              clearTimeout(timer);
              setToast(null);
              try {
                const restored = await db.upsertReceipt(row);
                setStored((prev) => (prev.some((r) => r.id === restored.id) ? prev : [...prev, restored]));
              } catch (e) {
                notify(`Couldn’t restore: ${errMsg(e)}`, 'error');
              }
            });
          },
          (e) => {
            setStored((prev) => (prev.some((r) => r.id === row.id) ? prev : [...prev, row]));
            notify(`Couldn’t delete: ${errMsg(e)}`, 'error');
          },
        );
      },

      exportList: async (list, format, label) => {
        try {
          await exportReceipts(list, format, label, { client: client.name, vatNumber: client.vatNumber });
        } catch (e) {
          console.error(e);
          notify('Export failed', 'error');
        }
      },
      notify,
    };
  }, [client, clients, reload, stored, receipts, categories, categoryList, categoryColor, userId, notify]);

  if (phase.kind !== 'ready' || !value) {
    return (
      <BootScreen
        phase={phase.kind === 'ready' ? { kind: 'loading' } : phase}
        onRetry={() => reload()}
        onCreateClient={(name) => createClient({ name, vatNumber: null, stagger: 0 })}
      />
    );
  }

  return (
    <Ctx.Provider value={value}>
      {/* Remount pages on client switch so per-page state (open months, filters, edits) resets. */}
      <Fragment key={value.client.id}>{children}</Fragment>
      {managingCategories && <ManageCategoriesModal onClose={() => setManagingCategories(false)} />}
      {settings && (
        <ClientSettingsModal
          client={settings === 'edit' ? value.client : null}
          onClose={() => setSettings(null)}
          onSave={async (c) => {
            try {
              if (settings === 'edit') {
                await updateClient(value.client.id, c);
                notify('Client updated');
              } else {
                await createClient(c);
                notify(`Created “${c.name}”`);
              }
              setSettings(null);
              return true;
            } catch (e) {
              notify(`Couldn’t save client: ${errMsg(e)}`, 'error');
              return false;
            }
          }}
        />
      )}
      {toast && (
        <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
          <span>{toast.msg}</span>
          {toast.undo && (
            <button type="button" className="link-btn" onClick={toast.undo}>
              Undo
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}
