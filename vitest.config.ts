import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // App code plus the Edge Function's Deno-free handler.
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
    environment: 'node',
  },
});
