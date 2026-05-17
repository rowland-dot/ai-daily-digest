/**
 * favourites.spec.ts — B2
 *
 * Spec behaviour: an anonymous visitor clicks the ☆ star on a card;
 * the button toggles to ★ (aria-pressed="true"); reloading the page
 * preserves the ★ state via localStorage.
 *
 * The fav-star button is always rendered in the HTML; client-side JS wires
 * the localStorage toggle and persistence layer. These tests assert the
 * full browser-observable contract — the JS implementation (the wiring
 * script) must be present for these tests to pass.
 *
 * Testable today: preview:demo renders with BACKEND_LIVE=true; fav-star
 * buttons are always rendered regardless of flag.
 *
 * Note on layout: fav-star buttons are position:absolute in the card's
 * top-right corner. In builder-voices sections, adjacent cards may be
 * close together. We use the GitHub trending section stars (section#trending)
 * which are well-separated, to avoid pointer-interception issues.
 */

import { test, expect } from '@playwright/test';

/** Pick a fav-star from the GitHub trending section where cards are well-separated. */
const STABLE_FAV_STAR = '#trending [data-testid="fav-star"]';

test.describe('GH-Pages-live + preview:demo — B2 anonymous fav-star', () => {
  test.beforeEach(async ({ page }) => {
    // Start with a clean localStorage so each test is independent.
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('clicking ☆ toggles button to aria-pressed="true"', async ({ page }) => {
    await page.goto('/');

    // Scroll to the trending section to ensure the fav-star is accessible.
    await page.locator('#trending').scrollIntoViewIfNeeded();

    const star = page.locator(STABLE_FAV_STAR).first();
    await expect(star).toBeVisible();

    // Initially unpressed.
    await expect(star).toHaveAttribute('aria-pressed', 'false');

    // Click to save — scroll into view first.
    await star.scrollIntoViewIfNeeded();
    await star.click();

    // Must immediately reflect the saved state.
    await expect(star).toHaveAttribute('aria-pressed', 'true');
  });

  test('saved article-id is persisted to localStorage', async ({ page }) => {
    await page.goto('/');

    await page.locator('#trending').scrollIntoViewIfNeeded();
    const star = page.locator(STABLE_FAV_STAR).first();
    await star.scrollIntoViewIfNeeded();

    const articleId = await star.getAttribute('data-article-id');
    expect(articleId).toBeTruthy();

    await star.click();
    await expect(star).toHaveAttribute('aria-pressed', 'true');

    // localStorage must contain the article-id somewhere.
    // The exact key is implementation detail; we assert at least one
    // localStorage entry references this article-id.
    const storedIds = await page.evaluate((id) => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        try {
          const val = localStorage.getItem(key) ?? '';
          if (val.includes(id as string)) return true;
        } catch { /* ignore */ }
      }
      return false;
    }, articleId);

    expect(storedIds).toBe(true);
  });

  test('★ state persists across page reload', async ({ page }) => {
    await page.goto('/');

    await page.locator('#trending').scrollIntoViewIfNeeded();
    const star = page.locator(STABLE_FAV_STAR).first();
    await star.scrollIntoViewIfNeeded();

    const articleId = await star.getAttribute('data-article-id');

    await star.click();
    await expect(star).toHaveAttribute('aria-pressed', 'true');

    // Reload and verify the ★ is restored from localStorage.
    await page.reload();
    await page.locator('#trending').scrollIntoViewIfNeeded();

    const restoredStar = page.locator(`[data-testid="fav-star"][data-article-id="${articleId}"]`);
    await expect(restoredStar).toHaveAttribute('aria-pressed', 'true');
  });

  test('clicking ★ a second time toggles back to ☆ (un-save)', async ({ page }) => {
    await page.goto('/');

    await page.locator('#trending').scrollIntoViewIfNeeded();
    const star = page.locator(STABLE_FAV_STAR).first();
    await star.scrollIntoViewIfNeeded();

    // Save.
    await star.click();
    await expect(star).toHaveAttribute('aria-pressed', 'true');

    // Un-save.
    await star.click();
    await expect(star).toHaveAttribute('aria-pressed', 'false');
  });
});
