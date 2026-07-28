/**
 * Render tests: FAV_STAR_SCRIPT is wired into docs/index.html.
 *
 * Spec B2 ("Save an article (anonymous) [GH-Pages-live]") requires:
 *   - The fav-star inline script is always injected (GH Pages + Cloudflare).
 *   - The script targets [data-testid="fav-star"] buttons.
 *   - The script uses localStorage key 'favourites'.
 *   - When BACKEND_LIVE=true, the page also sets window.__BACKEND_LIVE__ = true
 *     before the fav-star script runs.
 *
 * These tests verify the render-site.mjs wiring at the source level (no
 * server needed — reads the script module + renderer source directly).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const { FAV_STAR_SCRIPT } = await import('../../scripts/lib/fav-star-script.mjs');
const renderSiteSrc = readFileSync('./scripts/render-site.mjs', 'utf8');

// ---------------------------------------------------------------------------
// FAV_STAR_SCRIPT content assertions
// ---------------------------------------------------------------------------

describe('FAV_STAR_SCRIPT — content', () => {
  it('is a non-empty string', () => {
    expect(typeof FAV_STAR_SCRIPT).toBe('string');
    expect(FAV_STAR_SCRIPT.length).toBeGreaterThan(200);
  });

  it('is valid executable browser JavaScript after template interpolation', () => {
    expect(() => new Function(FAV_STAR_SCRIPT)).not.toThrow();
  });

  it('targets fav-star buttons by data-testid', () => {
    expect(FAV_STAR_SCRIPT).toContain('data-testid');
    expect(FAV_STAR_SCRIPT).toContain('fav-star');
  });

  it('uses canonical localStorage key "favourites_v1"', () => {
    expect(FAV_STAR_SCRIPT).toContain("'favourites_v1'");
  });

  it('persists safe article metadata separately from the canonical ID array', () => {
    expect(FAV_STAR_SCRIPT).toContain("'favourites_meta_v1'");
    expect(FAV_STAR_SCRIPT).toContain('extractArticleMetadata');
    expect(FAV_STAR_SCRIPT).toContain('savedAt: new Date().toISOString()');
  });

  it('removes persisted metadata before announcing an unsave', () => {
    expect(FAV_STAR_SCRIPT).toMatch(/delete metadata\[aid\][\s\S]*writeMeta\(metadata\)[\s\S]*writeFavs\(favs\)/);
  });

  it('migrates the legacy "favourites" key once when canonical storage is absent', () => {
    expect(FAV_STAR_SCRIPT).toContain("LEGACY_LS_KEY = 'favourites'");
    expect(FAV_STAR_SCRIPT).toContain('localStorage.removeItem(LEGACY_LS_KEY)');
  });

  it('announces saved-ID changes so the favourites page can rerender after unsave', () => {
    expect(FAV_STAR_SCRIPT).toContain("new CustomEvent('favourites:changed'");
  });

  it('toggles aria-pressed between true and false', () => {
    expect(FAV_STAR_SCRIPT).toContain('aria-pressed');
    expect(FAV_STAR_SCRIPT).toContain("'true'");
    expect(FAV_STAR_SCRIPT).toContain("'false'");
  });

  it('uses filled star ★ unicode for saved state', () => {
    /* The script may use the escape \\u2605 or the literal ★ */
    const hasStar = FAV_STAR_SCRIPT.includes('\\u2605') || FAV_STAR_SCRIPT.includes('★');
    expect(hasStar).toBe(true);
  });

  it('uses hollow star ☆ unicode for unsaved state', () => {
    const hasStar = FAV_STAR_SCRIPT.includes('\\u2606') || FAV_STAR_SCRIPT.includes('☆');
    expect(hasStar).toBe(true);
  });

  it('reads localStorage on DOMContentLoaded to restore saved state', () => {
    const hasInit = FAV_STAR_SCRIPT.includes('DOMContentLoaded') ||
                    FAV_STAR_SCRIPT.includes('readyState');
    expect(hasInit).toBe(true);
  });

  it('guards against double-init with data-fav-star-init', () => {
    expect(FAV_STAR_SCRIPT).toContain('data-fav-star-init');
  });

  it('checks window.__BACKEND_LIVE__ before POSTing to server', () => {
    expect(FAV_STAR_SCRIPT).toContain('__BACKEND_LIVE__');
    expect(FAV_STAR_SCRIPT).toContain('/api/favourites');
  });

  it('sets data-syncing="true" during fetch', () => {
    expect(FAV_STAR_SCRIPT).toContain('data-syncing');
  });
});

// ---------------------------------------------------------------------------
// render-site.mjs wiring assertions
// ---------------------------------------------------------------------------

describe('render-site.mjs — FAV_STAR_SCRIPT wiring', () => {
  it('imports FAV_STAR_SCRIPT from ./lib/fav-star-script.mjs', () => {
    expect(renderSiteSrc).toContain('FAV_STAR_SCRIPT');
    expect(renderSiteSrc).toContain('fav-star-script.mjs');
  });

  it('injects FAV_STAR_SCRIPT as a <script> tag in the main page HTML', () => {
    /* Should appear as: <script>${FAV_STAR_SCRIPT}</script> */
    expect(renderSiteSrc).toContain('<script>${FAV_STAR_SCRIPT}</script>');
  });

  it('sets window.__BACKEND_LIVE__ = true before fav-star script when BACKEND_LIVE=true', () => {
    expect(renderSiteSrc).toContain('window.__BACKEND_LIVE__ = true');
    expect(renderSiteSrc).toContain('BACKEND_LIVE');
  });
});
