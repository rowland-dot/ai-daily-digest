import { describe, it, expect } from 'vitest';
import {
  renderSitemap,
  renderNewsSitemap,
  renderRobotsTxt,
  renderItemListJsonLd,
  renderNewsArticleJsonLd,
  renderOgMeta,
  renderCanonicalLink,
  renderAtomFeed,
} from '../../scripts/lib/seo.mjs';

describe('renderSitemap', () => {
  const pages = ['/', '/digests/2026-05-17.html', '/articles/aihot-test-a1b2c3d4/', '/favourites', '/account', '/feed.xml'];

  it('produces valid sitemap XML structure', () => {
    const xml = renderSitemap(pages, 'https://example.com');
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<urlset');
  });

  it('includes all page URLs', () => {
    const xml = renderSitemap(pages, 'https://example.com');
    pages.forEach(p => {
      const expected = p === '/' ? 'https://example.com/' : `https://example.com${p}`;
      expect(xml).toContain(expected);
    });
  });

  it('has one <url> entry per page', () => {
    const xml = renderSitemap(pages, 'https://example.com');
    expect((xml.match(/<url>/g) || []).length).toBe(pages.length);
  });
});

describe('renderNewsSitemap', () => {
  const articles = [
    { slug: 'aihot-claude-4-7-launch-a3f12b8c', title: 'Claude 4.7 Launch', publishedAt: '2026-05-17T10:00:00Z', source: 'AIHOT' },
    { slug: 'aihot-deepseek-r3-7c3e9d1a', title: 'DeepSeek R3', publishedAt: '2026-05-17T11:30:00Z', source: 'AIHOT' },
  ];

  it('produces valid news sitemap XML with news namespace', () => {
    const xml = renderNewsSitemap(articles, 'https://example.com');
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"');
    expect(xml).toContain('<news:news>');
  });

  it('includes one <url> entry per article with correct loc', () => {
    const xml = renderNewsSitemap(articles, 'https://example.com');
    expect(xml).toContain('https://example.com/articles/aihot-claude-4-7-launch-a3f12b8c/');
    expect(xml).toContain('https://example.com/articles/aihot-deepseek-r3-7c3e9d1a/');
    expect((xml.match(/<url>/g) || []).length).toBe(2);
  });

  it('includes news:publication_date and news:title per entry', () => {
    const xml = renderNewsSitemap(articles, 'https://example.com');
    expect(xml).toContain('<news:publication_date>2026-05-17T10:00:00Z</news:publication_date>');
    expect(xml).toContain('<news:title>Claude 4.7 Launch</news:title>');
  });

  it('includes news:publication name and language', () => {
    const xml = renderNewsSitemap(articles, 'https://example.com');
    expect(xml).toContain('<news:publication>');
    expect(xml).toContain('<news:name>AI Daily Digest</news:name>');
    expect(xml).toContain('<news:language>en</news:language>');
  });

  it('returns valid empty sitemap when no articles', () => {
    const xml = renderNewsSitemap([], 'https://example.com');
    expect(xml).toContain('<urlset');
    expect((xml.match(/<url>/g) || []).length).toBe(0);
  });
});

describe('renderRobotsTxt', () => {
  it('allows all crawlers and references sitemap', () => {
    const txt = renderRobotsTxt('https://example.com');
    expect(txt).toContain('User-agent: *');
    expect(txt).toContain('Allow: /');
    expect(txt).toContain('Sitemap: https://example.com/sitemap.xml');
  });
});

describe('renderItemListJsonLd', () => {
  it('produces @type ItemList with correct items', () => {
    const ld = renderItemListJsonLd([{ title: 'A', url: 'https://x.com' }], 'https://example.com', '2026-05-17');
    const match = ld.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    expect(match).not.toBeNull();
    const obj = JSON.parse(match[1]);
    expect(obj['@type']).toBe('ItemList');
    expect(obj.itemListElement[0]['@type']).toBe('ListItem');
  });

  it('has correct item count', () => {
    const items = [{ title: 'A', url: 'https://a.com' }, { title: 'B', url: 'https://b.com' }];
    const ld = renderItemListJsonLd(items, 'https://example.com', '2026-05-17');
    const obj = JSON.parse(ld.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]);
    expect(obj.itemListElement).toHaveLength(2);
  });
});

describe('renderOgMeta', () => {
  it('includes og:title, og:type, og:image, twitter:card', () => {
    const meta = renderOgMeta({ title: 'Test', url: 'https://x.com/p', description: 'Desc', imageUrl: 'https://x.com/img.png' });
    expect(meta).toContain('og:title');
    expect(meta).toContain('og:image');
    expect(meta).toContain('twitter:card');
  });

  it('includes og:url', () => {
    const meta = renderOgMeta({ title: 'Test', url: 'https://x.com/p', description: 'Desc', imageUrl: 'https://x.com/img.png' });
    expect(meta).toContain('og:url');
  });

  it('escapes HTML in title and description', () => {
    const meta = renderOgMeta({ title: '<b>Test & More</b>', url: 'https://x.com', description: 'Desc', imageUrl: 'https://x.com/img.png' });
    expect(meta).not.toContain('<b>');
    expect(meta).toContain('&amp;');
  });
});

describe('renderCanonicalLink', () => {
  it('produces a canonical link tag for the given page URL', () => {
    const tag = renderCanonicalLink('https://example.com/digests/2026-05-17.html');
    expect(tag).toBe('<link rel="canonical" href="https://example.com/digests/2026-05-17.html">');
  });

  it('preserves trailing slash for index routes', () => {
    expect(renderCanonicalLink('https://example.com/')).toContain('href="https://example.com/"');
    expect(renderCanonicalLink('https://example.com/favourites')).toContain('href="https://example.com/favourites"');
  });

  it('escapes special characters in URL', () => {
    const tag = renderCanonicalLink('https://example.com/path?q=1&x="y"');
    expect(tag).not.toContain('"y"');
    expect(tag).toContain('&amp;');
  });
});

describe('renderAtomFeed', () => {
  const digests = [
    { date: '2026-05-17', publishedAt: '2026-05-17T20:30:00Z', itemCount: 14, sourceCount: 8 },
    { date: '2026-05-16', publishedAt: '2026-05-16T20:30:00Z', itemCount: 87, sourceCount: 10 },
  ];

  it('produces valid Atom 1.0 XML', () => {
    const xml = renderAtomFeed(digests, 'https://example.com');
    expect(xml).toContain('xmlns="http://www.w3.org/2005/Atom"');
    expect(xml).toContain('<feed ');
    expect(xml).toContain('<entry>');
  });

  it('has one entry per digest', () => {
    const xml = renderAtomFeed(digests, 'https://example.com');
    expect((xml.match(/<entry>/g) || []).length).toBe(2);
  });

  it('entry titles are "AI Daily Digest — YYYY-MM-DD"', () => {
    const xml = renderAtomFeed(digests, 'https://example.com');
    expect(xml).toContain('<title>AI Daily Digest — 2026-05-17</title>');
  });

  it('summary does NOT contain editorial content — uses item count format', () => {
    const xml = renderAtomFeed(digests, 'https://example.com');
    expect(xml).toContain("Today's digest:");
  });

  it('caps at 30 entries', () => {
    const many = Array.from({ length: 35 }, (_, i) => ({
      date: `2026-05-${String(i + 1).padStart(2, '0')}`,
      publishedAt: '2026-05-01T00:00:00Z',
      itemCount: 10,
      sourceCount: 5,
    }));
    const xml = renderAtomFeed(many, 'https://example.com');
    expect((xml.match(/<entry>/g) || []).length).toBeLessThanOrEqual(30);
  });

  it('entry ids are stable URNs', () => {
    const xml = renderAtomFeed(digests, 'https://example.com');
    expect(xml).toContain('<id>urn:ai-daily-digest:2026-05-17</id>');
  });

  it('feed id is urn:ai-daily-digest:feed', () => {
    const xml = renderAtomFeed(digests, 'https://example.com');
    expect(xml).toContain('<id>urn:ai-daily-digest:feed</id>');
  });
});
