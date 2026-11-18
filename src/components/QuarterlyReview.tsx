import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { Income, Receipt } from '../types';
import { formatDate, formatMoney, formatMonthKey, todayIso } from '../lib/format';
import { sumTotals } from '../lib/receipts';
import { categoryBreakdown, emptyQuarter, groupByQuarter, quarterPeriod, quarterStart, STAGGER_OPTIONS, type QuarterGroup, type QuarterStagger } from '../lib/quarters';
import type { ExportFormat } from '../lib/export';
import { ExportMenu } from './ExportMenu';
import { LockIcon } from './LockIcon';
import { useAppData } from '../appData';
import { catVar } from '../lib/color';
import { moneyBoxText, poundsBoxText, vatReturnBoxes } from '../lib/vatReturn';

interface Props {
  receipts: Receipt[];
  stagger: QuarterStagger;
  onEditSettings: () => void;
  onExport: (receipts: Receipt[], format: ExportFormat, label: string) => void;
}

export function QuarterlyReview({ receipts, stagger, onEditSettings, onExport }: Props) {
  const { income } = useAppData();
  // Quarters with receipts, plus any that only have income, newest first.
  const quarters = useMemo(() => {
    const groups = groupByQuarter(receipts, stagger);
    const have = new Set(groups.map((g) => g.start));
    for (const i of income) {
      const start = quarterStart(i.date, stagger);
      if (!have.has(start)) {
        have.add(start);
        groups.push(emptyQuarter(start, stagger));
      }
    }
    return groups.sort((a, b) => b.start - a.start);
  }, [receipts, income, stagger]);

  return (
    <div className="quarters">
      <div className="quarter-settings">
        <span className="muted">
          VAT quarters end in <strong>{STAGGER_OPTIONS.find((o) => o.value === stagger)?.label}</strong>
        </span>
        <button type="button" className="link-btn" onClick={onEditSettings}>
          Change
        </button>
      </div>

      {quarters.map((q) => {
        // Compare with the quarter immediately before, if it has receipts.
        const prev = quarters.find((p) => p.start === q.start - 3);
        return <QuarterCard key={q.start} quarter={q} previous={prev} onExport={onExport} />;
      })}
    </div>
  );
}

/** Link to the printable report covering a quarter's three months. */
function reportLink(q: QuarterGroup): string {
  const { from, to } = quarterPeriod(q.start);
  return `/report?${new URLSearchParams({ from, to, title: `VAT quarter ${q.label}` })}`;
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
  const { categoryColor, income } = useAppData();
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
        <div className="quarter-actions">
          <Link className="btn btn-secondary btn-sm" to={reportLink(quarter)}>
            Report
          </Link>
          <ExportMenu small label="Export" onExport={(fmt) => onExport(quarter.receipts, fmt, fileLabel)} />
        </div>
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

      <VatReturnStrip receipts={quarter.receipts} income={quarterIncome(income, quarter)} showSales={income.length > 0} />
      <FilingStatus quarter={quarter} />

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
                  <span>
                    <span className="dot" style={catVar(categoryColor(c.category))} aria-hidden />
                    {c.category}
                  </span>
                  <span>
                    <strong>{formatMoney(c.total)}</strong>
                    <span className="muted"> · VAT {formatMoney(c.vat)}</span>
                  </span>
                </div>
                <div className="cat-bar" aria-hidden>
                  <span style={catVar(categoryColor(c.category), { width: `${t.total ? (c.total / t.total) * 100 : 0}%` })} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Income dated inside a quarter. */
function quarterIncome(income: Income[], q: QuarterGroup): Income[] {
  const { from, to } = quarterPeriod(q.start);
  return income.filter((i) => i.date >= from && i.date <= to);
}

const pounds = (n: number) => `£${n.toLocaleString('en-GB')}`;

/**
 * The VAT return's boxes, with copy buttons for pasting into HMRC software. Purchase boxes (4, 7)
 * always; sales boxes (1, 3, 5, 6) once the client has any income recorded.
 */
function VatReturnStrip({ receipts, income, showSales }: { receipts: Receipt[]; income: Income[]; showSales: boolean }) {
  const b = vatReturnBoxes(receipts, income);
  return (
    <div className="vat-return" aria-label="VAT return figures">
      {showSales && <VatBox box="Box 1" label="VAT due on sales" display={formatMoney(b.box1)} copyText={moneyBoxText(b.box1)} />}
      {showSales && <VatBox box="Box 3" label="Total VAT due (Box 1 + Box 2)" display={formatMoney(b.box3)} copyText={moneyBoxText(b.box3)} />}
      <VatBox box="Box 4" label="VAT reclaimed on purchases" display={formatMoney(b.box4)} copyText={moneyBoxText(b.box4)} />
      {showSales && (
        <VatBox
          box="Box 5"
          label={b.box5 >= 0 ? 'Net VAT to pay HMRC' : 'Net VAT HMRC owes you'}
          display={formatMoney(Math.abs(b.box5))}
          copyText={moneyBoxText(Math.abs(b.box5))}
        />
      )}
      {showSales && <VatBox box="Box 6" label="Sales excluding VAT (whole pounds)" display={pounds(b.box6)} copyText={poundsBoxText(b.box6)} />}
      <VatBox box="Box 7" label="Purchases excluding VAT (whole pounds)" display={pounds(b.box7)} copyText={poundsBoxText(b.box7)} />
      <p className="vat-return-note muted">
        {showSales
          ? 'Assumes all VAT on receipts can be reclaimed. Box 2, 8 and 9 (EU trade) are 0. Box 6 leaves out sales outside the scope of VAT.'
          : 'Assumes all VAT on these receipts can be reclaimed. Add income on the Income page to work out the sales boxes (1, 3, 5, 6).'}
      </p>
    </div>
  );
}

function VatBox({ box, label, display, copyText }: { box: string; label: string; display: string; copyText: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the figure is still on screen to copy by hand */
    }
  };
  return (
    <div className="vat-box">
      <span className="vat-box-num">{box}</span>
      <span className="vat-box-label">{label}</span>
      <strong>{display}</strong>
      <button type="button" className="btn btn-ghost btn-sm" onClick={copy} aria-label={`Copy ${box}: ${copyText}`}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/** "Mark as filed" for a finished quarter, or when and what was filed, with Unfile. */
function FilingStatus({ quarter }: { quarter: QuarterGroup }) {
  const { filedQuarters, fileQuarter, unfileQuarter, income } = useAppData();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const period = quarterPeriod(quarter.start);
  const filed = filedQuarters.find((f) => f.start === period.from);
  const sales = quarterIncome(income, quarter);
  const boxes = vatReturnBoxes(quarter.receipts, sales);
  const ended = period.to < todayIso();
  const plural = (k: number, word: string) => `${k} ${word}${k === 1 ? '' : 's'}`;
  const what = [plural(quarter.receipts.length, 'receipt'), sales.length > 0 && plural(sales.length, 'income record')].filter(Boolean).join(' and ');

  const run = async (action: () => Promise<boolean>) => {
    setBusy(true);
    const ok = await action();
    setBusy(false);
    if (ok) setConfirming(false);
  };

  if (filed) {
    const changed =
      filed.box4 !== boxes.box4 ||
      filed.box7 !== boxes.box7 ||
      (filed.box1 ?? 0) !== boxes.box1 ||
      (filed.box6 ?? 0) !== boxes.box6;
    const salesFiled = filed.box1 != null && (filed.box1 !== 0 || filed.box6 !== 0);
    return (
      <div className="filing filed">
        <p>
          <span className="lock" aria-hidden>
            <LockIcon />
          </span>
          <strong>Filed {formatDate(filed.filedAt.slice(0, 10))}</strong>
          <span className="muted">
            {' '}
            {salesFiled && ` · Box 1 ${formatMoney(filed.box1!)} · Box 6 ${pounds(filed.box6 ?? 0)}`} · Box 4 {formatMoney(filed.box4)} · Box 7{' '}
            {pounds(filed.box7)} · locked
          </span>
        </p>
        {changed && (
          <p className="filing-warn" role="note">
            The figures now differ from what was filed (Box 1 {formatMoney(boxes.box1)}, Box 4 {formatMoney(boxes.box4)}, Box 6 {pounds(boxes.box6)}, Box 7{' '}
            {pounds(boxes.box7)}).
          </p>
        )}
        {confirming ? (
          <div className="filing-confirm">
            <span>Unfile {quarter.label}? Its receipts and income can be edited again.</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => unfileQuarter(filed, quarter.label))}>
              Unfile
            </button>
          </div>
        ) : (
          <button type="button" className="link-btn" onClick={() => setConfirming(true)}>
            Unfile
          </button>
        )}
      </div>
    );
  }

  if (!ended) return null;
  return (
    <div className="filing">
      {confirming ? (
        <div className="filing-confirm">
          <span>
            Mark {quarter.label} as filed? Its {what} will be locked, and the VAT figures saved as they are now.
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => run(() => fileQuarter(period, boxes, quarter.label))}>
            Mark as filed
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirming(true)}>
          <LockIcon /> Mark as filed
        </button>
      )}
    </div>
  );
}
