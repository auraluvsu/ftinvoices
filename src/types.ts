import type { QuarterStagger } from './lib/quarters';
import type { VatRate } from './lib/vatRates';

export interface Receipt {
  id: string;
  clientId: string;
  categoryId: string;
  /** Category display name (joined from the categories table) */
  category: string;
  name: string;
  /** Gross total, including VAT */
  total: number;
  /** VAT amount */
  vat: number;
  /** How VAT applies (20%, 5%, zero-rated, …) */
  vatRate: VatRate;
  /** ISO date, YYYY-MM-DD */
  date: string;
  /** Path of the image in the private 'receipts' storage bucket */
  imagePath?: string;
  /** URL to display the image (short-lived signed URL, or a local data URL right after upload) */
  image?: string;
  createdAt: number;
  /** Server's updated_at, exactly as returned; used to detect edits made elsewhere. */
  updatedAt?: string;
}

/** What the receipt form hands to the store when saving. */
export interface ReceiptDraft {
  id: string;
  name: string;
  total: number;
  vat: number;
  vatRate: VatRate;
  category: string;
  date: string;
  /** Unchanged display URL, a new `data:` URL to upload, or undefined for no image */
  image?: string;
}

export interface Category {
  id: string;
  clientId: string;
  name: string;
  color: string;
}

export interface Client {
  id: string;
  name: string;
  vatNumber: string | null;
  stagger: QuarterStagger;
}

/** A VAT quarter marked as filed; receipts dated inside it are locked. */
export interface FiledQuarter {
  id: string;
  clientId: string;
  /** First and last day of the quarter, YYYY-MM-DD */
  start: string;
  end: string;
  /** ISO timestamp */
  filedAt: string;
  /** Box 4 and Box 7 as filed */
  box4: number;
  box7: number;
}

/** A category created while saving a receipt. */
export interface NewCategory {
  name: string;
  color: string;
}

export type SortField = 'date' | 'total' | 'vat' | 'name';
export type SortDir = 'asc' | 'desc';

export interface MonthFilters {
  minTotal: string;
  maxTotal: string;
  minVat: string;
  maxVat: string;
  dateFrom: string;
  dateTo: string;
  categories: string[];
  vatRates: VatRate[];
}

export const emptyFilters: MonthFilters = {
  minTotal: '',
  maxTotal: '',
  minVat: '',
  maxVat: '',
  dateFrom: '',
  dateTo: '',
  categories: [],
  vatRates: [],
};

export type Theme = 'system' | 'light' | 'dark';
