import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useAppData } from '../appData';
import { formatDate, formatMoney, formatMonthKey, todayIso } from '../lib/format';
import { groupByMonth, sumTotals } from '../lib/receipts';
import { categoryBreakdown } from '../lib/quarters';
import { vatReturnBoxes } from '../lib/vatReturn';

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * A printable report for one period: /report?from=YYYY-MM-DD&to=YYYY-MM-DD&title=…
 * Print it, or choose "Save as PDF" in the print dialog.
 */
export function ReportPage() {
  const [params] = useSearchParams();
  const { client, receipts } = useAppData();
  const from = params.get('from');
  const to = params.get('to');
  const valid = isDate(from) && isDate(to) && from <= to;
  const title = params.get('title') || (valid ? `${formatDate(from)} – ${formatDate(to)}` : 'Report');

  const list = useMemo(
    () => (valid ? receipts.filter((r) => r.date >= from && r.date <= to).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt) : []),
    [receipts, from, to, valid],
  );
  const t = sumTotals(list);
  const boxes = vatReturnBoxes(list);
  const cats = categoryBreakdown(list);
  const months = groupByMonth(list).sort((a, b) => a.key.localeCompare(b.key));

  if (!valid) {
    return (
      <main className="report">
        <p>This report link is missing its dates.</p>
        <Link to="/receipts">Back to receipts</Link>
      </main>
    );
  }

  return (
    <main className="report">
      <div className="report-toolbar no-print">
        <Link to="/receipts" className="btn btn-ghost btn-sm">
          ← Back
        </Link>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
      </div>

      <header className="report-head">
        <div>
          <h1>{client.name}</h1>
          {client.vatNumber && <p>VAT number {client.vatNumber}</p>}
        </div>
        <div className="report-period">
          <h2>{title}</h2>
          <p>
            {formatDate(from)} – {formatDate(to)} · generated {formatDate(todayIso())}
          </p>
        </div>
      </header>

      <section className="report-summary">
        <div>
          <span>Receipts</span>
          <strong>{t.count}</strong>
        </div>
        <div>
          <span>Total spend</span>
          <strong>{formatMoney(t.total)}</strong>
        </div>
        <div>
          <span>VAT reclaimed (Box 4)</span>
          <strong>{formatMoney(boxes.box4)}</strong>
        </div>
        <div>
          <span>Purchases ex. VAT (Box 7)</span>
          <strong>£{boxes.box7.toLocaleString('en-GB')}</strong>
        </div>
      </section>

      <div className="report-cols">
        <section>
          <h3>By category</h3>
          <table className="report-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Total</th>
                <th>VAT</th>
              </tr>
            </thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.category}>
                  <td>{c.category}</td>
                  <td>{formatMoney(c.total)}</td>
                  <td>{formatMoney(c.vat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <h3>By month</h3>
          <table className="report-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Receipts</th>
                <th>Total</th>
                <th>VAT</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => {
                const mt = sumTotals(m.receipts);
                return (
                  <tr key={m.key}>
                    <td>{formatMonthKey(m.key)}</td>
                    <td>{mt.count}</td>
                    <td>{formatMoney(mt.total)}</td>
                    <td>{formatMoney(mt.vat)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>

      <section>
        <h3>Receipts</h3>
        {list.length === 0 ? (
          <p>No receipts in this period.</p>
        ) : (
          <table className="report-table report-receipts">
            <thead>
              <tr>
                <th>Date</th>
                <th>Supplier</th>
                <th>Category</th>
                <th>Total</th>
                <th>VAT</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.date)}</td>
                  <td>{r.name}</td>
                  <td>{r.category}</td>
                  <td>{formatMoney(r.total)}</td>
                  <td>{formatMoney(r.vat)}</td>
                  <td>{formatMoney(r.total - r.vat)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3}>Total</td>
                <td>{formatMoney(t.total)}</td>
                <td>{formatMoney(t.vat)}</td>
                <td>{formatMoney(t.net)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>
      <p className="report-note">Box figures assume all VAT on these receipts can be reclaimed.</p>
    </main>
  );
}
