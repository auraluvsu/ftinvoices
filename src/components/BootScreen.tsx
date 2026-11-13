import { useState } from 'react';
import { useAuth } from '../authContext';

type Phase = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'no-client' };

interface Props {
  phase: Phase;
  onRetry: () => void;
  onCreateClient: (name: string) => Promise<void>;
}

/** Full-page states shown before the books are ready: loading, load error, first client. */
export function BootScreen({ phase, onRetry, onCreateClient }: Props) {
  const { signOut, session } = useAuth();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (phase.kind === 'loading') {
    return (
      <main className="signin" aria-busy="true">
        <div className="spinner" role="status" aria-label="Loading your books" />
      </main>
    );
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Enter a name');
    setBusy(true);
    setError(null);
    try {
      await onCreateClient(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <main className="signin">
      <div className="card signin-card">
        {phase.kind === 'error' ? (
          <>
            <h1>Couldn’t load your books</h1>
            <p className="muted">{phase.message}</p>
            <button type="button" className="btn btn-primary" onClick={onRetry}>
              Try again
            </button>
          </>
        ) : (
          <form className="first-client" onSubmit={create} noValidate>
            <h1>Who are you bookkeeping for?</h1>
            <p className="muted">Each client gets their own receipts, categories and VAT quarters. You can add more later.</p>
            <label className={`field${error ? ' has-error' : ''}`}>
              <span className="field-label">Client name</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Smith Plumbing Ltd" autoFocus />
              {error && <span className="field-error">{error}</span>}
            </label>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
              {busy ? 'Creating…' : 'Create client'}
            </button>
          </form>
        )}
        <p className="muted signin-foot">
          Signed in as {session.user.email} ·{' '}
          <button type="button" className="link-btn" onClick={() => signOut()}>
            Sign out
          </button>
        </p>
      </div>
    </main>
  );
}
