import { useState } from 'react';
import type { Client } from '../types';
import { Modal } from './Modal';

interface Props {
  client: Client;
  receiptCount: number;
  photoCount: number;
  /** Downloads everything for this client first (JSON with photos). */
  onBackup: () => Promise<void>;
  onDelete: () => Promise<boolean>;
  onClose: () => void;
}

/** Permanently deletes a client after the user types its name. */
export function DeleteClientModal({ client, receiptCount, photoCount, onBackup, onDelete, onClose }: Props) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState<'backup' | 'delete' | null>(null);
  const matches = typed.trim().toLowerCase() === client.name.trim().toLowerCase();

  const backup = async () => {
    setBusy('backup');
    await onBackup();
    setBusy(null);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matches || busy) return;
    setBusy('delete');
    if (!(await onDelete())) setBusy(null);
  };

  return (
    <Modal label={`Delete ${client.name}`} onClose={onClose} closeOnBackdrop={false} className="modal-form">
      <form className="card form" onSubmit={submit} noValidate>
        <div className="card-head">
          <h2>Delete client</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="danger-note">
          This permanently deletes <strong>{client.name}</strong> with its {receiptCount} receipt
          {receiptCount === 1 ? '' : 's'}, {photoCount} photo{photoCount === 1 ? '' : 's'} and categories. It can’t be undone.
        </p>

        <div className="backup-row">
          <span className="field-hint">Keep a copy first: a JSON file with every receipt and photo.</span>
          <button type="button" className="btn btn-secondary" onClick={backup} disabled={busy !== null || !receiptCount}>
            {busy === 'backup' ? 'Preparing…' : 'Download backup'}
          </button>
        </div>

        <label className="field">
          <span className="field-label">
            Type <strong>{client.name}</strong> to confirm
          </span>
          <input type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoFocus />
        </label>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-danger" disabled={!matches || busy !== null}>
            {busy === 'delete' ? 'Deleting…' : 'Delete client'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
