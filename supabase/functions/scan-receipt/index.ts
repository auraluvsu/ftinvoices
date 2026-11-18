// Supabase Edge Function: read a receipt photo with Claude and return the key fields.
//
// Deploy:   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//           supabase functions deploy scan-receipt
// JWT verification stays on (the default), so only signed-in users of this project can call it.
// The request handling lives in handler.ts so it can be tested without Deno.
import Anthropic from 'npm:@anthropic-ai/sdk@1.8.0';
import { createHandler, type CreateMessage } from './handler.ts';

Deno.serve(
  createHandler({
    apiKey: () => Deno.env.get('ANTHROPIC_API_KEY'),
    createMessage: (apiKey) => {
      const client = new Anthropic({ apiKey });
      // The request is built in handler.ts with the SDK's beta params (output_config, fallbacks).
      return ((params) => client.beta.messages.create(params as never)) as CreateMessage;
    },
  }),
);
