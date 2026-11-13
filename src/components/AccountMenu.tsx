import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../authContext';

export function AccountMenu() {
  const { session, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const user = session.user;
  const email = user.email ?? 'Signed in';
  const avatar = user.user_metadata?.avatar_url as string | undefined;
  const name = (user.user_metadata?.full_name as string | undefined) ?? email;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button
        type="button"
        className="account-btn"
        aria-label={`Account: ${email}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={email}
        onClick={() => setOpen((o) => !o)}
      >
        {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : name.charAt(0).toUpperCase()}
      </button>
      {open && (
        <div className="menu-list" role="menu">
          <div className="account-email">{email}</div>
          <button type="button" role="menuitem" onClick={() => signOut()}>
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}
