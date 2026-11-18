import { useState } from 'react';
import { useAppData } from '../appData';
import { useAuth } from '../authContext';
import { buildBackup, downloadBackup, parseBackup, planRestore, restoreBackup, type Backup } from '../lib/backup';
import { formatDate } from '../lib/format';
import { Modal } from './Modal';

type Stage =
  | { kind: 'idle' }
  | { kind: 'ready'; backup: Backup; fileName: string }
  | { kind: 'restoring'; done: number; total: number };

/** Back up the open client to a file, or restore a backup file into a new or the open client. */
export function BackupModal({ onClose }: { onClose: () => void }) {
  const { client, categoryList, receipts, switchClient, reloadBooks, notify } = useAppData();
  const { session } = useAuth();
  const [backingUp, setBackingUp] = useState(false);
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<'new' | 'current'>('new');

  const backUp = async () => {
    setBackingUp(true);
    try {
      downloadBackup(await buildBackup(client, categoryList, receipts));
    } catch (e) {
      notify(`Backup failed: ${e instanceof Error ? e.message : String(e)}`, 'error');
    } finally {
      setBackingUp(false);
    }
  };

  const pickFile = async (file: File | undefined) => {
    setError(null);
    setStage({ kind: 'idle' });
    if (!file) return;
    try {
      const backup = parseBackup(JSON.parse(await file.text()));
      setStage({ kind: 'ready', backup, fileName: file.name });
      setTarget('new');
    } catch (e) {
      setError(e instanceof SyntaxError ? 'This file isn’t valid JSON' : e instanceof Error ? e.message : String(e));
    }
  };

  const ready = stage.kind === 'ready' ? stage : null;
  const plan = ready ? planRestore(ready.backup, target === 'current' ? receipts : []) : null;

  const restore = async () => {
    if (!ready || !plan) return;
    setStage({ kind: 'restoring', done: 0, total: plan.add.length });
    try {
      const id = await restoreBackup(ready.backup, plan, target === 'current' ? client.id : null, session.user.id, (done, total) =>
        setStage({ kind: 'restoring', done, total }),
      );
      notify(
        target === 'new'
          ? `Restored “${ready.backup.client.name}” with ${plan.add.length} receipts`
          : `Added ${plan.add.length} receipts to “${client.name}”${plan.skipped ? ` (${plan.skipped} already there)` : ''}`,
      );
      onClose();
      if (target === 'new') switchClient(id);
      else await reloadBooks();
    } catch (e) {
      // Anything restored so far stays; restoring the same file into that client again skips it.
      setStage(ready);
      setError(`Restore stopped: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const restoring = stage.kind === 'restoring';
  return (
    <Modal label="Backup and restore" onClose={restoring ? () => {} : onClose} closeOnBackdrop={false} className="modal-form">
      <div className="card form">
        <div className="card-head">
          <h2>Backup and restore</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close" disabled={restoring}>
            ✕
          </button>
        </div>

        <section className="backup-section">
          <h3>Back up {client.name}</h3>
          <div className="backup-actions">
            <span className="field-hint">
              One file with {receipts.length} receipt{receipts.length === 1 ? '' : 's'}, their photos, categories and settings.
            </span>
            <button type="button" className="btn btn-secondary" onClick={backUp} disabled={backingUp || restoring}>
              {backingUp ? 'Preparing…' : 'Download backup'}
            </button>
          </div>
        </section>

        <section className="backup-section">
          <h3>Restore from a backup</h3>
          <input
            type="file"
            accept="application/json,.json"
            aria-label="Backup file"
            disabled={restoring}
            onChange={(e) => void pickFile(e.target.files?.[0])}
          />
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}

          {ready && plan && (
            <>
              <p className="field-hint">
                <strong>{ready.backup.client.name}</strong>: {ready.backup.receipts.length} receipts (
                {ready.backup.receipts.filter((r) => r.image).length} with photos)
                {ready.backup.exportedAt && `, backed up ${formatDate(ready.backup.exportedAt.slice(0, 10))}`}.
              </p>
              <fieldset className="restore-target">
                <legend className="field-label">Restore into</legend>
                <label>
                  <input type="radio" name="target" checked={target === 'new'} onChange={() => setTarget('new')} />
                  A new client, “{ready.backup.client.name}”
                </label>
                <label>
                  <input type="radio" name="target" checked={target === 'current'} onChange={() => setTarget('current')} />
                  {client.name} (the open client)
                </label>
              </fieldset>
              <p className="field-hint" role="status">
                {plan.add.length} receipt{plan.add.length === 1 ? '' : 's'} will be added
                {plan.skipped > 0 && `; ${plan.skipped} already in ${client.name} will be skipped`}.
              </p>
            </>
          )}
        </section>

        <div className="form-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={restoring}>
            Close
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={restore}
            disabled={!ready || restoring || (target === 'current' && plan?.add.length === 0)}
          >
            {restoring ? `Restoring ${stage.done} of ${stage.total}…` : 'Restore'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
