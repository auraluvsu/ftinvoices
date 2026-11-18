import type { Receipt } from '../types';

/** How far apart two receipts' dates can be and still look like the same purchase. */
export const DUPLICATE_DAYS = 3;

const dayNumber = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 86_400_000;

/**
 * Finds an existing receipt that looks like the same purchase: same supplier (ignoring case and
 * spacing), same total to the penny, and a date within DUPLICATE_DAYS. The receipt being edited is ignored.
 */
export function findDuplicate(
  receipts: Receipt[],
  candidate: { id: string; name: string; total: number; date: string },
): Receipt | undefined {
  const name = candidate.name.trim().toLowerCase().replace(/\s+/g, ' ');
  const pence = Math.round(candidate.total * 100);
  const day = dayNumber(candidate.date);
  return receipts.find(
    (r) =>
      r.id !== candidate.id &&
      Math.round(r.total * 100) === pence &&
      r.name.trim().toLowerCase().replace(/\s+/g, ' ') === name &&
      Math.abs(dayNumber(r.date) - day) <= DUPLICATE_DAYS,
  );
}
