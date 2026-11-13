import { useState } from 'react';
import { formatMoney, formatMoneyShort } from '../lib/format';
import { sumTotals } from '../lib/receipts';
import { axisLabel, type QuarterPoint, type QuarterStagger } from '../lib/quarters';

interface Props {
  quarters: QuarterPoint[]; // oldest first
  stagger: QuarterStagger;
}

/** Round up to a "nice" axis step (1, 2, 2.5, 5 × 10^n). */
function niceStep(raw: number): number {
  if (raw <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const f = raw / pow;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
}

/** Single-series bar chart of total spend per quarter, with hover/focus tooltips and a table view. */
export function QuarterChart({ quarters, stagger }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const rows = quarters.map((q) => ({ ...q, t: sumTotals(q.receipts), axis: axisLabel(q.start, stagger) }));
  const max = Math.max(...rows.map((r) => r.t.total), 0);
  const step = niceStep(max / 4 || 25);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const last = rows.length - 1;

  return (
    <section className="card chart-card">
      <header className="chart-head">
        <div>
          <h3>Spend per quarter</h3>
          <span className="muted">Total including VAT · last {rows.length} quarters</span>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowTable((s) => !s)} aria-pressed={showTable}>
          {showTable ? 'Chart' : 'Table'}
        </button>
      </header>

      {showTable ? (
        <table className="qtable chart-table">
          <thead>
            <tr>
              <th>Quarter</th>
              <th>Receipts</th>
              <th>Total</th>
              <th>VAT</th>
              <th>Net</th>
            </tr>
          </thead>
          <tbody>
            {[...rows].reverse().map((r) => (
              <tr key={r.start}>
                <td>{r.label === r.range ? r.range : `${r.label} (${r.range})`}</td>
                <td>{r.t.count}</td>
                <td>{formatMoney(r.t.total)}</td>
                <td>{formatMoney(r.t.vat)}</td>
                <td>{formatMoney(r.t.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="bar-chart" onMouseLeave={() => setActive(null)}>
          <div className="bar-chart-y" aria-hidden>
            {[...ticks].reverse().map((t) => (
              <span key={t}>{formatMoneyShort(t)}</span>
            ))}
          </div>
          <div className="bar-chart-plot">
            <div className="bar-chart-grid" aria-hidden>
              {ticks.map((t) => (
                <span key={t} style={{ bottom: `${(t / top) * 100}%` }} />
              ))}
            </div>
            <div className="bar-chart-bars">
              {rows.map((r, i) => {
                const h = (r.t.total / top) * 100;
                const isCurrent = i === last;
                return (
                  <button
                    key={r.start}
                    type="button"
                    className={`bar-col${active === i ? ' active' : ''}${isCurrent ? ' current' : ''}`}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    aria-label={`${r.label}: ${formatMoney(r.t.total)} total, ${formatMoney(r.t.vat)} VAT, ${r.t.count} receipts`}
                  >
                    {/* Direct label only on the current quarter; others via tooltip. */}
                    {isCurrent && r.t.total > 0 && active !== i && (
                      <span className="bar-label" style={{ bottom: `${h}%` }}>
                        {formatMoneyShort(r.t.total)}
                      </span>
                    )}
                    <span className="bar" style={{ height: `${h}%` }} />
                    {active === i && (
                      <span className={`chart-tip${i > rows.length / 2 ? ' left' : ''}`} style={{ bottom: `${Math.min(h, 80)}%` }} role="tooltip">
                        <strong>{r.label === r.range ? r.range : `${r.label} · ${r.range}`}</strong>
                        <span>
                          Total <b>{formatMoney(r.t.total)}</b>
                        </span>
                        <span>
                          VAT <b>{formatMoney(r.t.vat)}</b>
                        </span>
                        <span>
                          Net <b>{formatMoney(r.t.net)}</b>
                        </span>
                        <span className="muted">
                          {r.t.count} receipt{r.t.count === 1 ? '' : 's'}
                          {isCurrent ? ' · in progress' : ''}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="bar-chart-x" aria-hidden>
            {rows.map((r, i) => (
              <span key={r.start} className={i === last ? 'current' : ''}>
                {r.axis[0]}
                <small>{r.axis[1]}</small>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
