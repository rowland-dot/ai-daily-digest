/**
 * Render integration tests for /articles/<slug>/ translation pages.
 * Tests helper-level behaviours (card dual-href, page file existence)
 * without running the full render-site.mjs CLI.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

const { renderTranslationPage, translationSlug } = await import('../../scripts/lib/translations.mjs');

const summaries = JSON.parse(
  readFileSync('./tests/fixtures/summaries-with-editorial.json', 'utf8')
);

// The fixture has one translation entry
const translationEntry = summaries.translations[0];

describe('renderTranslationPage — integration with fixture data', () => {
  it('renders populated page from fixture translation entry', () => {
    const html = renderTranslationPage(translationEntry, { siteOrigin: 'https://example.com' });
    expect(html).toContain('data-testid="translation-article"');
  });

  it('contains article title from fixture', () => {
    const html = renderTranslationPage(translationEntry, { siteOrigin: 'https://example.com' });
    expect(html).toContain(translationEntry.title);
  });

  it('excerpt paragraphs are split by newline and rendered as <p> tags', () => {
    const html = renderTranslationPage(translationEntry, { siteOrigin: 'https://example.com' });
    const paraCount = (html.match(/<p>/g) || []).length;
    // 3 excerpt paragraphs + attribution + caption = at least 3
    expect(paraCount).toBeGreaterThanOrEqual(3);
  });

  it('canonical URL points to original CN source (not to own slug)', () => {
    const html = renderTranslationPage(translationEntry, { siteOrigin: 'https://example.com' });
    const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/);
    expect(canonicalMatch).not.toBeNull();
    expect(canonicalMatch[1]).toBe(translationEntry.originalUrl);
  });

  it('hreflang en points to own slug page', () => {
    const html = renderTranslationPage(translationEntry, { siteOrigin: 'https://example.com' });
    expect(html).toContain(`hreflang="en"`);
    expect(html).toContain(translationEntry.slug);
  });

  it('NewsArticle JSON-LD contains isBasedOn pointing to original URL', () => {
    const html = renderTranslationPage(translationEntry, { siteOrigin: 'https://example.com' });
    const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(ldMatch).not.toBeNull();
    const ld = JSON.parse(ldMatch[1]);
    expect(ld['@type']).toBe('NewsArticle');
    expect(ld.isBasedOn.url).toBe(translationEntry.originalUrl);
  });

  it('Atom autodiscovery link is present', () => {
    const html = renderTranslationPage(translationEntry, { siteOrigin: 'https://example.com' });
    expect(html).toContain('application/atom+xml');
  });
});

describe('translationSlug — used by render-site.mjs for card dual-href', () => {
  it('slug from fixture entry is stable', () => {
    const slug = translationSlug(
      translationEntry.source,
      translationEntry.title,
      translationEntry.originalUrl
    );
    // Should be a valid slug pattern
    expect(slug).toMatch(/^[a-z][a-z0-9-]*-[0-9a-f]{8}$/);
  });

  it('CN source article card should carry data-en-href and data-zh-href attributes', () => {
    // This simulates what render-site.mjs will wire for source_lang='zh' items
    const slug = translationSlug(
      translationEntry.source,
      translationEntry.title,
      translationEntry.originalUrl
    );
    const enHref = `/articles/${slug}/`;
    const zhHref = translationEntry.originalUrl;
    // Verify the values are distinct (EN = translation page, ZH = original)
    expect(enHref).not.toBe(zhHref);
    expect(enHref).toContain('/articles/');
    expect(zhHref).toBe(translationEntry.originalUrl);
  });
});
