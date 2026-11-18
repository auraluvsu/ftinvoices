import type { Toast } from '../appData';

export function ToastView({ toast }: { toast: Toast | null }) {
  if (!toast) return null;
  return (
    <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      <span>{toast.msg}</span>
      {toast.undo && (
        <button type="button" className="link-btn" onClick={toast.undo}>
          Undo
        </button>
      )}
    </div>
  );
}
