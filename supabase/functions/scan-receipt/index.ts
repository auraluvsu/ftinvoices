// Supabase Edge Function: read a receipt photo with Claude and return the key fields.
//
// Deploy:   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//           supabase functions deploy scan-receipt
// supabase/config.toml turns off the gateway's legacy JWT check for this function
// (it can reject valid tokens with the newer signing keys); the handler checks the
// signed-in user itself with Supabase Auth instead.
// The request handling lives in handler.ts so it can be tested without Deno.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0';
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';
import { createHandler, type CreateMessage } from './handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// Supabase provides these to every function; the app's own publishable key also arrives
// in the `apikey` header, used as a fallback.
const SERVER_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');

Deno.serve(
  createHandler({
    authenticate: async (req) => {
      const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
      const key = SERVER_KEY ?? req.headers.get('apikey');
      if (!token || !key || !SUPABASE_URL) return false;
      const auth = createClient(SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } }).auth;
      const { data, error } = await auth.getUser(token);
      return !error && Boolean(data.user);
    },
    apiKey: () => Deno.env.get('ANTHROPIC_API_KEY'),
    createMessage: (apiKey) => {
      const client = new Anthropic({ apiKey });
      // The request is built in handler.ts with the SDK's beta params (output_config, fallbacks).
      return ((params) => client.beta.messages.create(params as never)) as CreateMessage;
    },
  }),
);
