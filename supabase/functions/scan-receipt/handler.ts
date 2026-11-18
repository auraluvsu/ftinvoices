// Request handling for the scan-receipt Edge Function, kept free of Deno and SDK imports
// so it can be unit-tested in Node with a fake Claude client.

export const MODEL = 'claude-opus-5-5';
export const MAX_IMAGE_BASE64 = 7_000_000; // ~5MB image; the app already compresses to ≤1600px JPEG

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const nullable = (type: 'string' | 'number') => ({ anyOf: [{ type }, { type: 'null' }] });

export const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'total', 'vat', 'date', 'category'],
  properties: {
    name: { ...nullable('string'), description: 'Supplier / shop name as a person would write it, e.g. "Tesco", "Shell", "Trainline".' },
    total: { ...nullable('number'), description: 'Total amount paid in GBP including VAT.' },
    vat: { ...nullable('number'), description: 'VAT amount in GBP shown on the receipt; null if no VAT is shown.' },
    date: { ...nullable('string'), description: 'Transaction date as YYYY-MM-DD.' },
    category: { ...nullable('string'), description: 'Best matching category from the provided list, exactly as written there; null if none fits.' },
  },
};

export const SYSTEM_PROMPT =
  'You read UK receipts and invoices for bookkeeping. Extract exactly what is printed; do not guess amounts. ' +
  'If the VAT amount is not printed, return null for vat. If several totals appear, use the final amount paid.';

/** The slice of the Anthropic SDK response the handler reads. */
export interface ScanResponse {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
}

/** Sends one request to Claude. In production this wraps `client.beta.messages.create`. */
export type CreateMessage = (params: Record<string, unknown>) => Promise<ScanResponse>;

export interface Deps {
  /**
   * Checks the request's `Authorization: Bearer <token>` header and resolves true for a
   * signed-in user. Done here rather than by the gateway's legacy JWT check, which can
   * reject valid tokens on projects using the newer signing keys.
   */
  authenticate: (req: Request) => Promise<boolean>;
  /** The Anthropic API key, or undefined if the secret isn't set. */
  apiKey: () => string | undefined;
  /** Builds a message sender for the given key. */
  createMessage: (apiKey: string) => CreateMessage;
  log?: (e: unknown) => void;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export function buildRequest(data: string, cats: string[]): Record<string, unknown> {
  return {
    model: MODEL,
    max_tokens: 4000,
    // Low effort: a quick, cheap read is plenty for one receipt.
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    // If a safety classifier declines, retry on Anthropic's recommended fallback model.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
          {
            type: 'text',
            text: `Categories to choose from: ${cats.length ? cats.join(' | ') : '(none)'}\nExtract the receipt fields.`,
          },
        ],
      },
    ],
  };
}

/** Cleans the model's JSON: keeps only a known category, a valid date and non-negative amounts in pence. */
export function sanitise(parsed: Record<string, unknown>, cats: string[]) {
  const category =
    typeof parsed.category === 'string'
      ? (cats.find((c) => c.toLowerCase() === (parsed.category as string).toLowerCase()) ?? null)
      : null;
  const date = typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null);
  return {
    name: typeof parsed.name === 'string' ? parsed.name.trim() || null : null,
    total: num(parsed.total),
    vat: num(parsed.vat),
    date,
    category,
  };
}

/** Maps an SDK error (which carries an HTTP `status`) to a friendly response. */
function errorResponse(e: unknown): Response {
  const status = typeof (e as { status?: unknown })?.status === 'number' ? (e as { status: number }).status : null;
  if (status === 429) return json({ error: 'Too many scans right now — try again shortly' }, 429);
  if (status === 401) return json({ error: 'Scanning is misconfigured (bad API key)' }, 500);
  if (status != null) return json({ error: `Scan failed (${status})` }, 502);
  return json({ error: 'Scan failed' }, 500);
}

export function createHandler(deps: Deps) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

    let signedIn = false;
    try {
      signedIn = await deps.authenticate(req);
    } catch (e) {
      (deps.log ?? console.error)(e);
    }
    if (!signedIn) return json({ error: 'Sign in to scan receipts' }, 401);

    let image: unknown, categories: unknown;
    try {
      ({ image, categories } = await req.json());
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    if (typeof image !== 'string' || !image) return json({ error: 'Missing image' }, 400);
    const data = image.replace(/^data:image\/\w+;base64,/, '');
    if (data.length > MAX_IMAGE_BASE64) return json({ error: 'Image too large' }, 413);
    const cats = Array.isArray(categories) ? categories.filter((c): c is string => typeof c === 'string').slice(0, 100) : [];

    const apiKey = deps.apiKey();
    if (!apiKey) return json({ error: 'Scanning is not configured (ANTHROPIC_API_KEY secret missing)' }, 500);

    try {
      const response = await deps.createMessage(apiKey)(buildRequest(data, cats));

      if (response.stop_reason === 'refusal') return json({ error: 'The receipt couldn’t be read' }, 422);
      if (response.stop_reason === 'max_tokens') return json({ error: 'The receipt couldn’t be read fully' }, 422);

      const text = response.content.find((b) => b.type === 'text');
      if (!text || typeof text.text !== 'string') return json({ error: 'No result' }, 502);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text.text);
      } catch {
        return json({ error: 'No result' }, 502);
      }
      if (!parsed || typeof parsed !== 'object') return json({ error: 'No result' }, 502);
      return json(sanitise(parsed as Record<string, unknown>, cats));
    } catch (e) {
      (deps.log ?? console.error)(e);
      return errorResponse(e);
    }
  };
}
