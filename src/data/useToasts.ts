import { useCallback, useState } from 'react';
import type { Toast } from '../appData';

/** One toast at a time; a toast with Undo stays up a little longer. */
export function useToasts() {
  const [toast, setToast] = useState<Toast | null>(null);

  const notify = useCallback((msg: string, kind: Toast['kind'] = 'info', undo?: () => void) => {
    const id = Date.now();
    setToast({ id, msg, kind, undo });
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), undo ? 6000 : 4000);
  }, []);

  const dismiss = useCallback(() => setToast(null), []);

  return { toast, notify, dismiss };
}
