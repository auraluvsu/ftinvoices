import { useState } from 'react';
import type { Client } from '../types';
import { STAGGER_OPTIONS, type QuarterStagger } from '../lib/quarters';
import { Modal } from './Modal';

interface Props {
  /** The client to edit, or null to create a new one. */
  client: Client | null;
  onSave: (c: Omit<Client, 'id'>) => Promise<boolean>;
  onClose: () => void;
}

export function ClientSettingsModal({ client, onSave, onClose }: Props) {
  const [name, setName] = useState(client?.name ?? '');
  const [vatNumber, setVatNumber] = useState(client?.vatNumber ?? '');
  const [stagger, setStagger] = useState<QuarterStagger>(client?.stagger ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Required');
    setSaving(true);
    const ok = await onSave({ name: name.trim(), vatNumber: vatNumber.trim() || null, stagger });
    if (!ok) setSaving(false);
  };

  return (
    <Modal label={client ? 'Client settings' : 'New client'} onClose={onClose} closeOnBackdrop={false} className="modal-form">
      <form className="card form" onSubmit={submit} noValidate>
        <div className="card-head">
          <h2>{client ? 'Client settings' : 'New client'}</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <label className={`field${error ? ' has-error' : ''}`}>
          <span className="field-label">Client name</span>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="e.g. Smith Plumbing Ltd"
            autoFocus
          />
          {error && <span className="field-error">{error}</span>}
        </label>

        <label className="field">
          <span className="field-label">VAT number (optional)</span>
          <input type="text" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="e.g. GB123456789" />
        </label>

        <label className="field">
          <span className="field-label">VAT quarters end in</span>
          <select value={stagger} onChange={(e) => setStagger(Number(e.target.value) as QuarterStagger)}>
            {STAGGER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : client ? 'Save changes' : 'Create client'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
