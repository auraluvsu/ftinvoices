import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  label: string;
  onClose: () => void;
  /** Close when clicking the dimmed backdrop. Off for forms so edits aren't lost by a stray click. */
  closeOnBackdrop?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Modal({ label, onClose, closeOnBackdrop = true, className = '', children }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      // A field that handles Escape itself (e.g. to undo an edit) calls preventDefault.
      if (e.key === 'Escape' && !e.defaultPrevented) onCloseRef.current();
      else if (e.key === 'Tab') trapFocus(e, dialogRef.current);
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus the first field (or the dialog itself) on open.
    const first = dialogRef.current?.querySelector<HTMLElement>('input, select, textarea');
    (first ?? dialogRef.current)?.focus();

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => closeOnBackdrop && e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function trapFocus(e: KeyboardEvent, root: HTMLElement | null) {
  if (!root) return;
  const items = root.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]):not([hidden]), select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}
