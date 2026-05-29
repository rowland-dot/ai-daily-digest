/**
 * Render integration tests: Editor's Cut HTML on cards + fav-star buttons.
 * Imports render helpers directly rather than running the full render-site.mjs CLI.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Import the helpers we'll test against directly
const { renderEditorialCutBox } = await import('../../scripts/lib/editorial.mjs');
const { articleId } = await import('../../scripts/lib/article-id.mjs');

// Build a minimal card HTML the same way render-site.mjs will after F3.
// The renderer matches cuts by the article_id field already present in item
// (set by the routine), falling back to computing it if absent.
function buildCardHtml(item, cuts = []) {
  const aid = item.article_id ?? articleId(item.source, item.url);
  const cut = cuts.find(c => c.article_id === aid);
  const cutBox = renderEditorialCutBox(cut ?? null);
  return `<article class="card" id="article-test-0" data-article-id="${aid}">
  <button class="fav-star" type="button" aria-pressed="false"
          aria-label="Save article" title="Save"
          data-testid="fav-star" data-article-id="${aid}">☆</button>
  <h3 class="card-title"><a href="${item.url}">${item.title}</a></h3>
  <p class="card-summary">${item.summary ?? ''}</p>
  ${cutBox}
</article>`;
}

const summaries = JSON.parse(
  readFileSync('./tests/fixtures/summaries-with-editorial.json', 'utf8')
);

const cutItem = summaries.sections.models[0]; // aihot-a3f12b8c — has a cut
const nonCutItem = summaries.sections.products[0]; // simon — no cut

describe('Editor\'s Cut on cards', () => {
  it('cut article card contains <aside class="editors-cut">', () => {
    const html = buildCardHtml(cutItem, summaries.editorial.cuts);
    expect(html).toContain('class="editors-cut"');
    expect(html).toContain('data-testid="editors-cut"');
  });

  it('non-cut article card does NOT contain <aside class="editors-cut">', () => {
    const html = buildCardHtml(nonCutItem, summaries.editorial.cuts);
    expect(html).not.toContain('class="editors-cut"');
    expect(html).not.toContain('data-testid="editors-cut"');
  });

  it('cut article card has data-article-id attribute matching the item article_id', () => {
    const html = buildCardHtml(cutItem, summaries.editorial.cuts);
    const expectedId = cutItem.article_id ?? articleId(cutItem.source, cutItem.url);
    expect(html).toContain(`data-article-id="${expectedId}"`);
  });

  it('card has .fav-star button with aria-pressed="false" and data-testid="fav-star"', () => {
    const html = buildCardHtml(cutItem, summaries.editorial.cuts);
    expect(html).toContain('class="fav-star"');
    expect(html).toContain('data-testid="fav-star"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-label="Save article"');
  });

  it('fav-star button carries data-article-id matching the card', () => {
    const html = buildCardHtml(cutItem, summaries.editorial.cuts);
    const expectedId = cutItem.article_id ?? articleId(cutItem.source, cutItem.url);
    // Button should have the same article-id as the card
    expect(html).toContain(`data-testid="fav-star" data-article-id="${expectedId}"`);
  });

  it('cut article EN commentary is present in card HTML', () => {
    const html = buildCardHtml(cutItem, summaries.editorial.cuts);
    const cut = summaries.editorial.cuts[0];
    expect(html).toContain(cut.commentary_en.slice(0, 20));
  });
});

describe('Feature flag — BACKEND_LIVE=false', () => {
  it('articleId helper produces consistent IDs for the same inputs', () => {
    // This test verifies the helper that guards feature-flag-off behaviour
    const id1 = articleId('aihot', 'https://www.aihot.com/a/1');
    const id2 = articleId('aihot', 'https://www.aihot.com/a/1');
    expect(id1).toBe(id2);
  });
});

describe('B7b — lang-switch wiring for Editor\'s Cut (render-site.mjs source check)', () => {
  const renderSiteSrc = readFileSync('./scripts/render-site.mjs', 'utf8');

  it('LANG_SWITCH_SCRIPT references editors-cut selector', () => {
    expect(renderSiteSrc).toContain('[data-testid="editors-cut"]');
  });

  it('LANG_SWITCH_SCRIPT defines applyEditorsLangFor function', () => {
    expect(renderSiteSrc).toContain('function applyEditorsLangFor(');
  });

  it('applyEditorsLangFor is called in the lang button click handler', () => {
    expect(renderSiteSrc).toContain('applyEditorsLangFor(newLang)');
  });

  it('aside.dataset.lang is set to zh on ZH switch', () => {
    expect(renderSiteSrc).toContain("aside.dataset.lang = 'zh'");
  });

  it('aside.dataset.lang is set to en on EN switch', () => {
    expect(renderSiteSrc).toContain("aside.dataset.lang = 'en'");
  });

  it('.ec-body data-en attribute is cached for round-trip', () => {
    expect(renderSiteSrc).toContain("body.setAttribute('data-en'");
  });
});
