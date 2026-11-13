import { useEffect, useRef, useState } from 'react';
import { compressImage, imageFromDataTransfer } from '../lib/image';

interface Props {
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
  onError: (msg: string) => void;
}

export function ImageInput({ value, onChange, onError }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  const accept = async (file: Blob | null) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await compressImage(file));
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not read that image');
    } finally {
      setBusy(false);
    }
  };

  // Paste an image from anywhere on the page while the form is shown.
  // When a popup is open, only the input inside that popup takes the paste.
  const acceptRef = useRef(accept);
  useEffect(() => {
    acceptRef.current = accept;
  });
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const modal = document.querySelector('[aria-modal="true"]');
      if (modal && !modal.contains(rootRef.current)) return;
      const file = imageFromDataTransfer(e.clipboardData);
      if (file) {
        e.preventDefault();
        void acceptRef.current(file);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  if (value) {
    return (
      <div className="image-preview" ref={rootRef}>
        <img src={value} alt="Receipt preview" />
        <div className="image-preview-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
            Replace
          </button>
          <button type="button" className="btn btn-ghost btn-sm danger" onClick={() => onChange(undefined)}>
            Remove
          </button>
        </div>
        <HiddenFileInput inputRef={fileRef} onFile={accept} />
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={`dropzone${dragging ? ' dragging' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => fileRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fileRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void accept(imageFromDataTransfer(e.dataTransfer));
      }}
    >
      {busy ? (
        <span>Processing…</span>
      ) : (
        <>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          <span>
            <strong>Click to upload</strong>, drag & drop,
            <br />
            or paste (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>V</kbd>)
          </span>
        </>
      )}
      <HiddenFileInput inputRef={fileRef} onFile={accept} />
    </div>
  );
}

function HiddenFileInput({
  inputRef,
  onFile,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFile: (f: File | null) => void;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      capture="environment"
      hidden
      onChange={(e) => {
        onFile(e.target.files?.[0] ?? null);
        e.target.value = '';
      }}
    />
  );
}
