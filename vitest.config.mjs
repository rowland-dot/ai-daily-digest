import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{js,mjs,ts}', 'scripts/**/*.test.{js,mjs,ts}'],
    exclude: ['node_modules/**', 'docs/**', 'data/**', 'audio-segments/**'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/**', 'docs/**', 'data/**', '**/*.config.*', 'tests/fixtures/**'],
    },
  },
});
