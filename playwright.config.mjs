// playwright.config.mjs
//
// E2E test configuration for the AI Daily Digest static site.
//
// The demo preview server (`npm run preview:demo`) renders the full site with
// injected sample editorial data and BACKEND_LIVE=true, then serves docs/ on
// port 8000. Playwright starts it automatically before running tests.
//
// Browser: Chromium only for this slice. Firefox/WebKit can be added in a
// follow-up once the harness is proven stable.
//
// Test split:
//   - GH-Pages-live tests (real assertions against preview:demo) live in:
//       tests/e2e/anonymous.spec.ts
//       tests/e2e/favourites.spec.ts
//       tests/e2e/editors-cut.spec.ts
//       tests/e2e/translation-page.spec.ts
//       tests/e2e/feed-and-seo.spec.ts
//   - Cloudflare-live deferred stubs (all .todo()) live in:
//       tests/e2e/backend-deferred.spec.ts

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',

  // Each test gets a fresh browser context; no shared state between tests.
  // The static server persists for the whole suite run.
  fullyParallel: true,

  // Fail the build on CI if any test.only is accidentally left in.
  forbidOnly: !!process.env.CI,

  // No retries locally; 2 retries in CI to handle flakiness from a cold server.
  retries: process.env.CI ? 2 : 0,

  // Cap parallelism in CI to reduce resource pressure.
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  use: {
    baseURL: 'http://localhost:8000',

    // Collect trace on first retry only; keeps report sizes reasonable.
    trace: 'on-first-retry',

    // Short timeout for individual actions (default 5s).
    actionTimeout: 10_000,
  },

  // Start the demo preview server before running tests.
  // preview:demo renders the site with sample editorial data + BACKEND_LIVE=true,
  // then serves docs/ on port 8000. The 120s timeout covers the render step.
  webServer: {
    command: 'npm run preview:demo',
    port: 8000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
