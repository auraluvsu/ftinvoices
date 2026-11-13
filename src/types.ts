import type { QuarterStagger } from './lib/quarters';

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
  /** ISO date, YYYY-MM-DD */
  date: string;
  /** Path of the image in the private 'receipts' storage bucket */
  imagePath?: string;
  /** URL to display the image (short-lived signed URL, or a local data URL right after upload) */
  image?: string;
  createdAt: number;
}

/** What the receipt form hands to the store when saving. */
export interface ReceiptDraft {
  id: string;
  name: string;
  total: number;
  vat: number;
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
}

export const emptyFilters: MonthFilters = {
  minTotal: '',
  maxTotal: '',
  minVat: '',
  maxVat: '',
  dateFrom: '',
  dateTo: '',
  categories: [],
};

export type Theme = 'system' | 'light' | 'dark';
