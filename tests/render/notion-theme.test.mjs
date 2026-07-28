import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { renderAccountPage } from '../../scripts/lib/account-page.mjs';
import { renderFavouritesPage } from '../../scripts/lib/favourites-page.mjs';
import { renderTranslationPage } from '../../scripts/lib/translations.mjs';

const renderSiteSrc = readFileSync('./scripts/render-site.mjs', 'utf8');
const cssMatch = renderSiteSrc.match(/const PAGE_CSS = `([\s\S]*?)`;/);
if (!cssMatch) throw new Error('PAGE_CSS not found');
const pageCss = cssMatch[1];

function themeBootResult(savedTheme) {
  const match = renderSiteSrc.match(/const THEME_BOOT_SCRIPT = `([\s\S]*?)`;/);
  if (!match) throw new Error('THEME_BOOT_SCRIPT not found');
  const attrs = {};
  vm.runInNewContext(match[1], {
    localStorage: { getItem: () => savedTheme },
    window: { matchMedia: () => ({ matches: false }) },
    document: {
      documentElement: {
        setAttribute(name, value) { attrs[name] = value; },
      },
    },
  });
  return attrs['data-theme'];
}

describe('Notion theme selection', () => {
  it('defaults new visitors to notion', () => {
    expect(themeBootResult(null)).toBe('notion');
  });

  it('honours existing valid saved themes', () => {
    expect(themeBootResult('linear')).toBe('linear');
    expect(themeBootResult('claude')).toBe('claude');
    expect(themeBootResult('notion')).toBe('notion');
  });

  it('falls back to notion for an invalid saved value', () => {
    expect(themeBootResult('unknown-theme')).toBe('notion');
  });

  it('defines light and system-dark Notion palettes without removing legacy themes', () => {
    expect(pageCss).toContain('[data-theme="notion"]');
    expect(pageCss).toContain('@media (prefers-color-scheme: dark)');
    expect(pageCss).toContain('[data-theme="linear"]');
    expect(pageCss).toContain('[data-theme="claude"]');
  });
});

describe('Notion selector coverage', () => {
  it('home and archive templates expose a Notion option', () => {
    expect((renderSiteSrc.match(/<button data-theme="notion" role="tab">Notion<\/button>/g) || []).length)
      .toBeGreaterThanOrEqual(2);
  });

  it('favourites and account expose a Notion option', () => {
    expect(renderFavouritesPage()).toContain('data-theme="notion" role="tab">Notion</button>');
    expect(renderAccountPage({ backendLive: true })).toContain('data-theme="notion" role="tab">Notion</button>');
  });

  it('translation pages use Notion', () => {
    const html = renderTranslationPage({ title: 'A', source: 'S', originalUrl: 'https://example.com', slug: 'a' });
    expect(html).toContain('<html lang="en" data-theme="notion">');
  });
});

describe('Notion production semantics', () => {
  it('renders an accessible edition status and section-dot navigation', () => {
    expect(renderSiteSrc).toContain('role="status" aria-label="${editionStatusLabel}"');
    expect(renderSiteSrc).toContain('<nav class="section-mix" aria-label="${sectionMixAriaLabel}">');
    expect(renderSiteSrc).toContain('aria-label="Jump to ${section.label}"');
  });

  it('builds section dots from the same has-content map as rendered sections', () => {
    expect(renderSiteSrc).toContain('.filter((section) => has[section.id])');
    expect(renderSiteSrc).toContain('href="#${section.id}"');
  });

  it('keeps ordinary Notion cards neutral and tints only Editor\'s Cut cards and boxes', () => {
    expect(pageCss).toContain('[data-theme="notion"] .card {');
    expect(pageCss).toContain('[data-theme="notion"] .card:has(.editors-cut)');
    expect(pageCss).toContain('[data-theme="notion"] .editors-cut {');
    expect(pageCss).not.toMatch(/\[data-theme="notion"\] \.card:nth-/);
  });

  it('includes responsive Notion refinements for the hero, cards, and section dots', () => {
    expect(pageCss).toContain('.section-mix-dot');
    expect(pageCss).toContain('@media (max-width: 640px)');
    expect(pageCss).toContain('[data-theme="notion"] header.hero');
  });

  it('uses theme variables for edition status and section-mix contrast', () => {
    expect(pageCss).toContain('--hero-secondary:');
    expect(pageCss).toContain('--hero-muted:');
    expect(pageCss).toContain('color: var(--hero-secondary)');
    expect(pageCss).toContain('border: 2px solid var(--hero-dot-border)');
  });

  it('labels the latest page and archived digest pages distinctly', () => {
    expect(renderSiteSrc).toContain("const editionLabel = pathPrefix ? 'Edition archive' : 'Today\\'s edition';");
    expect(renderSiteSrc).toContain('<span>${editionLabel}</span>');
  });

  it('labels home and archive section mixes distinctly', () => {
    expect(renderSiteSrc).toContain("const sectionMixLabel = pathPrefix ? 'Edition section mix' : 'Today\\'s section mix';");
    expect(renderSiteSrc).toContain("const sectionMixAriaLabel = pathPrefix ? 'Jump to edition sections' : 'Jump to today\\'s sections';");
    expect(renderSiteSrc).toContain('aria-label="${sectionMixAriaLabel}"');
    expect(renderSiteSrc).toContain('<span class="section-mix-label">${sectionMixLabel}</span>');
  });

  it('keeps the site-nav hit target above hero typography', () => {
    expect(pageCss).toMatch(/\.site-nav \{[\s\S]*position: relative;[\s\S]*z-index: 2;/);
  });
});
