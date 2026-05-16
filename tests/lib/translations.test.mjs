import { describe, it, expect } from 'vitest';
import { renderTranslationPage, translationSlug } from '../../scripts/lib/translations.mjs';

describe('translationSlug', () => {
  it('produces "<source>-<title-kebab>-<8-char-hash>" format', () => {
    const s = translationSlug('aihot', 'Claude 4.7 Launch', 'https://aihot.com/1');
    expect(s).toMatch(/^aihot-claude-4-7-launch-[0-9a-f]{8}$/);
  });

  it('is stable across calls with same inputs', () => {
    const a = translationSlug('aihot', 'Claude 4.7', 'https://x.com');
    const b = translationSlug('aihot', 'Claude 4.7', 'https://x.com');
    expect(a).toBe(b);
  });

  it('differs for different URLs', () => {
    const a = translationSlug('aihot', 'Same Title', 'https://x.com/1');
    const b = translationSlug('aihot', 'Same Title', 'https://x.com/2');
    expect(a).not.toBe(b);
  });

  it('lowercases source prefix', () => {
    expect(translationSlug('AIHOT', 'Test', 'https://x.com')).toMatch(/^aihot-/);
  });

  it('strips punctuation from title', () => {
    const s = translationSlug('aihot', "Claude's New Model!", 'https://x.com');
    expect(s).not.toContain("'");
    expect(s).not.toContain('!');
  });

  it('caps title parts at 5 words', () => {
    const s = translationSlug('aihot', 'One Two Three Four Five Six Seven', 'https://x.com');
    const parts = s.split('-');
    // source + up to 5 title words + 8-char hash
    expect(parts.length).toBeLessThanOrEqual(7);
  });
});

describe('renderTranslationPage — populated (mockup 29)', () => {
  const article = {
    title: 'Claude 4.7',
    source: 'AIHOT',
    originalUrl: 'https://aihot.com/1',
    publishedAt: '2026-05-17',
    excerpt_en: 'Para 1.\nPara 2.\nPara 3.',
    slug: 'aihot-claude-4-7-launch-a3f12b8c',
  };
  const opts = { siteOrigin: 'https://example.com' };

  it('renders data-testid="translation-article"', () => {
    const html = renderTranslationPage(article, opts);
    expect(html).toContain('data-testid="translation-article"');
  });

  it('has "Read original (中文) →" CTA', () => {
    const html = renderTranslationPage(article, opts);
    expect(html).toContain('Read original (中文) →');
  });

  it('has data-testid="read-original-cta"', () => {
    const html = renderTranslationPage(article, opts);
    expect(html).toContain('data-testid="read-original-cta"');
  });

  it('contains excerpt text', () => {
    const html = renderTranslationPage(article, opts);
    expect(html).toContain('Para 1.');
  });

  it('has <link rel="canonical" pointing to original URL', () => {
    const html = renderTranslationPage(article, opts);
    expect(html).toContain('<link rel="canonical"');
    expect(html).toContain('aihot.com/1');
  });

  it('has hreflang="zh" pointing to original URL', () => {
    const html = renderTranslationPage(article, opts);
    expect(html).toContain('hreflang="zh"');
  });

  it('has hreflang="en" pointing to own slug page', () => {
    const html = renderTranslationPage(article, opts);
    expect(html).toContain('hreflang="en"');
    expect(html).toContain(article.slug);
  });

  it('has NewsArticle JSON-LD with @type', () => {
    const html = renderTranslationPage(article, opts);
    expect(html).toContain('"@type":"NewsArticle"');
  });

  it('has isBasedOn in JSON-LD', () => {
    const html = renderTranslationPage(article, opts);
    expect(html).toContain('"isBasedOn"');
  });

  it('has Atom autodiscovery link', () => {
    const html = renderTranslationPage(article, opts);
    expect(html).toContain('application/atom+xml');
  });
});

describe('renderTranslationPage — placeholder (mockup 30)', () => {
  const article = {
    title: 'Pending Article',
    source: 'AIHOT',
    originalUrl: 'https://aihot.com/2',
    publishedAt: '2026-05-17',
    excerpt_en: null,
    slug: 'aihot-pending-article-b7e29d1f',
  };

  it('renders data-testid="translation-placeholder" when excerpt_en is null', () => {
    const html = renderTranslationPage(article, { siteOrigin: 'https://example.com' });
    expect(html).toContain('data-testid="translation-placeholder"');
  });

  it('contains "Translation pending" text', () => {
    const html = renderTranslationPage(article, { siteOrigin: 'https://example.com' });
    expect(html).toContain('Translation pending');
  });

  it('does NOT contain data-testid="translation-article"', () => {
    const html = renderTranslationPage(article, { siteOrigin: 'https://example.com' });
    expect(html).not.toContain('data-testid="translation-article"');
  });
});
