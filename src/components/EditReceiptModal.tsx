import type { NewCategory, Receipt, ReceiptDraft } from '../types';
import { Modal } from './Modal';
import { ReceiptForm } from './ReceiptForm';

interface Props {
  receipt: Receipt;
  categories: string[];
  onSave: (draft: ReceiptDraft, newCategory?: NewCategory) => Promise<boolean>;
  onClose: () => void;
  onError: (msg: string) => void;
}

export function EditReceiptModal({ receipt, categories, onSave, onClose, onError }: Props) {
  return (
    <Modal label={`Edit ${receipt.name}`} onClose={onClose} closeOnBackdrop={false} className="modal-form">
      <ReceiptForm
        categories={categories}
        editing={receipt}
        onSave={onSave}
        onCancelEdit={onClose}
        onError={onError}
      />
    </Modal>
  );
}
