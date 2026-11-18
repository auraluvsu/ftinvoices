import { useEffect, useRef, useState } from 'react';
import { useAppData } from '../appData';
import { BackupModal } from './BackupModal';

/** Top-bar dropdown: which client's books are open, plus new client / settings. */
export function ClientSwitcher() {
  const { client, clients, switchClient, openClientSettings, openCategoryManager } = useAppData();
  const [open, setOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="menu client-switcher" ref={ref}>
      {/* Rendered through a portal, so it isn't inside the menu visually. */}
      {backupOpen && <BackupModal onClose={() => setBackupOpen(false)} />}
      <button
        type="button"
        className="client-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Client: ${client.name}. Switch client`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="client-name">{client.name}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="menu-list menu-left" role="menu">
          <div className="menu-label">Clients</div>
          {clients.map((c) => (
            <button key={c.id} type="button" role="menuitemradio" aria-checked={c.id === client.id} onClick={pick(() => switchClient(c.id))}>
              <span>{c.name}</span>
              {c.id === client.id && <small aria-hidden>✓</small>}
            </button>
          ))}
          <div className="menu-sep" />
          <button type="button" role="menuitem" onClick={pick(() => openClientSettings('new'))}>
            <span>＋ New client</span>
          </button>
          <button type="button" role="menuitem" onClick={pick(() => openClientSettings('edit'))}>
            <span>Client settings</span>
          </button>
          <button type="button" role="menuitem" onClick={pick(() => setBackupOpen(true))}>
            <span>Backup and restore…</span>
          </button>
          <button type="button" role="menuitem" onClick={pick(openCategoryManager)}>
            <span>Manage categories</span>
          </button>
        </div>
      )}
    </div>
  );
}
