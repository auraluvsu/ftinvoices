import { useState } from 'react';
import type { Receipt } from '../types';
import { formatDate, formatMoney } from '../lib/format';
import { Modal } from './Modal';

export function ImageModal({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  const [busy, setBusy] = useState(false);

  // The image is a cross-origin signed URL, where the `download` attribute is ignored,
  // so fetch it and save via a local object URL.
  const download = async () => {
    if (!receipt.image) return;
    setBusy(true);
    try {
      const blob = await (await fetch(receipt.image)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${receipt.date}-${receipt.name}.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal label={`Receipt image: ${receipt.name}`} onClose={onClose} className="modal-image">
      <div className="modal-head">
        <div>
          <strong>{receipt.name}</strong>
          <span className="muted">
            {' '}· {formatDate(receipt.date)} · {formatMoney(receipt.total)}
          </span>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={download} disabled={busy}>
            {busy ? 'Downloading…' : 'Download'}
          </button>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
      </div>
      <img src={receipt.image} alt={`Receipt for ${receipt.name}`} />
    </Modal>
  );
}
