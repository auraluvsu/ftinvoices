import { round2 } from './format';

/** How VAT applies to a purchase (stored in receipts.vat_rate). */
export type VatRate = 'standard' | 'reduced' | 'zero' | 'exempt' | 'outside';

export interface VatRateInfo {
  id: VatRate;
  /** Shown in the receipt form and filters. */
  label: string;
  /** Short form for tables and exports. */
  short: string;
  /** Fraction charged, e.g. 0.2; null where no VAT is ever charged. */
  rate: number | null;
}

export const VAT_RATES: readonly VatRateInfo[] = [
  { id: 'standard', label: 'Standard 20%', short: '20%', rate: 0.2 },
  { id: 'reduced', label: 'Reduced 5%', short: '5%', rate: 0.05 },
  { id: 'zero', label: 'Zero-rated 0%', short: '0%', rate: null },
  { id: 'exempt', label: 'Exempt', short: 'Exempt', rate: null },
  { id: 'outside', label: 'No VAT (supplier not VAT registered)', short: 'No VAT', rate: null },
];

export const DEFAULT_VAT_RATE: VatRate = 'standard';

const byId = new Map(VAT_RATES.map((r) => [r.id, r]));

export const isVatRate = (v: unknown): v is VatRate => typeof v === 'string' && byId.has(v as VatRate);

export const vatRateInfo = (id: VatRate): VatRateInfo => byId.get(id) ?? byId.get(DEFAULT_VAT_RATE)!;

/** True for rates where the VAT amount is always 0. */
export const hasNoVat = (id: VatRate) => vatRateInfo(id).rate === null;

/** VAT contained in a VAT-inclusive total: total × rate / (1 + rate), e.g. £60 at 20% → £10. */
export function vatFromGross(total: number, id: VatRate): number {
  const { rate } = vatRateInfo(id);
  return rate === null ? 0 : round2((total * rate) / (1 + rate));
}
