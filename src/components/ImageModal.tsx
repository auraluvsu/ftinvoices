import type { Receipt } from '../types';
import { formatDate, formatMoney } from '../lib/format';
import { Modal } from './Modal';

export function ImageModal({ receipt, onClose }: { receipt: Receipt; onClose: () => void }) {
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
          <a className="btn btn-ghost btn-sm" href={receipt.image} download={`${receipt.date}-${receipt.name}.jpg`}>
            Download
          </a>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
      </div>
      <img src={receipt.image} alt={`Receipt for ${receipt.name}`} />
    </Modal>
  );
}
