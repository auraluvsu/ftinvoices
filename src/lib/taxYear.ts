/** UK tax years run from 6 April to 5 April. A tax year is identified by the calendar year it starts in. */

/** Start year of the tax year containing an ISO date: 2026-04-05 → 2025, 2026-04-06 → 2026. */
export function taxYearOf(iso: string): number {
  const y = Number(iso.slice(0, 4));
  return iso.slice(5) >= '04-06' ? y : y - 1;
}

/** "2026/27" */
export const taxYearLabel = (start: number) => `${start}/${String((start + 1) % 100).padStart(2, '0')}`;

/** First and last day, as ISO dates. */
export const taxYearRange = (start: number) => ({ from: `${start}-04-06`, to: `${start + 1}-04-05` });

export const inTaxYear = (iso: string, start: number) => taxYearOf(iso) === start;
