import { describe, expect, it, vi } from 'vitest';
import { createHandler, MAX_IMAGE_BASE64, MODEL, type CreateMessage, type ScanResponse } from './handler.ts';

const CATS = ['Fuel', 'Meals & entertainment', 'Other'];

const reply = (body: unknown, stop_reason = 'end_turn'): ScanResponse => ({
  stop_reason,
  content: [{ type: 'text', text: typeof body === 'string' ? body : JSON.stringify(body) }],
});

function setup(opts: { apiKey?: string | undefined; send?: CreateMessage } = {}) {
  const send = vi.fn<CreateMessage>(opts.send ?? (async () => reply({ name: 'Shell', total: 60, vat: 10, date: '2026-11-02', category: 'Fuel' })));
  const log = vi.fn();
  const handler = createHandler({
    apiKey: () => ('apiKey' in opts ? opts.apiKey : 'sk-ant-test'),
    createMessage: () => send,
    log,
  });
  return { handler, send, log };
}

const post = (body: unknown) =>
  new Request('https://x.supabase.co/functions/v1/scan-receipt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const call = async (handler: (r: Request) => Promise<Response>, req: Request) => {
  const res = await handler(req);
  return { status: res.status, body: res.headers.get('Content-Type')?.includes('json') ? await res.json() : await res.text(), res };
};

const valid = { image: 'data:image/jpeg;base64,AAAA', categories: CATS };

describe('scan-receipt handler: requests', () => {
  it('answers CORS preflight', async () => {
    const { handler } = setup();
    const { status, res } = await call(handler, new Request('https://x/', { method: 'OPTIONS' }));
    expect(status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('rejects methods other than POST', async () => {
    const { handler } = setup();
    expect((await call(handler, new Request('https://x/', { method: 'GET' }))).status).toBe(405);
  });

  it('rejects a body that is not JSON', async () => {
    const { handler, send } = setup();
    const { status, body } = await call(handler, post('not json'));
    expect(status).toBe(400);
    expect(body.error).toBe('Invalid JSON body');
    expect(send).not.toHaveBeenCalled();
  });

  it.each([{}, { image: '' }, { image: 42 }])('rejects a missing image (%j)', async (b) => {
    const { handler } = setup();
    const { status, body } = await call(handler, post(b));
    expect(status).toBe(400);
    expect(body.error).toBe('Missing image');
  });

  it('rejects an image that is too large', async () => {
    const { handler, send } = setup();
    const { status } = await call(handler, post({ image: 'A'.repeat(MAX_IMAGE_BASE64 + 1) }));
    expect(status).toBe(413);
    expect(send).not.toHaveBeenCalled();
  });

  it('explains when the API key secret is missing', async () => {
    const { handler, send } = setup({ apiKey: undefined });
    const { status, body } = await call(handler, post(valid));
    expect(status).toBe(500);
    expect(body.error).toMatch(/ANTHROPIC_API_KEY/);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('scan-receipt handler: request to Claude', () => {
  it('strips the data URL prefix and sends the image, model and categories', async () => {
    const { handler, send } = setup();
    await call(handler, post(valid));
    const params = send.mock.calls[0][0] as {
      model: string;
      output_config: { effort: string };
      fallbacks: string;
      messages: { content: ({ source?: { data: string; media_type: string } } & { text?: string })[] }[];
    };
    expect(params.model).toBe(MODEL);
    expect(params.output_config.effort).toBe('low');
    expect(params.fallbacks).toBe('default');
    const [img, text] = params.messages[0].content;
    expect(img.source).toEqual(expect.objectContaining({ data: 'AAAA', media_type: 'image/jpeg' }));
    expect(text.text).toContain('Fuel | Meals & entertainment | Other');
  });

  it('ignores non-string categories and says (none) when there are none', async () => {
    const { handler, send } = setup();
    await call(handler, post({ image: 'AAAA', categories: [1, null, { a: 1 }] }));
    const params = send.mock.calls[0][0] as { messages: { content: { text?: string }[] }[] };
    expect(params.messages[0].content[1].text).toContain('(none)');
  });
});

describe('scan-receipt handler: results', () => {
  it('returns the extracted fields', async () => {
    const { handler } = setup();
    const { status, body } = await call(handler, post(valid));
    expect(status).toBe(200);
    expect(body).toEqual({ name: 'Shell', total: 60, vat: 10, date: '2026-11-02', category: 'Fuel' });
  });

  it('matches a category ignoring case and returns the client’s spelling', async () => {
    const { handler } = setup({ send: async () => reply({ name: 'x', total: 1, vat: null, date: null, category: 'meals & ENTERTAINMENT' }) });
    expect((await call(handler, post(valid))).body.category).toBe('Meals & entertainment');
  });

  it('drops a category the client does not have', async () => {
    const { handler } = setup({ send: async () => reply({ name: 'x', total: 1, vat: null, date: null, category: 'Groceries' }) });
    expect((await call(handler, post(valid))).body.category).toBeNull();
  });

  it.each(['02/11/2026', '2026-11-2', 'yesterday'])('drops a badly formatted date (%s)', async (date) => {
    const { handler } = setup({ send: async () => reply({ name: 'x', total: 1, vat: null, date, category: null }) });
    expect((await call(handler, post(valid))).body.date).toBeNull();
  });

  it('rounds amounts to pence and drops negative or non-numeric ones', async () => {
    const { handler } = setup({ send: async () => reply({ name: '  Tesco  ', total: 12.345, vat: -1, date: null, category: null }) });
    const { body } = await call(handler, post(valid));
    expect(body).toMatchObject({ name: 'Tesco', total: 12.35, vat: null });
  });

  it('turns a blank name into null', async () => {
    const { handler } = setup({ send: async () => reply({ name: '   ', total: '5', vat: null, date: null, category: null }) });
    expect((await call(handler, post(valid))).body).toMatchObject({ name: null, total: null });
  });

  it.each([
    ['refusal', 'The receipt couldn’t be read'],
    ['max_tokens', 'The receipt couldn’t be read fully'],
  ])('reports stop_reason %s as 422', async (stop, message) => {
    const { handler } = setup({ send: async () => reply('{}', stop) });
    const { status, body } = await call(handler, post(valid));
    expect(status).toBe(422);
    expect(body.error).toBe(message);
  });

  it('returns 502 when there is no text block', async () => {
    const { handler } = setup({ send: async () => ({ stop_reason: 'end_turn', content: [{ type: 'thinking' }] }) });
    expect((await call(handler, post(valid))).status).toBe(502);
  });

  it('returns 502 when the text is not JSON', async () => {
    const { handler } = setup({ send: async () => reply('Sorry, I cannot help') });
    expect((await call(handler, post(valid))).status).toBe(502);
  });
});

describe('scan-receipt handler: API errors', () => {
  const failWith = (e: unknown) => setup({ send: async () => Promise.reject(e) });

  it('maps a rate limit to 429', async () => {
    const { handler } = failWith(Object.assign(new Error('rate'), { status: 429 }));
    const { status, body } = await call(handler, post(valid));
    expect(status).toBe(429);
    expect(body.error).toMatch(/Too many scans/);
  });

  it('maps a bad API key to a configuration error', async () => {
    const { handler } = failWith(Object.assign(new Error('auth'), { status: 401 }));
    const { status, body } = await call(handler, post(valid));
    expect(status).toBe(500);
    expect(body.error).toMatch(/bad API key/);
  });

  it('passes other API statuses through in the message', async () => {
    const { handler } = failWith(Object.assign(new Error('overloaded'), { status: 529 }));
    const { status, body } = await call(handler, post(valid));
    expect(status).toBe(502);
    expect(body.error).toBe('Scan failed (529)');
  });

  it('logs and hides unexpected errors', async () => {
    const err = new TypeError('network down');
    const { handler, log } = failWith(err);
    const { status, body } = await call(handler, post(valid));
    expect(status).toBe(500);
    expect(body.error).toBe('Scan failed');
    expect(log).toHaveBeenCalledWith(err);
  });
});
