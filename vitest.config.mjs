import { defineConfig } from 'vitest/config';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{js,mjs,ts}', 'scripts/**/*.test.{js,mjs,ts}'],
    exclude: ['node_modules/**', 'docs/**', 'data/**'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/**', 'docs/**', 'data/**', '**/*.config.*', 'tests/fixtures/**'],
    },
    projects: [
      {
        test: {
          name: 'node',
          include: ['tests/lib/**/*.test.{js,mjs}', 'tests/render/**/*.test.{js,mjs}'],
          environment: 'node',
        },
      },
      defineWorkersConfig({
        test: {
          name: 'worker',
          include: ['tests/worker/**/*.test.ts'],
          poolOptions: {
            workers: {
              wrangler: { configPath: './wrangler.toml' },
              miniflare: {
                d1Databases: { DB: 'test-db' },
              },
            },
          },
        },
      }),
    ],
  },
});
