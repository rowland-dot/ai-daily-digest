/**
 * Shared date utilities for render helpers.
 * These functions are also used directly in scripts/render-site.mjs.
 */

export const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Parse anything we get from feeds into a Date or null:
 *  - ISO 8601 strings (`2026-05-13T06:19:47.000Z`)
 *  - RFC 1123 (`Tue, 13 May 2026 06:19:47 GMT`)
 *  - Unix epoch seconds (number or numeric string)
 */
export function parseAnyDate(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return parseAnyDate(parseInt(s, 10));
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Human-readable relative time, baked into HTML at render time.
 * Anchor is the moment the page is built, so static archive pages
 * preserve "2h ago" wording from the day they were generated.
 */
export function relTime(v, now = Date.now()) {
  const d = parseAnyDate(v);
  if (!d) return "";
  const diff = Math.round((now - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) {
    const m = Math.round(diff / 60);
    return `${m}m ago`;
  }
  if (diff < 86400) {
    const h = Math.round(diff / 3600);
    return `${h}h ago`;
  }
  if (diff < 86400 * 7) {
    const days = Math.round(diff / 86400);
    return days === 1 ? "yesterday" : `${days}d ago`;
  }
  const sameYear = d.getUTCFullYear() === new Date(now).getUTCFullYear();
  const m = MONTH_ABBR[d.getUTCMonth()];
  return sameYear ? `${m} ${d.getUTCDate()}` : `${m} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
