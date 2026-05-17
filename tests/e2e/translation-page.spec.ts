/**
 * translation-page.spec.ts — B8
 *
 * Spec behaviour: clicking an EN-language card title for a CN-source article
 * navigates to /articles/<slug>/ which renders a 3-paragraph EN excerpt and a
 * prominent "Read original (中文) →" CTA link to the source.
 *
 * Translation pages are only generated when the data/claude-summaries.json
 * contains a `translations` array (written by the GHA cron after the
 * summariser routine runs). preview:demo does NOT inject translations — it
 * only injects editorial cuts.
 *
 * Test strategy:
 * 1. Request /articles/ and check whether any translation pages were rendered.
 * 2. If none exist, skip the E2E assertions with an informative message.
 * 3. If at least one exists, navigate to it and assert the required structure.
 *
 * Once the GHA cron has populated translation data, these tests will run
 * fully and assert the production shape. Until then they are skipped, NOT
 * failed — the render-integration tests (tests/render/translation-pages.test.mjs)
 * cover the structural contract without a browser.
 */

import { test, expect } from '@playwright/test';

test.describe('GH-Pages-live + preview:demo — B8 CN article translation page', () => {
  let firstArticleUrl: string | null = null;

  // Discover the first available translation page before each describe block.
  // We do this once via a directed request to /feed.xml or by checking the
  // rendered docs/articles/ structure. For simplicity, we fetch the home page
  // and look for a card that links to /articles/.
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await page.goto('/');
      // Look for any link on the page that points to an /articles/ path.
      const articleLink = page.locator('a[href*="/articles/"]').first();
      const count = await articleLink.count();
      if (count > 0) {
        firstArticleUrl = await articleLink.getAttribute('href');
      }
    } finally {
      await page.close();
    }
  });

  test('translation page renders 3-paragraph EN excerpt when available', async ({ page }) => {
    if (!firstArticleUrl) {
      test.skip(true, 'No translation pages rendered yet — requires GHA cron to populate translations in claude-summaries.json');
      return;
    }

    await page.goto(firstArticleUrl);

    // The translation article container must be present.
    const article = page.locator('[data-testid="translation-article"]');
    await expect(article).toBeVisible();

    // Must have at least 3 paragraphs in the translation body.
    const paragraphs = article.locator('.translation-body p');
    const count = await paragraphs.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Each visible paragraph must have non-empty text.
    for (let i = 0; i < Math.min(count, 3); i++) {
      const text = await paragraphs.nth(i).textContent();
      expect(text?.trim().length).toBeGreaterThan(0);
    }
  });

  test('translation page has a "Read original" CTA link to CN source', async ({ page }) => {
    if (!firstArticleUrl) {
      test.skip(true, 'No translation pages rendered yet — requires GHA cron to populate translations');
      return;
    }

    await page.goto(firstArticleUrl);

    // The CTA link must be visible and point to an external URL.
    const ctaLink = page.locator('[data-testid="read-original-cta"]');
    await expect(ctaLink).toBeVisible();
    await expect(ctaLink).toContainText('中文');

    const href = await ctaLink.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href?.startsWith('http')).toBe(true);
  });

  test('translation page has a canonical link in <head>', async ({ page }) => {
    if (!firstArticleUrl) {
      test.skip(true, 'No translation pages rendered yet — requires GHA cron to populate translations');
      return;
    }

    await page.goto(firstArticleUrl);

    // Per spec §D6/D7: canonical points to the CN source, not this page.
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveCount(1);

    const canonicalHref = await canonical.getAttribute('href');
    // Canonical must be an absolute URL (not the translation page URL itself).
    expect(canonicalHref?.startsWith('http')).toBe(true);
  });

  test('translation page has Atom feed autodiscovery link in <head>', async ({ page }) => {
    if (!firstArticleUrl) {
      test.skip(true, 'No translation pages rendered yet — requires GHA cron to populate translations');
      return;
    }

    await page.goto(firstArticleUrl);

    const feedLink = page.locator('link[rel="alternate"][type="application/atom+xml"]');
    await expect(feedLink).toHaveCount(1);
  });
});
