/**
 * editors-cut.spec.ts — B7, B7b
 *
 * B7: Editor's Cut commentary box is visible under cut cards in EN by default.
 * B7b: Commentary respects the language tab — clicking 中文 swaps the text.
 *
 * The aside.editors-cut element is rendered by renderEditorialCutBox():
 *   - data-lang="en"  (initial state)
 *   - data-commentary-source="commentary_en"
 *   - data-alt-source="commentary_zh"    (when ZH commentary available)
 *   - .ec-body carries the EN text as textContent; ZH text in data-zh attr
 *
 * The lang-switch JS dispatches a 'digest-lang-change' event; the editors-cut
 * wiring script (to be implemented) listens and swaps .ec-body textContent.
 *
 * preview:demo injects 3 sample editorial cuts via build-preview-data.mjs.
 * Cuts are only rendered on cards that are actually on the page (article_id
 * must match). If the data files' items fall outside the 720h lookback window
 * the cuts will not appear — tests gracefully skip in that case.
 *
 * Testable today: preview:demo serves a page with Editor's Cut boxes when data matches.
 */

import { test, expect } from '@playwright/test';

test.describe('GH-Pages-live + preview:demo — B7 Editor\'s Cut commentary', () => {
  test('Editor\'s Cut aside is rendered for cut articles — visible in EN tab', async ({ page }) => {
    await page.goto('/');

    const cutBoxCount = await page.locator('[data-testid="editors-cut"]').count();
    if (cutBoxCount === 0) {
      test.skip(true, 'No Editor\'s Cut boxes rendered — preview data article_ids may not match rendered articles. Promoted to passing once GHA cron populates cuts for current articles.');
      return;
    }

    const cutBox = page.locator('[data-testid="editors-cut"]').first();
    await expect(cutBox).toBeVisible();

    // Box starts with data-lang="en".
    await expect(cutBox).toHaveAttribute('data-lang', 'en');

    // The 🏅 Editor's Cut label is visible.
    const label = cutBox.locator('.ec-label');
    await expect(label).toContainText("Editor's Cut");
  });

  test('Editor\'s Cut commentary text is present in EN mode', async ({ page }) => {
    await page.goto('/');

    const cutBoxCount = await page.locator('[data-testid="editors-cut"]').count();
    if (cutBoxCount === 0) {
      test.skip(true, 'No Editor\'s Cut boxes rendered — skipping until cuts are present in the preview.');
      return;
    }

    const cutBox = page.locator('[data-testid="editors-cut"]').first();
    await expect(cutBox).toBeVisible();

    // The EN commentary body must have non-empty text.
    const body = cutBox.locator('.ec-body');
    const bodyText = await body.textContent();
    expect(bodyText?.trim().length).toBeGreaterThan(0);
  });
});

test.describe('GH-Pages-live + preview:demo — B7b Editor\'s Cut respects lang tab', () => {
  test('clicking 中文 tab swaps commentary to ZH text', async ({ page }) => {
    await page.goto('/');

    // Find a cut box that has a ZH alternate (data-alt-source="commentary_zh").
    const cutBoxCount = await page.locator('[data-testid="editors-cut"][data-alt-source="commentary_zh"]').count();
    if (cutBoxCount === 0) {
      test.skip(true, 'No Editor\'s Cut boxes with ZH alternate rendered — skipping B7b until cuts are present.');
      return;
    }

    const cutBoxWithZh = page.locator('[data-testid="editors-cut"][data-alt-source="commentary_zh"]').first();
    await expect(cutBoxWithZh).toBeVisible();

    // Capture the EN body text before switching.
    const enBodyText = await cutBoxWithZh.locator('.ec-body').textContent();
    const zhBodyAttr = await cutBoxWithZh.locator('.ec-body').getAttribute('data-zh');
    expect(zhBodyAttr?.trim().length).toBeGreaterThan(0);

    // Switch to 中文.
    await page.locator('.lang-switch button[data-lang="zh"]').click();

    // The editors-cut aside should reflect the new language state.
    await expect(cutBoxWithZh).toHaveAttribute('data-lang', 'zh');

    // The body text should have changed to the ZH version.
    const zhBodyText = await cutBoxWithZh.locator('.ec-body').textContent();
    expect(zhBodyText).not.toBe(enBodyText);
    expect(zhBodyText).toBe(zhBodyAttr);
  });

  test('switching back to EN restores original commentary text', async ({ page }) => {
    await page.goto('/');

    const cutBoxCount = await page.locator('[data-testid="editors-cut"][data-alt-source="commentary_zh"]').count();
    if (cutBoxCount === 0) {
      test.skip(true, 'No Editor\'s Cut boxes with ZH alternate rendered — skipping B7b until cuts are present.');
      return;
    }

    const cutBoxWithZh = page.locator('[data-testid="editors-cut"][data-alt-source="commentary_zh"]').first();
    await expect(cutBoxWithZh).toBeVisible();

    const enBodyText = await cutBoxWithZh.locator('.ec-body').textContent();

    // Switch to ZH then back to EN.
    await page.locator('.lang-switch button[data-lang="zh"]').click();
    await page.locator('.lang-switch button[data-lang="en"]').click();

    // Commentary should be back to EN text.
    const restoredText = await cutBoxWithZh.locator('.ec-body').textContent();
    expect(restoredText).toBe(enBodyText);
    await expect(cutBoxWithZh).toHaveAttribute('data-lang', 'en');
  });
});
