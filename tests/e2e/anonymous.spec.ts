/**
 * anonymous.spec.ts — B1b
 *
 * Spec behaviour: anonymous visitors always get EN on first paint; toggling
 * to 中文 swaps card text for the session; reloading returns to EN (no
 * localStorage write for lang preference).
 *
 * Testable today: preview:demo serves the rendered site with BACKEND_LIVE=true.
 * The lang switch is always present regardless of BACKEND_LIVE.
 */

import { test, expect } from '@playwright/test';

test.describe('GH-Pages-live + preview:demo — B1b anonymous language default', () => {
  test('first paint is EN — data-lang="en" on <html> and EN tab is active', async ({ page }) => {
    await page.goto('/');

    // The LANG_SWITCH_SCRIPT sets data-lang="en" synchronously before paint.
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'en');

    // EN button is aria-pressed="true"; 中文 button is false.
    const enBtn = page.locator('.lang-switch button[data-lang="en"]');
    const zhBtn = page.locator('.lang-switch button[data-lang="zh"]');
    await expect(enBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(zhBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('clicking 中文 tab swaps data-lang to zh for the session', async ({ page }) => {
    await page.goto('/');

    const zhBtn = page.locator('.lang-switch button[data-lang="zh"]');
    await zhBtn.click();

    // After click the html element should carry data-lang="zh".
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');

    // Button states swap.
    const enBtn = page.locator('.lang-switch button[data-lang="en"]');
    await expect(zhBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(enBtn).toHaveAttribute('aria-pressed', 'false');
  });

  test('reloading after 中文 toggle returns to EN — no localStorage persistence', async ({ page }) => {
    await page.goto('/');

    // Confirm the page actively removes any legacy digest-lang key.
    const langKey = await page.evaluate(() => localStorage.getItem('digest-lang'));
    expect(langKey).toBeNull();

    // Switch to 中文.
    await page.locator('.lang-switch button[data-lang="zh"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh');

    // After reload, must be back to EN — no preference was persisted.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'en');

    // Confirm localStorage still has no lang key after reload.
    const langKeyAfterReload = await page.evaluate(() => localStorage.getItem('digest-lang'));
    expect(langKeyAfterReload).toBeNull();
  });
});
