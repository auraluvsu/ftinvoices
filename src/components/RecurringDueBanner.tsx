import { useState } from 'react';
import { useAppData } from '../appData';
import { formatMoney } from '../lib/format';
import { RecurringReviewModal } from './RecurringReviewModal';

const HIDE_KEY = 'ftinvoices.recurringBannerHidden';
const hiddenThisSession = () => {
  try {
    return sessionStorage.getItem(HIDE_KEY) === '1';
  } catch {
    return false;
  }
};

/** Offers due recurring expenses for review; nothing is added until the user says so. */
export function RecurringDueBanner() {
  const { dueRecurring } = useAppData();
  const [reviewing, setReviewing] = useState(false);
  const [hidden, setHidden] = useState(hiddenThisSession);
  const count = dueRecurring.reduce((n, d) => n + d.dates.length, 0);

  const hide = () => {
    setHidden(true);
    try {
      sessionStorage.setItem(HIDE_KEY, '1');
    } catch {
      /* non-essential */
    }
  };

  return (
    <>
      {count > 0 && !hidden && (
        <div className="recurring-banner" role="status">
          <span>
            <strong>
              {count} recurring expense{count === 1 ? ' is' : 's are'} due
            </strong>
            <span className="muted">
              {' '}
              ·{' '}
              {dueRecurring
                .slice(0, 3)
                .map((d) => `${d.expense.name} ${formatMoney(d.expense.total)}`)
                .join(', ')}
              {dueRecurring.length > 3 && ` and ${dueRecurring.length - 3} more`}
            </span>
          </span>
          <span className="recurring-banner-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={hide}>
              Not now
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setReviewing(true)}>
              Review
            </button>
          </span>
        </div>
      )}
      {reviewing && <RecurringReviewModal onClose={() => setReviewing(false)} />}
    </>
  );
}
