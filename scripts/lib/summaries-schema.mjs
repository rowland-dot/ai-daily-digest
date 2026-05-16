/**
 * summaries-schema.mjs — normaliser for the extended claude-summaries.json schema.
 *
 * normaliseSummaries(raw) → normalised copy with:
 *   - editorial.cuts[].commentary_zh_fallback = true when commentary_zh absent
 *   - translations defaulting to [] when absent
 *   - editorial block preserved unchanged when fully populated
 *   - Never mutates the input
 *
 * Token-budget fallback rules (per spec § Routine prompt extension):
 *   Drop order: commentary_zh first → overall_zh → never drop overall_en/commentary_en/translations
 *   The `commentary_zh_fallback` flag signals the renderer to show "(English only today)"
 *   matching mockup 25-editors-cut-cut-zh-fallback-to-en.html.
 */

/**
 * @param {object} raw - raw claude-summaries.json content
 * @returns {object} normalised copy (never mutates input)
 */
export function normaliseSummaries(raw) {
  // Shallow-clone to avoid mutating input
  const out = { ...raw };

  // Normalise translations — default to empty array
  out.translations = Array.isArray(raw.translations) ? raw.translations : [];

  // If no editorial block, leave it undefined and return
  if (!raw.editorial) {
    return out;
  }

  // Deep-clone editorial block
  const editorial = { ...raw.editorial };

  // Normalise cuts — set commentary_zh_fallback flag when ZH commentary absent
  if (Array.isArray(editorial.cuts)) {
    editorial.cuts = editorial.cuts.map(cut => {
      const hasZh = typeof cut.commentary_zh === 'string' && cut.commentary_zh.length > 0;
      if (hasZh) {
        // Both langs present — pass through unchanged
        return { ...cut };
      }
      // ZH missing — set fallback flag; renderer shows "(English only today)"
      const normalised = { ...cut };
      normalised.commentary_zh_fallback = true;
      // Leave commentary_zh as-is (null/undefined) — renderer uses fallback path
      return normalised;
    });
  } else {
    editorial.cuts = [];
  }

  out.editorial = editorial;
  return out;
}
