import { defineConfig } from 'vitest/config';

// Unit tests for pure logic shared by apps and edge functions. App component
// tests live with each app; database tests run via scripts/test-db.sh.
export default defineConfig({
  test: {
    include: ['packages/*/src/**/*.test.ts', 'supabase/functions/_shared/**/*.test.ts', 'apps/mobile/src/**/*.test.ts'],
    environment: 'node',
  },
});
