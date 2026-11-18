/**
 * Whether to offer "Read receipt". It's hidden when VITE_SCAN_ENABLED is "false", or for the
 * rest of the browser session after the function turned out not to be deployed.
 */
const KEY = 'ftinvoices.scanUnavailable';

export function scanAvailable(): boolean {
  if (import.meta.env.VITE_SCAN_ENABLED === 'false') return false;
  try {
    return sessionStorage.getItem(KEY) !== '1';
  } catch {
    return true;
  }
}

export function markScanUnavailable(): void {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    /* storage blocked: the button just stays hidden until the form remounts */
  }
}
