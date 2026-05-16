/**
 * Editor's Cut commentary box HTML helper.
 * renderEditorialCutBox(cut | null) → HTML string matching mockups 23-26.
 *
 * States produced:
 *   - cut with both EN+ZH → data-mockup-state="editors-cut-cut-with-en-commentary"
 *   - cut with EN only    → data-mockup-state="editors-cut-cut-zh-fallback-to-en" (fallback tag)
 *   - null / undefined    → '' (mockup 26: no box rendered)
 */

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {object|null|undefined} cut
 *   { article_id, commentary_en, commentary_zh? }
 * @returns {string} HTML fragment or empty string
 */
export function renderEditorialCutBox(cut) {
  if (!cut) return '';

  const { commentary_en, commentary_zh } = cut;
  const hasZh = typeof commentary_zh === 'string' && commentary_zh.length > 0;
  const mockupState = hasZh
    ? 'editors-cut-cut-with-en-commentary'
    : 'editors-cut-cut-zh-fallback-to-en';

  const fallbackTag = hasZh
    ? ''
    : ' <span class="ec-fallback-tag">(English only today)</span>';

  // data-commentary-source names the currently visible source field key.
  // data-alt-source names the alternate source key (for JS lang switching).
  // The ZH text is embedded in data-zh on the body paragraph for JS swap.
  const altSourceAttr = hasZh ? ' data-alt-source="commentary_zh"' : '';
  const zhBodyAttr = hasZh ? ` data-zh="${escHtml(commentary_zh)}"` : '';

  return `<aside class="editors-cut" data-testid="editors-cut" data-lang="en" data-commentary-source="commentary_en"${altSourceAttr} data-mockup-state="${mockupState}">
  <span class="ec-label">🏅 Editor's Cut${fallbackTag}</span>
  <p class="ec-body"${zhBodyAttr}>${escHtml(commentary_en)}</p>
</aside>`;
}
