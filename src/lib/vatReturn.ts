import type { Receipt } from '../types';

/** The purchase-side boxes of a UK VAT return, worked out from a quarter's receipts. */
export interface VatReturnBoxes {
  /** Box 4: VAT reclaimed on purchases, in pounds and pence. */
  box4: number;
  /** Box 7: total value of purchases excluding VAT, in whole pounds (HMRC drops the pence). */
  box7: number;
}

export function vatReturnBoxes(receipts: Receipt[]): VatReturnBoxes {
  // Work in pence so float sums can't drift.
  let vatPence = 0;
  let netPence = 0;
  for (const r of receipts) {
    const total = Math.round(r.total * 100);
    const vat = Math.round(r.vat * 100);
    vatPence += vat;
    netPence += total - vat;
  }
  return { box4: vatPence / 100, box7: Math.floor(netPence / 100) };
}

/** Plain number as HMRC software expects it: "1234.50" for Box 4, "1234" for Box 7. */
export const box4Text = (n: number) => n.toFixed(2);
export const box7Text = (n: number) => String(n);
