import { useEffect } from 'react';
import type { Receipt } from '../types';
import { formatDate, formatMoney } from '../lib/format';

export function ImageModal({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={`Receipt image: ${receipt.name}`}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <strong>{receipt.name}</strong>
            <span className="muted">
              {' '}· {formatDate(receipt.date)} · {formatMoney(receipt.total)}
            </span>
          </div>
          <div className="modal-actions">
            <a className="btn btn-ghost btn-sm" href={receipt.image} download={`${receipt.date}-${receipt.name}.jpg`}>
              Download
            </a>
            <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close" autoFocus>
              ✕
            </button>
          </div>
        </div>
        <img src={receipt.image} alt={`Receipt for ${receipt.name}`} />
      </div>
    </div>
  );
}
