import type { Income, Receipt } from '../types';

/** The boxes of a UK VAT return, worked out from a quarter's receipts and income. */
export interface VatReturnBoxes {
  /** Box 1: VAT due on sales, in pounds and pence. */
  box1: number;
  /** Box 3: total VAT due (Box 1 + Box 2; Box 2, EU acquisitions, is always 0 here). */
  box3: number;
  /** Box 4: VAT reclaimed on purchases, in pounds and pence. */
  box4: number;
  /** Box 5: Box 3 − Box 4. Positive means VAT to pay, negative a repayment due to you. */
  box5: number;
  /** Box 6: total value of sales excluding VAT, in whole pounds (outside-the-scope sales left out). */
  box6: number;
  /** Box 7: total value of purchases excluding VAT, in whole pounds (HMRC drops the pence). */
  box7: number;
}

export function vatReturnBoxes(receipts: Receipt[], income: Income[] = []): VatReturnBoxes {
  // Work in pence so float sums can't drift.
  let inputVat = 0;
  let purchases = 0;
  for (const r of receipts) {
    const total = Math.round(r.total * 100);
    const vat = Math.round(r.vat * 100);
    inputVat += vat;
    purchases += total - vat;
  }
  let outputVat = 0;
  let sales = 0;
  for (const i of income) {
    outputVat += Math.round(i.vat * 100);
    if (i.vatRate !== 'outside') sales += Math.round(i.net * 100);
  }
  return {
    box1: outputVat / 100,
    box3: outputVat / 100,
    box4: inputVat / 100,
    box5: (outputVat - inputVat) / 100,
    box6: Math.floor(sales / 100),
    box7: Math.floor(purchases / 100),
  };
}

/** Plain numbers as HMRC software expects them: "1234.50" for money boxes, "1234" for whole-pound boxes. */
export const moneyBoxText = (n: number) => n.toFixed(2);
export const poundsBoxText = (n: number) => String(n);
/** Kept for existing callers. */
export const box4Text = moneyBoxText;
export const box7Text = poundsBoxText;
