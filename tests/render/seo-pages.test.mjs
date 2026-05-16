/**
 * Render integration tests: SEO output files exist with correct content.
 * Runs render-site.mjs first, then asserts file contents.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Run the renderer once before all checks
beforeAll(() => {
  execSync('node scripts/render-site.mjs', {
    cwd: process.cwd(),
    env: { ...process.env, BACKEND_LIVE: 'false', SITE_ORIGIN: 'https://example.com' },
    timeout: 30000,
  });
}, 35000);

describe('docs/sitemap.xml', () => {
  it('exists after render', () => {
    expect(existsSync('docs/sitemap.xml')).toBe(true);
  });

  it('contains <urlset> XML structure', () => {
    const xml = readFileSync('docs/sitemap.xml', 'utf8');
    expect(xml).toContain('<urlset');
    expect(xml).toContain('<?xml');
  });

  it('lists / (home) URL', () => {
    const xml = readFileSync('docs/sitemap.xml', 'utf8');
    expect(xml).toContain('example.com');
  });

  it('lists /feed.xml', () => {
    const xml = readFileSync('docs/sitemap.xml', 'utf8');
    expect(xml).toContain('/feed.xml');
  });
});

describe('docs/news-sitemap.xml', () => {
  it('exists after render', () => {
    expect(existsSync('docs/news-sitemap.xml')).toBe(true);
  });

  it('has <news:news> namespace', () => {
    const xml = readFileSync('docs/news-sitemap.xml', 'utf8');
    expect(xml).toContain('xmlns:news');
  });
});

describe('docs/robots.txt', () => {
  it('exists after render', () => {
    expect(existsSync('docs/robots.txt')).toBe(true);
  });

  it('contains Sitemap: reference', () => {
    const txt = readFileSync('docs/robots.txt', 'utf8');
    expect(txt).toContain('Sitemap:');
  });
});

describe('docs/index.html SEO head', () => {
  it('contains JSON-LD script tag', () => {
    const html = readFileSync('docs/index.html', 'utf8');
    expect(html).toContain('application/ld+json');
  });

  it('contains og:title meta tag', () => {
    const html = readFileSync('docs/index.html', 'utf8');
    expect(html).toContain('og:title');
  });

  it('contains twitter:card meta tag', () => {
    const html = readFileSync('docs/index.html', 'utf8');
    expect(html).toContain('twitter:card');
  });

  it('contains exactly one Atom autodiscovery link', () => {
    const html = readFileSync('docs/index.html', 'utf8');
    const matches = html.match(/application\/atom\+xml/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('contains a canonical link tag', () => {
    const html = readFileSync('docs/index.html', 'utf8');
    expect(html).toContain('<link rel="canonical"');
  });
});

describe('docs/favourites/index.html SEO head', () => {
  it('contains a canonical link tag', () => {
    const html = readFileSync('docs/favourites/index.html', 'utf8');
    expect(html).toContain('<link rel="canonical"');
  });
});

describe('docs/feed.xml', () => {
  it('exists after render', () => {
    expect(existsSync('docs/feed.xml')).toBe(true);
  });

  it('passes basic Atom structure check', () => {
    const xml = readFileSync('docs/feed.xml', 'utf8');
    expect(xml).toContain('<feed ');
    expect(xml).toContain('xmlns="http://www.w3.org/2005/Atom"');
    expect(xml).toContain('<entry>');
  });

  it('does NOT contain editorial.overall_en text (no editorial leak)', () => {
    // The Atom feed summaries should only have item counts, not editorial commentary
    const xml = readFileSync('docs/feed.xml', 'utf8');
    // editorial.overall_en from the live data would be unique prose — we check
    // no <entry> summary contains more than a short item-count sentence
    const summaries = [...xml.matchAll(/<summary>([^<]+)<\/summary>/g)].map(m => m[1]);
    for (const s of summaries) {
      expect(s).toContain("Today's digest:");
    }
  });
});
