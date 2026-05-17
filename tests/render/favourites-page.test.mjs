/**
 * /favourites page rendering tests.
 *
 * Covers mockup states 09-16:
 *  09 — GH Pages, empty                (backendLive=false, savedArticles=[])
 *  10 — GH Pages, populated            (backendLive=false, savedArticles=[...])
 *  11 — Cloudflare, anonymous          (backendLive=true, auth='anonymous')
 *  12 — Cloudflare, linked             (backendLive=true, auth='linked')
 *  13 — sync-prompt collapsed panel    (server-rendered, visible)
 *  14 — sync-prompt open/email input   (server-rendered, initially hidden)
 *  15 — sync-prompt link-sent confirm  (server-rendered, initially hidden)
 *  16 — sync-prompt error panel        (server-rendered, initially hidden)
 *
 * H2 requirement: all four sync-prompt state panels must exist in the
 * server-rendered DOM (even if hidden) so client JS can toggle them and
 * mockup-parity / E2E tests can assert their presence.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderFavouritesPage, SYNC_PROMPT_SCRIPT } from '../../scripts/lib/favourites-page.mjs';

const renderSiteSrc = readFileSync('./scripts/render-site.mjs', 'utf8');

describe('renderFavouritesPage — BACKEND_LIVE=false (GH Pages)', () => {
  it('contains data-testid="favourites-page"', () => {
    const html = renderFavouritesPage({ backendLive: false, savedArticles: [] });
    expect(html).toContain('data-testid="favourites-page"');
  });

  it('has data-backend-live="false"', () => {
    const html = renderFavouritesPage({ backendLive: false, savedArticles: [] });
    expect(html).toContain('data-backend-live="false"');
  });

  it('does NOT contain data-testid="sync-prompt" when BACKEND_LIVE=false', () => {
    const html = renderFavouritesPage({ backendLive: false, savedArticles: [] });
    expect(html).not.toContain('data-testid="sync-prompt"');
  });

  it('does NOT contain data-testid="subscribe-form"', () => {
    const html = renderFavouritesPage({ backendLive: false, savedArticles: [] });
    expect(html).not.toContain('data-testid="subscribe-form"');
  });

  it('shows empty-state "No favourites yet" when no articles saved (mockup 09)', () => {
    const html = renderFavouritesPage({ backendLive: false, savedArticles: [] });
    expect(html).toContain('No favourites yet');
  });

  it('shows saved article cards when savedArticles provided (mockup 10)', () => {
    const articles = [
      { article_id: 'aihot-a3f12b8c', title: 'Claude 4.7 launches', url: 'https://x.com/1', source: 'AIHOT', savedAt: new Date().toISOString() },
    ];
    const html = renderFavouritesPage({ backendLive: false, savedArticles: articles });
    expect(html).toContain('Claude 4.7 launches');
    expect(html).toContain('data-testid="fav-star"');
  });

  it('does NOT show empty-state when articles are saved', () => {
    const articles = [
      { article_id: 'aihot-a3f12b8c', title: 'Claude 4.7 launches', url: 'https://x.com/1', source: 'AIHOT', savedAt: new Date().toISOString() },
    ];
    const html = renderFavouritesPage({ backendLive: false, savedArticles: articles });
    expect(html).not.toContain('No favourites yet');
  });
});

describe('renderFavouritesPage — BACKEND_LIVE=true (Cloudflare)', () => {
  it('includes sync-prompt wrapper when BACKEND_LIVE=true and anonymous (mockup 11)', () => {
    const html = renderFavouritesPage({ backendLive: true, auth: 'anonymous', savedArticles: [] });
    expect(html).toContain('data-testid="sync-prompt"');
  });

  it('has data-backend-live="true"', () => {
    const html = renderFavouritesPage({ backendLive: true, auth: 'anonymous', savedArticles: [] });
    expect(html).toContain('data-backend-live="true"');
  });

  it('sync-prompt has collapsed initial state (mockup 13)', () => {
    const html = renderFavouritesPage({ backendLive: true, auth: 'anonymous', savedArticles: [] });
    expect(html).toContain('data-testid="sync-prompt-open-btn"');
    expect(html).toContain('data-state="collapsed"');
  });

  it('linked user has no sync-prompt (mockup 12)', () => {
    const html = renderFavouritesPage({ backendLive: true, auth: 'linked', savedArticles: [] });
    expect(html).not.toContain('data-testid="sync-prompt"');
  });
});

describe('renderFavouritesPage — sync-prompt all four state panels present (H2)', () => {
  const html = renderFavouritesPage({ backendLive: true, auth: 'anonymous', savedArticles: [] });

  it('state 13 — collapsed panel DOM exists (data-testid="sync-prompt-collapsed-panel")', () => {
    expect(html).toContain('data-testid="sync-prompt-collapsed-panel"');
  });

  it('state 14 — open/email-input panel DOM exists (data-testid="sync-prompt-open-panel")', () => {
    expect(html).toContain('data-testid="sync-prompt-open-panel"');
  });

  it('state 14 — open panel has email input (data-testid="sync-email-input")', () => {
    expect(html).toContain('data-testid="sync-email-input"');
  });

  it('state 14 — open panel has send-link button (data-testid="sync-submit-btn")', () => {
    expect(html).toContain('data-testid="sync-submit-btn"');
  });

  it('state 14 — open panel is initially hidden (hidden attribute)', () => {
    // The open panel must start hidden so only collapsed is visible on load
    expect(html).toContain('data-testid="sync-prompt-open-panel" hidden');
  });

  it('state 15 — link-sent confirmation panel DOM exists (data-testid="sync-prompt-link-sent-panel")', () => {
    expect(html).toContain('data-testid="sync-prompt-link-sent-panel"');
  });

  it('state 15 — link-sent panel has data-form-state="link-sent"', () => {
    expect(html).toContain('data-form-state="link-sent"');
  });

  it('state 15 — link-sent panel is initially hidden', () => {
    expect(html).toContain('data-testid="sync-prompt-link-sent-panel"');
    // The hidden attribute must appear on this panel
    const panelIdx = html.indexOf('data-testid="sync-prompt-link-sent-panel"');
    const panelTag = html.slice(panelIdx - 50, panelIdx + 100);
    expect(panelTag).toContain('hidden');
  });

  it('state 16 — error panel DOM exists (data-testid="sync-prompt-error-panel")', () => {
    expect(html).toContain('data-testid="sync-prompt-error-panel"');
  });

  it('state 16 — error panel has error message (data-testid="sync-error-msg")', () => {
    expect(html).toContain('data-testid="sync-error-msg"');
  });

  it('state 16 — error panel has retry button (data-testid="sync-retry-btn")', () => {
    expect(html).toContain('data-testid="sync-retry-btn"');
  });

  it('state 16 — error panel is initially hidden', () => {
    expect(html).toContain('data-testid="sync-prompt-error-panel"');
    const panelIdx = html.indexOf('data-testid="sync-prompt-error-panel"');
    const panelTag = html.slice(panelIdx - 50, panelIdx + 100);
    expect(panelTag).toContain('hidden');
  });
});

describe('SYNC_PROMPT_SCRIPT — client behaviour wiring (H2)', () => {
  it('is a non-empty string', () => {
    expect(typeof SYNC_PROMPT_SCRIPT).toBe('string');
    expect(SYNC_PROMPT_SCRIPT.length).toBeGreaterThan(100);
  });

  it('targets sync-prompt wrapper by testid', () => {
    expect(SYNC_PROMPT_SCRIPT).toContain('sync-prompt');
  });

  it('handles open-btn click → setVisible("open")', () => {
    expect(SYNC_PROMPT_SCRIPT).toContain('sync-prompt-open-btn');
    expect(SYNC_PROMPT_SCRIPT).toContain("setVisible('open')");
  });

  it('POSTs to /api/sync-favourites', () => {
    expect(SYNC_PROMPT_SCRIPT).toContain('/api/sync-favourites');
    expect(SYNC_PROMPT_SCRIPT).toContain("method: 'POST'");
  });

  it('handles success → setVisible("link-sent")', () => {
    expect(SYNC_PROMPT_SCRIPT).toContain("setVisible('link-sent')");
  });

  it('handles network error → setVisible("error")', () => {
    expect(SYNC_PROMPT_SCRIPT).toContain("setVisible('error')");
  });

  it('handles retry form submit → setVisible("open")', () => {
    expect(SYNC_PROMPT_SCRIPT).toContain('sync-form-error');
    expect(SYNC_PROMPT_SCRIPT).toContain("setVisible('open')");
  });
});

describe('render-site.mjs — SYNC_PROMPT_SCRIPT wired at favourites write site', () => {
  it('imports SYNC_PROMPT_SCRIPT from favourites-page.mjs', () => {
    expect(renderSiteSrc).toContain('SYNC_PROMPT_SCRIPT');
    expect(renderSiteSrc).toContain('favourites-page.mjs');
  });

  it('injectFavouritesScripts function is defined', () => {
    expect(renderSiteSrc).toContain('function injectFavouritesScripts(html)');
  });

  it('SYNC_SCRIPT_PLACEHOLDER constant is defined', () => {
    expect(renderSiteSrc).toContain('SYNC_SCRIPT_PLACEHOLDER');
    expect(renderSiteSrc).toContain('SYNC_PROMPT_SCRIPT_PLACEHOLDER');
  });

  it('favourites write call uses injectFavouritesScripts', () => {
    expect(renderSiteSrc).toContain('injectFavouritesScripts(renderFavouritesPage(');
  });
});
