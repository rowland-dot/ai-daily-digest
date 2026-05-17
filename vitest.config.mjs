import { defineConfig } from 'vitest/config';

// Note: @cloudflare/vitest-pool-workers requires its dist/ to be present.
// The installed 0.5.x package ships without a pre-built dist on some platforms.
// Worker route tests therefore run in the node environment, calling the handler
// directly without SELF.fetch / miniflare. This gives full behavioral coverage
// for all route logic; a real miniflare pool is wired in the cloudflare-migration
// spec when the worker is deployed.

export default defineConfig({
  test: {
    include: [
      'tests/lib/**/*.test.{js,mjs}',
      'tests/render/**/*.test.{js,mjs}',
      'tests/worker/**/*.test.{ts,mjs}',
    ],
    exclude: ['node_modules/**', 'docs/**', 'data/**', 'tests/e2e/**'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: [
        'node_modules/**',
        'docs/**',
        'data/**',
        '**/*.config.*',
        'tests/fixtures/**',
      ],
    },
  },
});
