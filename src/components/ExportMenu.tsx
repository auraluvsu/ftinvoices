import { useEffect, useRef, useState } from 'react';
import type { ExportFormat } from '../lib/export';

interface Props {
  onExport: (format: ExportFormat) => void;
  disabled?: boolean;
  label?: string;
  small?: boolean;
}

const OPTIONS: { format: ExportFormat; label: string; hint: string }[] = [
  { format: 'xlsx', label: 'Spreadsheet', hint: '.xlsx' },
  { format: 'csv', label: 'CSV', hint: '.csv' },
  { format: 'json', label: 'JSON', hint: '.json · incl. images' },
  { format: 'zip', label: 'Photos', hint: '.zip · named by date & amount' },
];

export function ExportMenu({ onExport, disabled, label = 'Export', small }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className={`btn btn-secondary${small ? ' btn-sm' : ''}`}
        disabled={disabled}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
        </svg>
        <span className="btn-label">{label}</span>
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {OPTIONS.map((o) => (
            <button
              key={o.format}
              role="menuitem"
              type="button"
              onClick={() => {
                setOpen(false);
                onExport(o.format);
              }}
            >
              <span>{o.label}</span>
              <small>{o.hint}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
