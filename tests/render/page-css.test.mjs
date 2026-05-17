/**
 * Tests asserting that new component CSS rules from the backend-and-editorial-layer
 * are present in PAGE_CSS (the canonical inlined stylesheet) and that helper pages
 * receive those styles via injectPageCss.
 *
 * Requirement (C1): .fav-star, .editors-cut, .btn-primary, .subscribe-form,
 * .account-card, .sync-prompt, .modal-overlay, .translation-article,
 * .empty-state must all be defined in PAGE_CSS — not in a separate _shared.css.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Read render-site.mjs as a text file — we verify the PAGE_CSS string
// contains the new component rules without executing the module (which has
// top-level await that requires real data files).
const renderSiteSrc = readFileSync('./scripts/render-site.mjs', 'utf8');

// Extract PAGE_CSS content between const PAGE_CSS = ` ... `;
// Grab everything between the first backtick after "const PAGE_CSS = " and the
// closing backtick that is followed by a semicolon on its own.
const pageCssMatch = renderSiteSrc.match(/const PAGE_CSS = `([\s\S]*?)`;/);
if (!pageCssMatch) throw new Error('PAGE_CSS constant not found in render-site.mjs');
const PAGE_CSS = pageCssMatch[1];

describe('PAGE_CSS — new component CSS rules present (C1)', () => {
  it('contains .fav-star rule', () => {
    expect(PAGE_CSS).toContain('.fav-star {');
  });

  it('contains .fav-star[aria-pressed="true"] rule', () => {
    expect(PAGE_CSS).toContain('.fav-star[aria-pressed="true"]');
  });

  it('contains .editors-cut rule', () => {
    expect(PAGE_CSS).toContain('.editors-cut {');
  });

  it('contains .btn-primary rule', () => {
    expect(PAGE_CSS).toContain('.btn-primary {');
  });

  it('contains .btn-secondary rule', () => {
    expect(PAGE_CSS).toContain('.btn-secondary {');
  });

  it('contains .btn-danger rule', () => {
    expect(PAGE_CSS).toContain('.btn-danger {');
  });

  it('contains .subscribe-form rule', () => {
    expect(PAGE_CSS).toContain('.subscribe-form {');
  });

  it('contains .account-card rule', () => {
    expect(PAGE_CSS).toContain('.account-card {');
  });

  it('contains .sync-prompt rule', () => {
    expect(PAGE_CSS).toContain('.sync-prompt {');
  });

  it('contains .modal-overlay rule', () => {
    expect(PAGE_CSS).toContain('.modal-overlay {');
  });

  it('contains .translation-article rule', () => {
    expect(PAGE_CSS).toContain('.translation-article {');
  });

  it('contains .empty-state rule', () => {
    expect(PAGE_CSS).toContain('.empty-state {');
  });

  it('contains --danger CSS variable in linear theme', () => {
    // Verify status colours added to the linear theme block
    expect(PAGE_CSS).toContain('--danger: #f87171');
  });

  it('contains --danger CSS variable in claude theme', () => {
    expect(PAGE_CSS).toContain('--danger: #b03b3b');
  });

  it('contains --success CSS variable in both themes', () => {
    expect(PAGE_CSS).toContain('--success: #34d399');
    expect(PAGE_CSS).toContain('--success: #15803d');
  });

  it('.card has position: relative (anchors .fav-star)', () => {
    // The card rule must declare position: relative so .fav-star can be positioned
    // top-right inside the card.
    const cardRuleIndex = PAGE_CSS.indexOf('.card {');
    expect(cardRuleIndex).toBeGreaterThan(-1);
    // Grab the card rule block (up to the next closing brace)
    const cardBlock = PAGE_CSS.slice(cardRuleIndex, PAGE_CSS.indexOf('}', cardRuleIndex) + 1);
    expect(cardBlock).toContain('position: relative');
  });
});

describe('helper pages — _shared.css link removed (C1)', () => {
  const favouritesSrc = readFileSync('./scripts/lib/favourites-page.mjs', 'utf8');
  const accountSrc    = readFileSync('./scripts/lib/account-page.mjs', 'utf8');
  const translationSrc = readFileSync('./scripts/lib/translations.mjs', 'utf8');

  it('favourites-page.mjs does NOT link to _shared.css', () => {
    expect(favouritesSrc).not.toContain('href="../_shared.css"');
  });

  it('account-page.mjs does NOT link to _shared.css', () => {
    expect(accountSrc).not.toContain('href="../_shared.css"');
  });

  it('translations.mjs does NOT link to _shared.css', () => {
    expect(translationSrc).not.toContain('href="../../_shared.css"');
  });

  it('favourites-page.mjs contains CSS placeholder comment', () => {
    expect(favouritesSrc).toContain('Styles are inlined via PAGE_CSS');
  });

  it('account-page.mjs contains CSS placeholder comment', () => {
    expect(accountSrc).toContain('Styles are inlined via PAGE_CSS');
  });

  it('translations.mjs contains CSS placeholder comment', () => {
    expect(translationSrc).toContain('Styles are inlined via PAGE_CSS');
  });
});

describe('injectPageCss — render-site.mjs helper function (C1)', () => {
  it('injectPageCss function defined in render-site.mjs', () => {
    expect(renderSiteSrc).toContain('function injectPageCss(html)');
  });

  it('injectPageCss replaces the placeholder comment with <style> tag', () => {
    // Verify the replacement logic is present
    expect(renderSiteSrc).toContain('html.replace(CSS_PLACEHOLDER,');
  });

  it('renderFavouritesPage output is wrapped with injectPageCss at write site', () => {
    expect(renderSiteSrc).toContain('injectPageCss(renderFavouritesPage(');
  });

  it('renderAccountPage output is wrapped with injectPageCss at write site', () => {
    expect(renderSiteSrc).toContain('injectPageCss(accountHtml)');
  });

  it('renderTranslationPage output is wrapped with injectPageCss at write site', () => {
    expect(renderSiteSrc).toContain('injectPageCss(renderTranslationPage(');
  });
});
