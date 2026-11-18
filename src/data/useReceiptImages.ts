import { useCallback, useEffect, useRef, useState } from 'react';
import * as db from '../lib/db';

const RESIGN_EVERY_MS = 6 * 60 * 60 * 1000; // well inside the 12h signed-URL lifetime
const IMAGE_DELETE_DELAY_MS = 8000; // keep the image until the Undo toast is gone

/**
 * Display URLs for receipt photos, plus delayed deletion of photos whose receipt was deleted
 * (so Undo can bring them back).
 */
export function useReceiptImages(accessToken: string) {
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map());
  /** Images of deleted receipts waiting out the Undo window: path → timer (one mutable Map for the provider's life). */
  const [pendingDeletes] = useState(() => new Map<string, ReturnType<typeof setTimeout>>());

  /** Replaces every link (after a full load). */
  const replaceUrls = useCallback((m: Map<string, string>) => setUrls(m), []);
  /** Adds or refreshes links. */
  const mergeUrls = useCallback((m: Map<string, string>) => setUrls((prev) => new Map([...prev, ...m])), []);
  /** Shows a just-uploaded image straight from memory; no need to sign it yet. */
  const showLocal = useCallback((path: string, dataUrl: string) => setUrls((prev) => new Map(prev).set(path, dataUrl)), []);

  /** Deletes an image after the Undo window, unless cancelImageDelete is called first. */
  const scheduleImageDelete = useCallback(
    (path: string) => {
      const timer = setTimeout(() => {
        pendingDeletes.delete(path);
        db.removeImages([path]).catch(console.error);
      }, IMAGE_DELETE_DELAY_MS);
      pendingDeletes.set(path, timer);
    },
    [pendingDeletes],
  );
  const cancelImageDelete = useCallback(
    (path: string) => {
      clearTimeout(pendingDeletes.get(path));
      pendingDeletes.delete(path);
    },
    [pendingDeletes],
  );
  const isPendingDelete = useCallback((path: string) => pendingDeletes.has(path), [pendingDeletes]);

  // If the page closes during an Undo window, delete those images now rather than never.
  useEffect(() => {
    const pending = pendingDeletes;
    const flush = () => {
      if (!pending.size) return;
      for (const t of pending.values()) clearTimeout(t);
      db.removeImagesOnExit([...pending.keys()]);
      pending.clear();
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [pendingDeletes]);

  // Keep the token handy for keepalive requests sent while the page closes.
  useEffect(() => db.setAccessToken(accessToken), [accessToken]);

  return { urls, replaceUrls, mergeUrls, showLocal, scheduleImageDelete, cancelImageDelete, isPendingDelete };
}

/**
 * Signed URLs expire; refresh them periodically while the app stays open.
 * Timers pause while the computer sleeps, so also check when the tab is shown or focused again.
 * `ready` turning true means every link has just been signed.
 */
export function useResignImages(paths: string[], ready: boolean, onSigned: (m: Map<string, string>) => void) {
  const pathsRef = useRef(paths);
  /** When image links were last signed (ms); used to spot links that may have expired. */
  const signedAtRef = useRef(0);
  useEffect(() => {
    pathsRef.current = paths;
  }, [paths]);

  useEffect(() => {
    if (!ready) return;
    signedAtRef.current = Date.now();
    const resign = () => {
      signedAtRef.current = Date.now();
      db.signImages(pathsRef.current).then(onSigned, console.error);
    };
    const resignIfStale = () => {
      if (document.visibilityState === 'visible' && Date.now() - signedAtRef.current >= RESIGN_EVERY_MS) resign();
    };
    const t = setInterval(resign, RESIGN_EVERY_MS);
    document.addEventListener('visibilitychange', resignIfStale);
    window.addEventListener('focus', resignIfStale);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', resignIfStale);
      window.removeEventListener('focus', resignIfStale);
    };
  }, [ready, onSigned]);
}
