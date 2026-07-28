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

test.describe('persistent favourites metadata', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('saved digest card appears on the favourites page', async ({ page }) => {
    const star = page.locator(STABLE_FAV_STAR).first();
    const articleId = await star.getAttribute('data-article-id');
    const title = (await star.locator('xpath=..').locator('.card-title').textContent())?.replace(/\s+/g, '');

    await star.click();
    await page.goto('/favourites/');

    const savedCard = page.locator(`[data-article-id="${articleId}"]`).filter({ has: page.locator('.card-title') });
    await expect(savedCard).toBeVisible();
    expect((await savedCard.locator('.card-title').textContent())?.replace(/\s+/g, '')).toBe(title);
  });

  test('persisted metadata renders when the current catalogue lacks the saved ID', async ({ page }) => {
    const star = page.locator(STABLE_FAV_STAR).first();
    const articleId = await star.getAttribute('data-article-id');
    const title = (await star.locator('xpath=..').locator('.card-title').textContent())?.replace(/\s+/g, '');
    await star.click();

    await page.route('**/favourites/', async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /(<script id="favourites-catalogue" type="application\/json">)[\s\S]*?(<\/script>)/,
        '$1[]$2',
      );
      await route.fulfill({ response, body });
    });
    await page.goto('/favourites/');

    const savedCard = page.locator(`[data-article-id="${articleId}"]`).filter({ has: page.locator('.card-title') });
    await expect(savedCard).toBeVisible();
    expect((await savedCard.locator('.card-title').textContent())?.replace(/\s+/g, '')).toBe(title);
  });

  test('unsaving on favourites rerenders the empty state immediately', async ({ page }) => {
    await page.locator(STABLE_FAV_STAR).first().click();
    await page.goto('/favourites/');

    await page.locator('[data-testid="favourites-content"] [data-testid="fav-star"]').click();
    await expect(page.getByRole('heading', { name: 'No favourites yet' })).toBeVisible();
    await expect(page.locator('[data-testid="favourites-count"]')).toHaveText('Your saved articles');
  });

  test('legacy favourites migrate and render on the first favourites visit', async ({ page }) => {
    const star = page.locator(STABLE_FAV_STAR).first();
    const articleId = await star.getAttribute('data-article-id');
    await page.evaluate((id) => {
      localStorage.setItem('favourites', JSON.stringify([id]));
      localStorage.removeItem('favourites_v1');
    }, articleId);

    await page.goto('/favourites/');

    await expect(page.locator(`[data-article-id="${articleId}"]`).filter({ has: page.locator('.card-title') })).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('favourites'))).toBeNull();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('favourites_v1'))).not.toBeNull();
  });

  test('missing legacy article renders a linkless placeholder that can be unsaved', async ({ page }) => {
    const missingId = 'legacy-missing-article';
    await page.evaluate((id) => {
      localStorage.setItem('favourites', JSON.stringify([id]));
      localStorage.removeItem('favourites_v1');
      localStorage.removeItem('favourites_meta_v1');
    }, missingId);

    await page.goto('/favourites/');

    const placeholder = page.locator(`article[data-article-id="${missingId}"]`);
    await expect(placeholder).toBeVisible();
    await expect(placeholder).toContainText('Original article details are unavailable after migration.');
    await expect(placeholder.locator('a')).toHaveCount(0);

    await placeholder.locator('[data-testid="fav-star"]').click();
    await expect(page.getByRole('heading', { name: 'No favourites yet' })).toBeVisible();
    await expect.poll(() => page.evaluate(() => localStorage.getItem('favourites_v1'))).toBe('[]');
  });

  test('GH Pages local save performs no favourites API request', async ({ page }) => {
    let requestCount = 0;
    await page.route('**/api/favourites', async (route) => {
      requestCount += 1;
      await route.fulfill({ status: 204 });
    });
    await page.evaluate(() => { window.__BACKEND_LIVE__ = false; });
    const star = page.locator(STABLE_FAV_STAR).first();
    const articleId = await star.getAttribute('data-article-id');

    await star.click();

    await expect.poll(() => page.evaluate(() => localStorage.getItem('favourites_v1'))).toContain(articleId as string);
    expect(requestCount).toBe(0);
  });
});
