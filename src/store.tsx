import { Fragment, useCallback, useMemo, useState } from 'react';
import type { Client, Receipt } from './types';
import { AppDataContext as Ctx, type AppData } from './appData';
import { useAuth } from './authContext';
import { exportReceipts } from './lib/export';
import { fallbackColor } from './lib/color';
import * as db from './lib/db';
import { BootScreen } from './components/BootScreen';
import { ClientSettingsModal } from './components/ClientSettingsModal';
import { DeleteClientModal } from './components/DeleteClientModal';
import { ManageCategoriesModal } from './components/ManageCategoriesModal';
import { ToastView } from './components/ToastView';
import { useToasts } from './data/useToasts';
import { useBooks } from './data/useBooks';
import { categoryActions } from './data/categoryActions';
import { receiptActions } from './data/receiptActions';
import { filedActions } from './data/filedActions';
import { filedQuarterFor } from './lib/filedQuarters';
import { useReceiptImages, useResignImages } from './data/useReceiptImages';

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Owns all data for the signed-in user (loaded from Supabase) and app-wide toasts. */
export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session.user.id;

  const [settings, setSettings] = useState<'edit' | 'new' | 'delete' | null>(null);
  const [managingCategories, setManagingCategories] = useState(false);
  const { urls, replaceUrls, mergeUrls, showLocal, scheduleImageDelete, cancelImageDelete, isPendingDelete } =
    useReceiptImages(session.access_token);
  const { toast, notify, dismiss: dismissToast } = useToasts();
  const { phase, clients, setClients, client, categoryList, setCategoryList, stored, setStored, filed, setFiled, reload } =
    useBooks(replaceUrls);
  const lockedBy = useCallback((date: string) => filedQuarterFor(date, filed), [filed]);

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
    [setClients],
  );

  const imagePaths = useMemo(() => stored.flatMap((r) => (r.imagePath ? [r.imagePath] : [])), [stored]);
  useResignImages(imagePaths, phase.kind === 'ready', mergeUrls);

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
      reloadBooks: () => reload(client.id),
      openClientSettings: (mode = 'edit') => setSettings(mode),
      receipts,
      categories,
      categoryList,
      categoryColor,
      openCategoryManager: () => setManagingCategories(true),
      ...categoryActions({ clientId: client.id, categoryList, setCategoryList, setStored, notify }),
      stagger: client.stagger,

      ...receiptActions({
        userId,
        clientId: client.id,
        categoryList,
        setCategoryList,
        stored,
        setStored,
        reloadSilently: () => void reload(client.id, { silent: true }),
        notify,
        dismissToast,
        showLocal,
        scheduleImageDelete,
        cancelImageDelete,
        lockedBy,
      }),
      filedQuarters: filed,
      lockedBy,
      ...filedActions({ clientId: client.id, setFiled, notify }),

      exportList: async (list, format, label) => {
        try {
          await exportReceipts(list, format, label, { client: client.name, vatNumber: client.vatNumber });
        } catch (e) {
          console.error(e);
          notify(`Export failed: ${errMsg(e)}`, 'error');
        }
      },
      notify,
    };
  }, [client, clients, reload, stored, receipts, categories, categoryList, categoryColor, userId, notify, dismissToast, setStored, setCategoryList, scheduleImageDelete, cancelImageDelete, showLocal, filed, setFiled, lockedBy]);

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
      {(settings === 'edit' || settings === 'new') && (
        <ClientSettingsModal
          client={settings === 'edit' ? value.client : null}
          onClose={() => setSettings(null)}
          onFindUnusedImages={async () => {
            const used = new Set(stored.flatMap((r) => (r.imagePath ? [r.imagePath] : [])));
            const all = await db.listImages(`${userId}/${value.client.id}`);
            // Images waiting out an Undo window aren't "unused" yet.
            return all.filter((p) => !used.has(p) && !isPendingDelete(p));
          }}
          onRemoveImages={(paths) => db.removeImages(paths)}
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
      {settings === 'delete' && (
        <DeleteClientModal
          client={value.client}
          receiptCount={stored.length}
          photoCount={stored.filter((r) => r.imagePath).length}
          onClose={() => setSettings(null)}
          onBackup={() => value.exportList(value.receipts, 'json', 'backup')}
          onDelete={async () => {
            const name = value.client.name;
            try {
              await db.deleteClient(userId, value.client.id);
              setSettings(null);
              notify(`Deleted “${name}”`);
              await reload();
              return true;
            } catch (e) {
              notify(`Couldn’t delete client: ${errMsg(e)}`, 'error');
              return false;
            }
          }}
        />
      )}
      <ToastView toast={toast} />
    </Ctx.Provider>
  );
}
