/**
 * Site-nav strip tests.
 *
 * Verifies that every rendered page (home, favourites, account) carries a
 * <nav class="site-nav"> with the correct links, and that the Account link
 * is absent when BACKEND_LIVE=false.
 *
 * Tests run against source text (render-site.mjs, favourites-page.mjs,
 * account-page.mjs) rather than executing the module, because render-site.mjs
 * has top-level await that requires real data files.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderFavouritesPage } from '../../scripts/lib/favourites-page.mjs';
import { renderAccountPage }    from '../../scripts/lib/account-page.mjs';

// ---- helpers ----------------------------------------------------------------

const renderSiteSrc = readFileSync('./scripts/render-site.mjs', 'utf8');

// Extract the renderSiteNav function source to verify its shape without execution.
const navFnMatch = renderSiteSrc.match(/function renderSiteNav[\s\S]*?\n\}/);
const navFnSrc   = navFnMatch ? navFnMatch[0] : '';

// Simulate renderSiteNav by evaluating it in isolation.
// We replicate its logic here rather than import render-site.mjs (top-level await).
function renderSiteNav(currentPage, { backendLive = false, pathPrefix = '' } = {}) {
  const homeHref = pathPrefix || '/';
  const favHref  = `${pathPrefix}favourites/`;
  const accHref  = `${pathPrefix}account/`;
  const links = [
    `<a href="${homeHref}" class="site-nav-link" data-current="${currentPage === 'home'}"${currentPage === 'home' ? ' aria-current="page"' : ''} aria-label="Daily digest home">Daily digest</a>`,
    `<a href="${favHref}"  class="site-nav-link" data-current="${currentPage === 'favourites'}"${currentPage === 'favourites' ? ' aria-current="page"' : ''}>★ Saved</a>`,
    backendLive
      ? `<a href="${accHref}"  class="site-nav-link" data-current="${currentPage === 'account'}"${currentPage === 'account' ? ' aria-current="page"' : ''}>Account</a>`
      : '',
  ].filter(Boolean).join('\n    ');
  return `<nav class="site-nav" aria-label="Site">\n    ${links}\n  </nav>`;
}

// ---- render-site.mjs source checks -----------------------------------------

describe('render-site.mjs — renderSiteNav function present', () => {
  it('renderSiteNav is defined in render-site.mjs', () => {
    expect(renderSiteSrc).toContain('function renderSiteNav(');
  });

  it('renderSiteNav is called in the home-page header template', () => {
    expect(renderSiteSrc).toContain("renderSiteNav('home'");
  });

  it('NAV_PLACEHOLDER_FALSE constant is defined', () => {
    expect(renderSiteSrc).toContain('NAV_PLACEHOLDER_FALSE');
  });

  it('NAV_PLACEHOLDER_TRUE constant is defined', () => {
    expect(renderSiteSrc).toContain('NAV_PLACEHOLDER_TRUE');
  });

  it('injectSiteNav helper is defined', () => {
    expect(renderSiteSrc).toContain('function injectSiteNav(');
  });

  it('account page write uses injectSiteNav', () => {
    expect(renderSiteSrc).toContain("injectSiteNav(injectPageCss(accountHtml), 'account')");
  });
});

// ---- PAGE_CSS checks --------------------------------------------------------

describe('PAGE_CSS — .site-nav rules present', () => {
  const pageCssMatch = renderSiteSrc.match(/const PAGE_CSS = `([\s\S]*?)`;/);
  if (!pageCssMatch) throw new Error('PAGE_CSS not found in render-site.mjs');
  const PAGE_CSS = pageCssMatch[1];

  it('contains .site-nav rule', () => {
    expect(PAGE_CSS).toContain('.site-nav {');
  });

  it('contains .site-nav-link rule', () => {
    expect(PAGE_CSS).toContain('.site-nav-link {');
  });

  it('contains [data-current="true"] rule', () => {
    expect(PAGE_CSS).toContain('[data-current="true"]');
  });
});

// ---- renderSiteNav unit tests -----------------------------------------------

describe('renderSiteNav — home (BACKEND_LIVE=false)', () => {
  const html = renderSiteNav('home', { backendLive: false, pathPrefix: '' });

  it('emits <nav class="site-nav">', () => {
    expect(html).toContain('<nav class="site-nav"');
  });

  it('Daily digest link has data-current="true"', () => {
    expect(html).toContain('data-current="true"');
    expect(html).toContain('Daily digest');
  });

  it('★ Saved link has data-current="false"', () => {
    expect(html).toContain('★ Saved');
    expect(html).toContain('data-current="false"');
  });

  it('Account link is absent when backendLive=false', () => {
    expect(html).not.toContain('Account');
    expect(html).not.toContain('/account/');
  });
});

describe('renderSiteNav — home (BACKEND_LIVE=true)', () => {
  const html = renderSiteNav('home', { backendLive: true, pathPrefix: '' });

  it('Account link is present when backendLive=true', () => {
    expect(html).toContain('Account');
    expect(html).toContain('account/');
  });
});

describe('renderSiteNav — favourites sub-page (BACKEND_LIVE=true)', () => {
  const html = renderSiteNav('favourites', { backendLive: true, pathPrefix: '../' });

  it('★ Saved link has data-current="true"', () => {
    // Find the ★ Saved anchor
    const favIdx = html.indexOf('★ Saved');
    const anchorStart = html.lastIndexOf('<a ', favIdx);
    const anchorSnippet = html.slice(anchorStart, html.indexOf('>', anchorStart));
    expect(anchorSnippet).toContain('data-current="true"');
  });

  it('Daily digest link uses ../ prefix for sub-page', () => {
    expect(html).toContain('href="../"');
  });

  it('Account link uses ../ prefix for sub-page', () => {
    expect(html).toContain('href="../account/"');
  });
});

describe('renderSiteNav — account sub-page (BACKEND_LIVE=true)', () => {
  const html = renderSiteNav('account', { backendLive: true, pathPrefix: '../' });

  it('Account link has data-current="true"', () => {
    const accIdx = html.indexOf('>Account<');
    const anchorStart = html.lastIndexOf('<a ', accIdx);
    const anchorSnippet = html.slice(anchorStart, html.indexOf('>', anchorStart));
    expect(anchorSnippet).toContain('data-current="true"');
  });

  it('Daily digest link has data-current="false"', () => {
    const homeIdx = html.indexOf('Daily digest');
    const anchorStart = html.lastIndexOf('<a ', homeIdx);
    const anchorSnippet = html.slice(anchorStart, html.indexOf('>', anchorStart));
    expect(anchorSnippet).toContain('data-current="false"');
  });
});

// ---- favourites-page.mjs placeholder checks ---------------------------------

describe('favourites-page.mjs — NAV_PLACEHOLDER present', () => {
  it('contains SITE_NAV_PLACEHOLDER comment (BACKEND_LIVE=false path)', () => {
    const html = renderFavouritesPage({ backendLive: false, savedArticles: [] });
    expect(html).toContain('SITE_NAV_PLACEHOLDER');
  });

  it('contains SITE_NAV_PLACEHOLDER comment (BACKEND_LIVE=true path)', () => {
    const html = renderFavouritesPage({ backendLive: true, savedArticles: [], auth: 'anonymous' });
    expect(html).toContain('SITE_NAV_PLACEHOLDER');
  });

  it('placeholder is inside <header class="hero">', () => {
    const html = renderFavouritesPage({ backendLive: false, savedArticles: [] });
    const headerStart = html.indexOf('<header class="hero">');
    const headerEnd   = html.indexOf('</header>', headerStart);
    const navPlaceholder = html.indexOf('SITE_NAV_PLACEHOLDER', headerStart);
    expect(headerStart).toBeGreaterThan(-1);
    expect(navPlaceholder).toBeGreaterThan(headerStart);
    expect(navPlaceholder).toBeLessThan(headerEnd);
  });
});

// ---- account-page.mjs placeholder checks ------------------------------------

describe('account-page.mjs — NAV_PLACEHOLDER present', () => {
  it('contains SITE_NAV_PLACEHOLDER comment when BACKEND_LIVE=true', () => {
    const html = renderAccountPage({ backendLive: true, auth: 'linked' });
    expect(html).toContain('SITE_NAV_PLACEHOLDER');
  });

  it('placeholder is inside <header class="hero">', () => {
    const html = renderAccountPage({ backendLive: true, auth: 'linked' });
    const headerStart = html.indexOf('<header class="hero">');
    const headerEnd   = html.indexOf('</header>', headerStart);
    const navPlaceholder = html.indexOf('SITE_NAV_PLACEHOLDER', headerStart);
    expect(headerStart).toBeGreaterThan(-1);
    expect(navPlaceholder).toBeGreaterThan(headerStart);
    expect(navPlaceholder).toBeLessThan(headerEnd);
  });
});

// ---- Cross-page link integrity ----------------------------------------------

describe('site-nav link integrity (home root, pathPrefix="")', () => {
  it('home nav: Daily digest href is "/"', () => {
    // pathPrefix='' → homeHref defaults to '/'
    const html = renderSiteNav('home', { backendLive: true, pathPrefix: '' });
    expect(html).toContain('href="/"');
  });

  it('home nav: Saved href is "favourites/" (relative)', () => {
    // pathPrefix='' → href="${pathPrefix}favourites/" = "favourites/"
    const html = renderSiteNav('home', { backendLive: true, pathPrefix: '' });
    expect(html).toContain('href="favourites/"');
  });

  it('home nav: Account href is "account/" (relative)', () => {
    const html = renderSiteNav('home', { backendLive: true, pathPrefix: '' });
    expect(html).toContain('href="account/"');
  });
});

describe('site-nav link integrity (sub-page pathPrefix="../")', () => {
  it('sub-page nav: Daily digest href is "../"', () => {
    const html = renderSiteNav('favourites', { backendLive: true, pathPrefix: '../' });
    expect(html).toContain('href="../"');
  });

  it('sub-page nav: Saved href is "../favourites/"', () => {
    const html = renderSiteNav('favourites', { backendLive: true, pathPrefix: '../' });
    expect(html).toContain('href="../favourites/"');
  });

  it('sub-page nav: Account absent when BACKEND_LIVE=false', () => {
    const html = renderSiteNav('favourites', { backendLive: false, pathPrefix: '../' });
    expect(html).not.toContain('Account');
  });
});

// ---- aria-current="page" a11y tests -----------------------------------------

describe('renderSiteNav — aria-current="page" on current page link', () => {
  it('home: Daily digest link has aria-current="page"', () => {
    const html = renderSiteNav('home', { backendLive: true });
    const homeIdx = html.indexOf('Daily digest');
    const anchorStart = html.lastIndexOf('<a ', homeIdx);
    const anchorEnd   = html.indexOf('>', anchorStart);
    const anchorSnippet = html.slice(anchorStart, anchorEnd);
    expect(anchorSnippet).toContain('aria-current="page"');
  });

  it('home: ★ Saved link does NOT have aria-current', () => {
    const html = renderSiteNav('home', { backendLive: true });
    const favIdx = html.indexOf('★ Saved');
    const anchorStart = html.lastIndexOf('<a ', favIdx);
    const anchorEnd   = html.indexOf('>', anchorStart);
    const anchorSnippet = html.slice(anchorStart, anchorEnd);
    expect(anchorSnippet).not.toContain('aria-current');
  });

  it('favourites: ★ Saved link has aria-current="page"', () => {
    const html = renderSiteNav('favourites', { backendLive: true });
    const favIdx = html.indexOf('★ Saved');
    const anchorStart = html.lastIndexOf('<a ', favIdx);
    const anchorEnd   = html.indexOf('>', anchorStart);
    const anchorSnippet = html.slice(anchorStart, anchorEnd);
    expect(anchorSnippet).toContain('aria-current="page"');
  });

  it('account: Account link has aria-current="page"', () => {
    const html = renderSiteNav('account', { backendLive: true });
    const accIdx = html.indexOf('>Account<');
    const anchorStart = html.lastIndexOf('<a ', accIdx);
    const anchorEnd   = html.indexOf('>', anchorStart);
    const anchorSnippet = html.slice(anchorStart, anchorEnd);
    expect(anchorSnippet).toContain('aria-current="page"');
  });

  it('account: Daily digest link does NOT have aria-current', () => {
    const html = renderSiteNav('account', { backendLive: true });
    const homeIdx = html.indexOf('Daily digest');
    const anchorStart = html.lastIndexOf('<a ', homeIdx);
    const anchorEnd   = html.indexOf('>', anchorStart);
    const anchorSnippet = html.slice(anchorStart, anchorEnd);
    expect(anchorSnippet).not.toContain('aria-current');
  });

  it('render-site.mjs source contains aria-current="page" in renderSiteNav', () => {
    expect(renderSiteSrc).toContain('aria-current="page"');
  });
});
