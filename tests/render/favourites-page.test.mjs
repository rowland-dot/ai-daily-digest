import { describe, it, expect } from 'vitest';
import { renderFavouritesPage } from '../../scripts/lib/favourites-page.mjs';

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
  it('includes sync-prompt shell when BACKEND_LIVE=true and anonymous (mockup 11)', () => {
    const html = renderFavouritesPage({ backendLive: true, auth: 'anonymous', savedArticles: [] });
    expect(html).toContain('data-testid="sync-prompt"');
  });

  it('has data-backend-live="true"', () => {
    const html = renderFavouritesPage({ backendLive: true, auth: 'anonymous', savedArticles: [] });
    expect(html).toContain('data-backend-live="true"');
  });

  it('sync-prompt has collapsed initial state', () => {
    const html = renderFavouritesPage({ backendLive: true, auth: 'anonymous', savedArticles: [] });
    expect(html).toContain('data-testid="sync-prompt-open-btn"');
    expect(html).toContain('data-state="collapsed"');
  });

  it('linked user has no sync-prompt (mockup 12)', () => {
    const html = renderFavouritesPage({ backendLive: true, auth: 'linked', savedArticles: [] });
    expect(html).not.toContain('data-testid="sync-prompt"');
  });
});
