/**
 * articleId(source, url) — stable 8-char hex hash identifier for an article.
 * Format: "<source-lowercase>-<8-hex-chars>"
 * Uses FNV-1a 32-bit hash of the URL for stability and distribution.
 */

/**
 * FNV-1a 32-bit hash — deterministic, no external deps.
 * Returns a 32-bit unsigned integer.
 * @param {string} str
 * @returns {number}
 */
function fnv1a32(str) {
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // 32-bit multiply: hash * 0x01000193
    hash = (Math.imul(hash, 0x01000193) >>> 0);
  }
  return hash >>> 0;
}

/**
 * Produce a stable article ID from source name and URL.
 * @param {string} source - e.g. 'AIHOT', 'simon', 'github'
 * @param {string} url - the article's canonical URL
 * @returns {string} e.g. 'aihot-a3f12b8c'
 */
export function articleId(source, url) {
  const prefix = String(source).toLowerCase();
  const hash = fnv1a32(url).toString(16).padStart(8, '0');
  return `${prefix}-${hash}`;
}
