/**
 * nav.spec.ts — site-nav strip navigation
 *
 * Verifies that the site-nav strip is present on the home page and that
 * clicking "★ Saved" navigates to /favourites/.
 *
 * The preview:demo server runs with BACKEND_LIVE=true, so the Account link
 * is also present and tested here.
 *
 * Base URL: http://localhost:8000 (configured in playwright.config.mjs).
 */

import { test, expect } from '@playwright/test';

test.describe('site-nav strip — presence and navigation', () => {
  test('home page has a site-nav strip', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav.site-nav')).toBeVisible();
  });

  test('home page site-nav contains "Daily digest" link', async ({ page }) => {
    await page.goto('/');
    const link = page.locator('nav.site-nav a', { hasText: 'Daily digest' });
    await expect(link).toBeVisible();
  });

  test('home page site-nav contains "★ Saved" link', async ({ page }) => {
    await page.goto('/');
    const link = page.locator('nav.site-nav a', { hasText: '★ Saved' });
    await expect(link).toBeVisible();
  });

  test('clicking "★ Saved" from home navigates to /favourites/', async ({ page }) => {
    await page.goto('/');
    const savedLink = page.locator('nav.site-nav a', { hasText: '★ Saved' });
    await savedLink.click();
    await expect(page).toHaveURL(/\/favourites\//);
  });

  test('favourites page has a site-nav strip', async ({ page }) => {
    await page.goto('/favourites/');
    await expect(page.locator('nav.site-nav')).toBeVisible();
  });

  test('favourites page site-nav "Daily digest" link returns home', async ({ page }) => {
    await page.goto('/favourites/');
    const homeLink = page.locator('nav.site-nav a', { hasText: 'Daily digest' });
    await homeLink.click();
    await expect(page).toHaveURL(/^http:\/\/localhost:8000\/?$/);
  });

  test('home page site-nav contains "Account" link (BACKEND_LIVE=true)', async ({ page }) => {
    await page.goto('/');
    // preview:demo always runs with BACKEND_LIVE=true
    const link = page.locator('nav.site-nav a', { hasText: 'Account' });
    await expect(link).toBeVisible();
  });

  test('"Daily digest" link on home has data-current="true"', async ({ page }) => {
    await page.goto('/');
    const link = page.locator('nav.site-nav a', { hasText: 'Daily digest' });
    await expect(link).toHaveAttribute('data-current', 'true');
  });

  test('"★ Saved" link on favourites page has data-current="true"', async ({ page }) => {
    await page.goto('/favourites/');
    const link = page.locator('nav.site-nav a', { hasText: '★ Saved' });
    await expect(link).toHaveAttribute('data-current', 'true');
  });
});

test.describe('site-nav hit targets', () => {
  test('favourites-page home link owns its full center hit target', async ({ page }) => {
    await page.goto('/favourites/');
    const homeLink = page.locator('nav.site-nav a', { hasText: 'Daily digest' });
    const ownsCenter = await homeLink.evaluate((link) => {
      const box = link.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit === link || link.contains(hit);
    });
    expect(ownsCenter).toBe(true);
    await homeLink.click();
    await expect(page).toHaveURL(/^http:\/\/localhost:8000\/?$/);
  });
});
