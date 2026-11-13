export interface Receipt {
  id: string;
  name: string;
  /** Gross total, including VAT */
  total: number;
  /** VAT amount */
  vat: number;
  category: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  /** Compressed JPEG data URL, if a receipt image was attached */
  image?: string;
  createdAt: number;
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
