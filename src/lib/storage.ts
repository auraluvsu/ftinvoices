import { useCallback, useEffect, useRef, useState } from 'react';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * State backed by localStorage. `update` writes synchronously and returns
 * false if the write failed (e.g. quota exceeded from large receipt images),
 * in which case state is left unchanged so the UI never shows unsaved data.
 */
export function useLocalStorage<T>(
  key: string,
  initial: T,
): [T, (updater: (prev: T) => T) => { ok: true } | { ok: false; error: unknown }] {
  const [value, setValue] = useState<T>(() => read(key, initial));
  // Latest committed value, so `update` can write synchronously and report failure.
  const ref = useRef(value);

  // Keep multiple tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      ref.current = read(key, initial);
      setValue(ref.current);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, initial]);

  const update = useCallback(
    (updater: (prev: T) => T) => {
      const next = updater(ref.current);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch (error) {
        return { ok: false as const, error };
      }
      ref.current = next;
      setValue(next);
      return { ok: true as const };
    },
    [key],
  );

  return [value, update];
}

export function isQuotaError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}
