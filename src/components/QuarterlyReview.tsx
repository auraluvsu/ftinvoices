import { useMemo } from 'react';
import type { Receipt } from '../types';
import { formatMoney, formatMonthKey } from '../lib/format';
import { sumTotals } from '../lib/receipts';
import { categoryBreakdown, groupByQuarter, STAGGER_OPTIONS, type QuarterGroup, type QuarterStagger } from '../lib/quarters';
import type { ExportFormat } from '../lib/export';
import { ExportMenu } from './ExportMenu';

interface Props {
  receipts: Receipt[];
  stagger: QuarterStagger;
  onStaggerChange: (s: QuarterStagger) => void;
  onExport: (receipts: Receipt[], format: ExportFormat, label: string) => void;
}

export function QuarterlyReview({ receipts, stagger, onStaggerChange, onExport }: Props) {
  const quarters = useMemo(() => groupByQuarter(receipts, stagger), [receipts, stagger]);

  return (
    <div className="quarters">
      <div className="quarter-settings">
        <label htmlFor="vat-stagger" className="inline-label">
          VAT quarters end in
        </label>
        <select
          id="vat-stagger"
          value={stagger}
          onChange={(e) => onStaggerChange(Number(e.target.value) as QuarterStagger)}
        >
          {STAGGER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {quarters.map((q) => {
        // Compare with the quarter immediately before, if it has receipts.
        const prev = quarters.find((p) => p.start === q.start - 3);
        return <QuarterCard key={q.start} quarter={q} previous={prev} onExport={onExport} />;
      })}
    </div>
  );
}

function QuarterCard({
  quarter,
  previous,
  onExport,
}: {
  quarter: QuarterGroup;
  previous?: QuarterGroup;
  onExport: Props['onExport'];
}) {
  const t = sumTotals(quarter.receipts);
  const cats = categoryBreakdown(quarter.receipts);
  const prevTotal = previous ? sumTotals(previous.receipts).total : null;
  const change = prevTotal ? ((t.total - prevTotal) / prevTotal) * 100 : null;
  const fileLabel = `vat-quarter-${quarter.months[0].key}-to-${quarter.months[2].key}`;

  return (
    <section className="card quarter">
      <header className="quarter-head">
        <div>
          <h3>{quarter.label}</h3>
          <span className="muted">
            {quarter.label !== quarter.range && `${quarter.range} · `}
            {t.count} receipt{t.count === 1 ? '' : 's'}
          </span>
        </div>
        <ExportMenu small label="Export" onExport={(fmt) => onExport(quarter.receipts, fmt, fileLabel)} />
      </header>

      <div className="quarter-stats">
        <div className="qstat">
          <span>Total spend</span>
          <strong>{formatMoney(t.total)}</strong>
          {change !== null && (
            <small className={change > 0 ? 'up' : change < 0 ? 'down' : ''}>
              {change > 0 ? '▲' : change < 0 ? '▼' : '■'} {Math.abs(change).toFixed(0)}% vs previous quarter
            </small>
          )}
        </div>
        <div className="qstat qstat-accent">
          <span>VAT paid</span>
          <strong>{formatMoney(t.vat)}</strong>
          <small>Input VAT for this return</small>
        </div>
        <div className="qstat">
          <span>Net (ex. VAT)</span>
          <strong>{formatMoney(t.net)}</strong>
        </div>
      </div>

      <div className="quarter-body">
        <div>
          <h4>By month</h4>
          <table className="qtable">
            <thead>
              <tr>
                <th>Month</th>
                <th>Receipts</th>
                <th>Total</th>
                <th>VAT</th>
              </tr>
            </thead>
            <tbody>
              {quarter.months.map((m) => {
                const mt = sumTotals(m.receipts);
                return (
                  <tr key={m.key} className={mt.count ? '' : 'muted'}>
                    <td>{formatMonthKey(m.key)}</td>
                    <td>{mt.count}</td>
                    <td>{formatMoney(mt.total)}</td>
                    <td>{formatMoney(mt.vat)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div>
          <h4>By category</h4>
          <ul className="cat-bars">
            {cats.map((c) => (
              <li key={c.category}>
                <div className="cat-bar-label">
                  <span>{c.category}</span>
                  <span>
                    <strong>{formatMoney(c.total)}</strong>
                    <span className="muted"> · VAT {formatMoney(c.vat)}</span>
                  </span>
                </div>
                <div className="cat-bar" aria-hidden>
                  <span style={{ width: `${t.total ? (c.total / t.total) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
