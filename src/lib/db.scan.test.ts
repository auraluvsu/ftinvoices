import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('./supabase', () => ({ supabase: { functions: { invoke } } }));

const { scanReceipt } = await import('./db');

const result = { name: 'Shell', total: 60, vat: 10, date: '2026-11-02', category: 'Fuel' };

describe('scanReceipt', () => {
  beforeEach(() => invoke.mockReset());

  it('calls the scan-receipt function with the image and categories', async () => {
    invoke.mockResolvedValue({ data: result, error: null });
    await expect(scanReceipt('data:image/jpeg;base64,AAAA', ['Fuel'])).resolves.toEqual(result);
    expect(invoke).toHaveBeenCalledWith('scan-receipt', { body: { image: 'data:image/jpeg;base64,AAAA', categories: ['Fuel'] } });
  });

  it('throws the friendly message from the function’s error body', async () => {
    const context = new Response(JSON.stringify({ error: 'Too many scans right now — try again shortly' }), { status: 429 });
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context }) });
    await expect(scanReceipt('AAAA', [])).rejects.toThrow('Too many scans right now — try again shortly');
  });

  it('falls back to the generic message when the body isn’t JSON', async () => {
    const context = new Response('<html>Bad gateway</html>', { status: 502 });
    invoke.mockResolvedValue({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context }) });
    await expect(scanReceipt('AAAA', [])).rejects.toThrow('Edge Function returned a non-2xx status code');
  });

  it('falls back to the generic message when there is no response (network error)', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Failed to send a request to the Edge Function') });
    await expect(scanReceipt('AAAA', [])).rejects.toThrow('Failed to send a request to the Edge Function');
  });
});
