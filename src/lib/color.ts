import type { CSSProperties } from 'react';

/** Colours for the built-in categories. */
export const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  Equipment: '#2f5bd3', // royal blue
  Fuel: '#e3120b', // bold red
  'Meals & entertainment': '#d1149a', // magenta
  'Office supplies': '#00b4d8', // cyan
  'Software & subscriptions': '#b8860b', // dark gold
  Travel: '#ffffff', // white
  Utilities: '#228b22', // forest green
  Other: '#ff8c00', // orange
};

/** Quick picks offered when creating a new category (alongside the colour wheel). */
export const SUGGESTED_COLORS = ['#7c4dff', '#00897b', '#ec407a', '#8d6e63', '#9ccc65', '#3949ab', '#607d8b', '#ffd54f'];

/** Neutral colour for aggregate rows such as "3 other categories". */
export const NEUTRAL_COLOR = 'var(--muted)';

/** Inline style that exposes a category colour to CSS as `--cat`. */
export const catVar = (color: string, extra?: CSSProperties) => ({ '--cat': color, ...extra }) as CSSProperties;

/** Stable colour for categories that were created before colours existed. */
export function fallbackColor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return hsvToHex({ h: h % 360, s: 0.6, v: 0.75 });
}

export interface Hsv {
  h: number; // 0–360
  s: number; // 0–1
  v: number; // 0–1
}

export const isHex = (s: string) => /^#?[0-9a-f]{6}$/i.test(s.trim());

export function normaliseHex(s: string): string {
  const t = s.trim().toLowerCase();
  return t.startsWith('#') ? t : `#${t}`;
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')}`;
}

export function hexToHsv(hex: string): Hsv {
  const n = parseInt(normaliseHex(hex).slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x) => x / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}
