// Supabase Edge Function: read a receipt photo with Claude and return the key fields.
//
// Deploy:   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//           supabase functions deploy scan-receipt
// JWT verification stays on (the default), so only signed-in users of this project can call it.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0';

const MODEL = 'claude-opus-5-5';
const MAX_IMAGE_BASE64 = 7_000_000; // ~5MB image; the app already compresses to ≤1600px JPEG

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const nullable = (type: 'string' | 'number') => ({ anyOf: [{ type }, { type: 'null' }] });

const SCHEMA = {
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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

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

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'Scanning is not configured (ANTHROPIC_API_KEY secret missing)' }, 500);
  const client = new Anthropic({ apiKey });

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // Low effort: a quick, cheap read is plenty for one receipt.
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
      // If a safety classifier declines, retry on Anthropic's recommended fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system:
        'You read UK receipts and invoices for bookkeeping. Extract exactly what is printed; do not guess amounts. ' +
        'If the VAT amount is not printed, return null for vat. If several totals appear, use the final amount paid.',
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
    });

    if (response.stop_reason === 'refusal') return json({ error: 'The receipt couldn’t be read' }, 422);
    if (response.stop_reason === 'max_tokens') return json({ error: 'The receipt couldn’t be read fully' }, 422);

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') return json({ error: 'No result' }, 502);
    const parsed = JSON.parse(text.text);

    // Only accept a category that really exists for this client.
    const category =
      typeof parsed.category === 'string'
        ? (cats.find((c) => c.toLowerCase() === parsed.category.toLowerCase()) ?? null)
        : null;
    const date = typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null);

    return json({
      name: typeof parsed.name === 'string' ? parsed.name.trim() || null : null,
      total: num(parsed.total),
      vat: num(parsed.vat),
      date,
      category,
    });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'Too many scans right now — try again shortly' }, 429);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'Scanning is misconfigured (bad API key)' }, 500);
    if (e instanceof Anthropic.APIError) return json({ error: `Scan failed (${e.status})` }, 502);
    console.error(e);
    return json({ error: 'Scan failed' }, 500);
  }
});
