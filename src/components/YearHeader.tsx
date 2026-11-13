import type { Receipt } from '../types';
import { formatMoney } from '../lib/format';
import { sumTotals } from '../lib/receipts';

export function YearHeader({ year, receipts }: { year: string; receipts: Receipt[] }) {
  const t = sumTotals(receipts);
  return (
    <div className="year-head">
      <div className="year-title">
        <h2>{year}</h2>
        <span className="muted">
          {t.count} receipt{t.count === 1 ? '' : 's'}
        </span>
      </div>
      <dl className="year-totals">
        <div>
          <dt>Year total</dt>
          <dd>{formatMoney(t.total)}</dd>
        </div>
        <div>
          <dt>VAT</dt>
          <dd>{formatMoney(t.vat)}</dd>
        </div>
        <div className="hide-sm">
          <dt>Net</dt>
          <dd>{formatMoney(t.net)}</dd>
        </div>
      </dl>
    </div>
  );
}
