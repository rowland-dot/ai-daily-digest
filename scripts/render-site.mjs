// Renders bridged JSON snapshots into a static HTML site with two themes:
//   - linear  (dark, modernist, lavender accent)
//   - claude  (warm cream, coral accent, serif display)
//
// Default theme follows the OS dark/light setting; user can override via
// the header toggle, persisted to localStorage.
//
// Inputs:  data/*.json
// Outputs: docs/index.html, docs/digests/YYYY-MM-DD.html, docs/digests/index.html

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = "data";
const SITE_DIR = "docs";
const DIGESTS_DIR = join(SITE_DIR, "digests");

async function tryReadJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toUTCString().replace(" GMT", " UTC");
}

function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toISOString().slice(0, 10);
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Parse anything we get from feeds into a Date or null:
//  - ISO 8601 strings (`2026-05-13T06:19:47.000Z`)
//  - RFC 1123 (`Tue, 13 May 2026 06:19:47 GMT`)
//  - Unix epoch seconds (Reddit's `created_utc`, number or numeric string)
function parseAnyDate(v) {
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

// Human-readable relative time, baked into the HTML at render time.
// Anchor is the moment we build the page, so static archive pages
// preserve "2h ago" wording from the day they were generated.
function relTime(v, now = Date.now()) {
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

// Date-window filter. Returns true if `value` (ISO string or Unix epoch
// seconds) falls within the last `hours` hours. Items missing a parsable
// date are kept (defensive — we'd rather over-include than silently drop).
const LOOKBACK_HOURS = 24;
function withinWindow(value, hours = LOOKBACK_HOURS) {
  if (value == null) return true;
  let ms;
  if (typeof value === "number") {
    ms = value > 1e12 ? value : value * 1000;  // accept seconds or ms
  } else {
    ms = Date.parse(String(value));
  }
  if (Number.isNaN(ms)) return true;
  return Date.now() - ms <= hours * 3600 * 1000;
}

function filterRecent(items, dateKey, hours = LOOKBACK_HOURS) {
  if (!Array.isArray(items)) return [];
  return items.filter((it) => withinWindow(it?.[dateKey], hours));
}

function googleTranslateUrl(text) {
  return `https://translate.google.com/?sl=zh-CN&tl=en&op=translate&text=${encodeURIComponent(text)}`;
}

// ---- Section builders ----

function aihotItemsCard(items, anchorPrefix) {
  if (!items?.length) return `<p class="empty">No items.</p>`;
  return `<div class="cards">${items
    .map(
      (item, idx) => `
    <article class="card" id="article-${anchorPrefix}-${idx}">
      <h3 class="card-title"${txAttrs(item.title || "")}>${escapeHtml(item.title || "")}</h3>
      ${item.summary ? `<p class="card-summary"${txAttrs(item.summary)}>${escapeHtml(item.summary)}</p>` : ""}
      <div class="card-meta">
        ${item.source ? `<span class="badge">${escapeHtml(item.source)}</span>` : ""}
        ${item.publishedAt ? `<span class="meta-time" title="${escapeHtml(item.publishedAt)}">${escapeHtml(relTime(item.publishedAt))}</span>` : ""}
      </div>
      <div class="card-actions">
        ${item.url ? `<a class="primary-link" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Read original ↗</a>` : ""}
        ${item.title || item.summary ? `<a class="secondary-link" href="${googleTranslateUrl(`${item.title}\n\n${item.summary || ""}`)}" target="_blank" rel="noopener">Translate EN ↗</a>` : ""}
      </div>
    </article>
  `,
    )
    .join("")}</div>`;
}

function ghTrendingSection(repos) {
  if (!repos.length) return ``;
  return `<div class="cards">${repos
    .map(
      (r, idx) => `
    <article class="card gh-card" id="article-trending-${idx}">
      <h3 class="card-title">
        <a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">
          <span class="gh-owner">${escapeHtml(r.owner || "")}</span>
          <span class="gh-slash">/</span>
          <span class="gh-name">${escapeHtml(r.name || "")}</span>
        </a>
      </h3>
      ${r.description ? `<p class="card-summary">${escapeHtml(r.description)}</p>` : ""}
      <div class="gh-meta">
        ${r.language ? `<span class="gh-lang"><span class="gh-dot" style="background:${escapeHtml(r.languageColor || "#888")}"></span>${escapeHtml(r.language)}</span>` : ""}
        ${r.stars != null ? `<span class="stat">★ ${r.stars.toLocaleString()}</span>` : ""}
        ${r.starsToday ? `<span class="stat-today">+${r.starsToday.toLocaleString()} today</span>` : ""}
      </div>
    </article>
  `,
    )
    .join("")}</div>`;
}

const OTHER_CAP = 16;

// (Hacker News section removed — see commit log. AIHOT/OpenAI/Simon/
// GitHub Trending/HuggingFace/Follow Builders cover the same signal
// with curated content instead of HN's broad front-page firehose.)

function hfSection(models) {
  if (!models.length) return ``;
  return `<div class="cards">${models
    .map(
      (m, idx) => `
    <article class="card hf-card" id="article-hf-${idx}">
      <h3 class="card-title"><a href="https://huggingface.co/${escapeHtml(m.id || "")}" target="_blank" rel="noopener">${escapeHtml(m.id || "")}</a></h3>
      <div class="hf-stats">
        <span class="stat">♥ ${m.likes ?? 0}</span>
        <span class="stat">↓ ${(m.downloads ?? 0).toLocaleString()}</span>
        ${m.pipeline_tag ? `<span class="badge">${escapeHtml(m.pipeline_tag)}</span>` : ""}
      </div>
      ${m.tags?.length ? `<div class="hf-tags">${m.tags.slice(0, 5).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
    </article>
  `,
    )
    .join("")}</div>`;
}

function labBlogSection(items) {
  if (!items.length) return ``;
  return `<div class="cards">${items
    .map(
      (it, idx) => `
    <article class="card" id="article-labs-${idx}">
      <h3 class="card-title"><a href="${escapeHtml(it.link)}" target="_blank" rel="noopener"${txAttrs(it.title)}>${escapeHtml(it.title)}</a></h3>
      ${it.description ? `<p class="card-summary"${txAttrs(it.description)}>${escapeHtml(it.description)}</p>` : ""}
      <div class="card-meta">
        <span class="badge">OpenAI</span>
        ${it.pubDate ? `<span class="meta-time" title="${escapeHtml(it.pubDate)}">${escapeHtml(relTime(it.pubDate))}</span>` : ""}
      </div>
    </article>
  `,
    )
    .join("")}</div>`;
}

function builderWritingSection(entries) {
  if (!entries.length) return ``;
  return `<ul class="writing-list">${entries
    .map(
      (e, idx) => `
    <li class="writing-item" id="article-writing-${idx}">
      <a class="writing-title" href="${escapeHtml(e.link)}" target="_blank" rel="noopener"${txAttrs(e.title)}>${escapeHtml(e.title)}</a>
      ${e.summary ? `<p class="writing-summary"${txAttrs(e.summary)}>${escapeHtml(e.summary)}</p>` : ""}
      <div class="writing-meta">
        <span>Simon Willison</span>
        ${e.updated ? `<span title="${escapeHtml(e.updated)}">· ${escapeHtml(relTime(e.updated))}</span>` : ""}
      </div>
    </li>
  `,
    )
    .join("")}</ul>`;
}

function localLlamaSection(posts) {
  if (!posts.length) return ``;
  return `<ul class="writing-list">${posts
    .map(
      (p, idx) => `
    <li class="writing-item" id="article-llama-${idx}">
      <a class="writing-title" href="${escapeHtml(p.permalink)}" target="_blank" rel="noopener"${txAttrs(p.title)}>${escapeHtml(p.title || "(untitled)")}</a>
      ${p.summary ? `<p class="writing-summary"${txAttrs(p.summary)}>${escapeHtml(p.summary)}</p>` : ""}
      <div class="writing-meta">
        <span>r/LocalLLaMA</span>
        ${p.author ? `<span>· ${escapeHtml(p.author)}</span>` : ""}
        ${p.sourceLabel ? `<span>· ${escapeHtml(p.sourceLabel)}</span>` : ""}
        ${p.updated ? `<span title="${escapeHtml(p.updated)}">· ${escapeHtml(relTime(p.updated))}</span>` : ""}
      </div>
    </li>
  `,
    )
    .join("")}</ul>`;
}

function followBuildersSection(xItems, podItems, blogItems) {
  const renderTweet = (t, idx) => {
    const fullText = t.text || "";
    const text = fullText.slice(0, 240) + (fullText.length > 240 ? "…" : "");
    return `
      <li class="builder-item" id="article-builders-x-${idx}">
        <div class="builder-meta-top">
          <strong>${escapeHtml(t.author || "")}</strong>
          ${t.handle ? `<span class="muted">@${escapeHtml(t.handle)}</span>` : ""}
        </div>
        <p class="builder-text"${txAttrs(fullText)}>${escapeHtml(text)}</p>
        <div class="builder-meta">
          ${typeof t.likes === "number" ? `<span>♥ ${t.likes}</span>` : ""}
          ${typeof t.retweets === "number" ? `<span>↻ ${t.retweets}</span>` : ""}
          ${t.url ? `<a href="${escapeHtml(t.url)}" target="_blank" rel="noopener">View on X ↗</a>` : ""}
        </div>
      </li>
    `;
  };

  const renderPostOrEpisode = (item, kind, idx) => `
    <li class="builder-item" id="article-builders-${kind === "podcast" ? "pod" : "blog"}-${idx}">
      <a class="builder-title" href="${escapeHtml(item.url || "#")}" target="_blank" rel="noopener"${txAttrs(item.title || "")}>${escapeHtml(item.title || "(untitled)")}</a>
      <div class="builder-meta">
        ${item.name ? `<span>${escapeHtml(item.name)}</span>` : ""}
        ${item.publishedAt ? `<span title="${escapeHtml(item.publishedAt)}"> · ${escapeHtml(relTime(item.publishedAt))}</span>` : ""}
        ${kind === "podcast" ? `<span class="badge">podcast</span>` : ""}
      </div>
    </li>
  `;

  const part = (label, html) =>
    html
      ? `<div class="builder-group"><h3 class="builder-group-title">${label}</h3><ul class="builder-list">${html}</ul></div>`
      : "";

  const out = [
    part("X / Twitter", xItems.map(renderTweet).join("")),
    part("Podcasts", podItems.map((p, i) => renderPostOrEpisode(p, "podcast", i)).join("")),
    part("Blogs", blogItems.map((b, i) => renderPostOrEpisode(b, "blog", i)).join("")),
  ]
    .filter(Boolean)
    .join("");

  return out || `<p class="empty">No items in the lookback window.</p>`;
}

// ---- Themes ----
// One CSS block defines BOTH themes via [data-theme="linear"] and [data-theme="claude"].
// The <html> element starts with no data-theme; a tiny inline script sets it based on
// localStorage or prefers-color-scheme before paint, so there's no flash.

const PAGE_CSS = `
  /* Linear (dark, modernist) — applied when data-theme="linear" */
  [data-theme="linear"] {
    --bg: #010102;
    --surface: #0f1011;
    --surface-2: #141516;
    --surface-3: #18191a;
    --text: #f7f8f8;
    --text-muted: #8a8f98;
    --text-tertiary: #62666d;
    --border: #23252a;
    --border-strong: #34343a;
    --accent: #5e6ad2;
    --accent-hover: #828fff;
    --accent-soft: rgba(94, 106, 210, 0.12);
    --link: #828fff;
    --link-hover: #b0b9ff;
    --shadow: 0 1px 2px rgba(0,0,0,0.4), 0 4px 8px rgba(0,0,0,0.25);
    --display-font: 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
    --body-font: 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif;
    --tracking-tight: -0.02em;
    --hero-bg: linear-gradient(180deg, #18191a 0%, #010102 100%);
    --hero-text: #f7f8f8;
    --hero-accent: #5e6ad2;
    --radius: 8px;
    --radius-lg: 12px;
  }

  /* Claude (warm cream, editorial) — applied when data-theme="claude" */
  [data-theme="claude"] {
    --bg: #faf9f5;
    --surface: #ffffff;
    --surface-2: #efe9de;
    --surface-3: #f5f0e8;
    --text: #141413;
    --text-muted: #6c6a64;
    --text-tertiary: #8e8b82;
    --border: #e6dfd8;
    --border-strong: #d4cdc4;
    --accent: #cc785c;
    --accent-hover: #a9583e;
    --accent-soft: rgba(204, 120, 92, 0.10);
    --link: #a9583e;
    --link-hover: #8b4530;
    --shadow: 0 1px 2px rgba(20,20,19,0.04), 0 4px 12px rgba(20,20,19,0.05);
    --display-font: 'Copernicus', Georgia, 'Tiempos Headline', serif;
    --body-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif;
    --tracking-tight: -0.01em;
    --hero-bg: linear-gradient(135deg, #efe9de 0%, #faf9f5 100%);
    --hero-text: #141413;
    --hero-accent: #cc785c;
    --radius: 10px;
    --radius-lg: 14px;
  }

  * { box-sizing: border-box; min-width: 0; }
  html, body {
    margin: 0;
    padding: 0;
    /* Prevent any descendant overflow from causing horizontal page scroll.
       Use overflow-x: clip (not hidden) — clip doesn't create a new scroll
       context, so sticky nav still pins correctly. */
    overflow-x: clip;
    max-width: 100vw;
  }
  body {
    font-family: var(--body-font);
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
    transition: background-color 0.15s ease, color 0.15s ease;
    /* Force long unbroken strings (URLs, model IDs like "meta-llama/...")
       to wrap rather than push the layout wide on mobile. */
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  a { color: var(--link); text-decoration: none; overflow-wrap: anywhere; }
  a:hover { color: var(--link-hover); text-decoration: underline; }
  img, svg, video { max-width: 100%; height: auto; }
  .container { max-width: 1020px; margin: 0 auto; padding: 24px 20px; width: 100%; }

  /* Header */
  header.hero {
    background: var(--hero-bg);
    color: var(--hero-text);
    padding: 56px 20px 44px;
    text-align: center;
    border-bottom: 1px solid var(--border);
    position: relative;
  }
  header.hero h1 {
    margin: 0 0 8px;
    font-family: var(--display-font);
    font-size: clamp(32px, 5.5vw, 48px);
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
    line-height: 1.05;
  }
  header.hero .date {
    font-size: 16px;
    color: var(--text-muted);
    font-weight: 500;
    margin-top: 6px;
  }
  header.hero .tagline {
    margin-top: 16px;
    font-size: 14px;
    color: var(--text-muted);
    max-width: 580px;
    margin-left: auto;
    margin-right: auto;
    line-height: 1.55;
  }
  .theme-switch,
  .lang-switch {
    position: absolute;
    top: 14px;
    display: inline-flex;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 3px;
    font-size: 12px;
    font-weight: 500;
    box-shadow: var(--shadow);
    max-width: calc(100vw - 28px);
  }
  .theme-switch { right: 14px; }
  .lang-switch  { left: 14px; }
  .lang-switch button {
    background: transparent;
    border: 0;
    color: var(--text-muted);
    padding: 5px 10px;
    border-radius: 999px;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    transition: all 0.12s ease;
  }
  .lang-switch button[aria-pressed="true"] {
    background: var(--accent);
    color: #fff;
  }
  @media (max-width: 480px) {
    header.hero { padding-top: 70px; }
    .theme-switch { font-size: 11px; }
    .theme-switch button { padding: 4px 8px; }
  }
  .theme-switch button {
    background: transparent;
    border: 0;
    color: var(--text-muted);
    padding: 5px 10px;
    border-radius: 999px;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    font-weight: inherit;
    transition: all 0.12s ease;
  }
  .theme-switch button[aria-pressed="true"] {
    background: var(--accent);
    color: #fff;
  }

  /* TOC */
  nav.toc {
    position: sticky;
    top: 0;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    padding: 10px 0;
    z-index: 10;
    backdrop-filter: saturate(180%) blur(8px);
  }
  nav.toc ul {
    list-style: none; padding: 0; margin: 0;
    display: flex; gap: 6px; flex-wrap: wrap; justify-content: center;
  }
  nav.toc a {
    padding: 5px 11px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text);
  }
  nav.toc a:hover { background: var(--accent-soft); border-color: var(--accent); text-decoration: none; }
  nav.toc a.toc-active {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--surface);
    box-shadow: 0 1px 6px var(--accent-soft);
  }
  nav.toc a.toc-active:hover { background: var(--accent); color: var(--surface); }

  /* Sections — scroll-margin-top reserves space for the sticky TOC so
     clicking a TOC link doesn't bury the section's H2 under the nav.
     :first-of-type drops its own top margin so the gap below the nav
     bar matches the inter-section gap instead of doubling up. */
  section.block { margin: 44px 0; scroll-margin-top: 64px; }
  section.block:first-of-type { margin-top: 0; }
  @media (max-width: 600px) {
    section.block { scroll-margin-top: 140px; }
  }
  section.block h2 {
    font-family: var(--display-font);
    font-size: 26px;
    margin: 0 0 4px;
    font-weight: 700;
    letter-spacing: var(--tracking-tight);
    display: flex;
    align-items: center;
    gap: 12px;
  }
  section.block .section-icon { font-size: 28px; }
  section.block .section-sub {
    color: var(--text-muted);
    font-size: 14px;
    margin: 0 0 22px;
  }

  /* Cards */
  .cards { display: grid; grid-template-columns: 1fr; gap: 14px; }
  @media (min-width: 720px) { .cards { grid-template-columns: 1fr 1fr; } }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 18px;
    box-shadow: var(--shadow);
    display: flex; flex-direction: column; gap: 10px;
    transition: border-color 0.12s ease, transform 0.12s ease;
  }
  .card:hover { border-color: var(--border-strong); }
  .card-title { margin: 0; font-size: 16px; line-height: 1.4; font-weight: 600; font-family: var(--display-font); letter-spacing: -0.005em; }
  .card-title a { color: var(--text); }
  .card-title a:hover { color: var(--link); }
  .card-summary { margin: 0; color: var(--text-muted); font-size: 14px; line-height: 1.55; }
  .card-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .badge { background: var(--accent-soft); color: var(--accent); padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .meta-time { color: var(--text-tertiary); font-size: 12px; }
  .card-actions { display: flex; gap: 12px; margin-top: auto; padding-top: 10px; border-top: 1px solid var(--border); }
  .primary-link { font-weight: 600; font-size: 13px; }
  .secondary-link { font-size: 13px; color: var(--text-muted); }

  /* GH trending */
  .gh-card .card-title a { display: inline-flex; align-items: baseline; gap: 0; }
  .gh-owner { color: var(--text-muted); font-weight: 500; }
  .gh-slash { color: var(--text-tertiary); margin: 0 4px; }
  .gh-name { color: var(--accent); font-weight: 700; }
  .gh-meta { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; font-size: 13px; color: var(--text-muted); margin-top: auto; padding-top: 10px; border-top: 1px solid var(--border); }
  .gh-lang { display: inline-flex; align-items: center; gap: 6px; }
  .gh-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .stat { color: var(--text); font-weight: 500; }
  .stat-today { color: var(--accent); font-weight: 600; }

  /* HN list */
  .hn-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
  .hn-item { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; box-shadow: var(--shadow); }
  .hn-title { font-weight: 600; font-size: 15px; color: var(--text); display: block; margin-bottom: 4px; }
  .hn-title:hover { color: var(--link); }
  .hn-summary { color: var(--text-muted); font-size: 13.5px; line-height: 1.55; margin: 4px 0 8px; }
  .hn-meta { color: var(--text-muted); font-size: 12.5px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .hn-comments { margin-left: 4px; font-weight: 500; }

  /* HF */
  .hf-stats { display: flex; gap: 10px; align-items: center; font-size: 13px; color: var(--text-muted); flex-wrap: wrap; }
  .hf-stats .stat { font-weight: 500; color: var(--text); }
  .hf-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .tag { background: var(--surface-2); color: var(--text); padding: 2px 8px; border-radius: 4px; font-size: 11px; opacity: 0.85; }

  /* Builder voices */
  .builder-group { margin-bottom: 24px; }
  .builder-group-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.10em; color: var(--text-muted); font-weight: 700; margin: 0 0 12px; }
  .builder-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
  .builder-item { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
  .builder-title { font-size: 14px; font-weight: 600; color: var(--text); display: block; }
  .builder-title:hover { color: var(--link); }
  .builder-meta { color: var(--text-muted); font-size: 12px; margin-top: 6px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .builder-meta-top { font-size: 14px; margin-bottom: 6px; }
  .builder-meta-top .muted { color: var(--text-muted); font-weight: 400; margin-left: 4px; }
  .builder-text { font-size: 14px; line-height: 1.55; color: var(--text); margin: 0; }

  /* Builder writing (Simon Willison) */
  .writing-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
  .writing-item { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; }
  .writing-title { display: block; font-family: var(--display-font); font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 6px; letter-spacing: -0.005em; }
  .writing-title:hover { color: var(--link); }
  .writing-summary { color: var(--text-muted); font-size: 13.5px; line-height: 1.6; margin: 4px 0; }
  .writing-meta { color: var(--text-tertiary); font-size: 12px; display: flex; flex-wrap: wrap; gap: 4px 6px; row-gap: 2px; }
  .writing-meta > span { white-space: nowrap; }

  .empty { color: var(--text-muted); font-style: italic; }

  /* Audio "now playing" highlight — applied to whichever article element
     matches the current cue. Subtle accent ring + slight surface bump. */
  .now-playing {
    outline: 2px solid var(--accent);
    outline-offset: 4px;
    transition: outline 0.2s ease;
    scroll-margin-top: 70px;
  }
  @media (max-width: 600px) {
    .now-playing { scroll-margin-top: 150px; }
  }

  /* Click-to-seek on article cards. JS adds .audio-seekable to any
     article whose id matches an audio cue and attaches a "▶ Listen
     from here" button. Only the button seeks; the rest of the card
     remains a normal text-selectable area. */
  .audio-seekable { position: relative; }
  .audio-seekable .seek-hint {
    position: absolute;
    top: 8px; right: 8px;
    background: var(--accent);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 9px;
    border-radius: 999px;
    border: none;
    cursor: pointer;
    opacity: 0;
    transform: translateY(-4px);
    transition: opacity 0.15s ease, transform 0.15s ease, background 0.15s ease;
    z-index: 1;
    white-space: nowrap;
    font-family: inherit;
  }
  /* Button is visible only when the user is interacting with THIS card:
     - desktop: pointer hover or keyboard focus
     - mobile: tapped card or card centered in the viewport
       (the JS adds .is-focused based on tap + IntersectionObserver). */
  .audio-seekable:hover .seek-hint,
  .audio-seekable:focus-within .seek-hint,
  .audio-seekable.is-focused .seek-hint,
  .seek-hint:focus-visible {
    opacity: 1;
    transform: translateY(0);
  }
  .seek-hint:hover { background: var(--accent-strong, var(--accent)); filter: brightness(1.08); }

  /* Floating mini-player (bottom-right).
     Each element has a fixed pixel width per breakpoint so nothing
     reflows as the viewport changes or as the user interacts. */
  .audio-fab {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 50;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    box-shadow: 0 6px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.10);
    font-family: var(--body-font);
    /* Suppress text selection during scrubber drag (otherwise the page
       selects the time label / buttons text on every mousemove). */
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  /* Collapsed: just the round handle */
  .audio-fab[data-expanded="false"] {
    width: 56px;
    height: 56px;
    padding: 0;
    cursor: pointer;
  }
  .audio-fab[data-expanded="false"] .audio-fab-body { display: none; }
  .audio-fab[data-expanded="false"] .audio-fab-handle {
    width: 56px; height: 56px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    background: var(--accent);
    color: #fff;
    font-size: 22px;
  }
  /* Expanded: fluid row, sizes to its content + available viewport.
     min-width is desktop-only (applied via media query below) — on
     narrow screens it would force the FAB wider than the viewport. */
  .audio-fab[data-expanded="true"] {
    display: flex;
    align-items: center;
    padding: 6px 8px 6px 8px;
    height: 52px;
    max-width: calc(100vw - 16px);
  }
  @media (min-width: 600px) {
    .audio-fab[data-expanded="true"] { min-width: 400px; }
  }
  .audio-fab[data-expanded="true"] .audio-fab-handle {
    width: 36px; height: 36px;
    flex: 0 0 36px;
    margin-right: 8px;
    border-radius: 50%;
    background: var(--accent);
    color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 16px;
  }
  .audio-fab-body {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: nowrap;
    flex: 1 1 auto;
    min-width: 0;
  }
  /* Hide the native <audio> element entirely. We use our own play/scrubber
     UI below so no browser-specific kebab / volume / overflow ever shows. */
  .audio-fab audio {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
  /* Custom audio controls — play/pause + scrubber + time (fluid) */
  .audio-track {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 auto;
    min-width: 0;
    height: 36px;
  }
  .play-btn {
    width: 28px;
    height: 28px;
    flex: 0 0 28px;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    cursor: pointer;
    font-size: 11px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    font-family: inherit;
    transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
  }
  .play-btn:hover { background: var(--border-strong); }
  .play-btn:active { transform: scale(0.95); }
  .scrubber {
    flex: 1 1 auto;
    height: 18px;                 /* outer hit-area for easy click/drag */
    background: transparent;
    position: relative;
    cursor: pointer;
    display: flex;
    align-items: center;
    min-width: 0;
    touch-action: none;           /* prevent native pan during drag */
  }
  .scrubber::before {
    /* The visible track */
    content: "";
    position: absolute;
    left: 0; right: 0;
    top: 50%;
    transform: translateY(-50%);
    height: 6px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    pointer-events: none;
  }
  .scrubber-fill {
    position: absolute;
    left: 0; right: 100%;          /* width set in JS via right = 100% - pct */
    top: 50%;
    transform: translateY(-50%);
    height: 6px;
    background: var(--accent);
    border-radius: 999px;
    pointer-events: none;
  }
  .scrubber-thumb {
    position: absolute;
    top: 50%;
    left: 0;                       /* JS sets left = pct */
    transform: translate(-50%, -50%);
    width: 14px;
    height: 14px;
    background: var(--accent);
    border-radius: 50%;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    pointer-events: none;
    transition: transform 0.1s ease;
  }
  .scrubber:hover .scrubber-thumb { transform: translate(-50%, -50%) scale(1.15); }
  .time-label {
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .speed-btn {
    background: var(--surface-2);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 0;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
    height: 32px;
    width: 44px;
    flex: 0 0 44px;        /* fixed speed-button width */
    text-align: center;
    transition: background 0.12s ease, color 0.12s ease, border-color 0.12s ease;
  }
  .speed-btn:hover { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
  .speed-btn:active { transform: scale(0.96); }
  .audio-fab .close-btn {
    background: transparent;
    border: 0;
    color: var(--text-muted);
    font-size: 16px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    width: 24px;
    height: 32px;
    flex: 0 0 24px;        /* fixed close-button width */
    text-align: center;
  }
  .audio-fab .close-btn:hover { color: var(--text); }
  .audio-fab .no-audio-msg {
    color: var(--text-muted);
    font-size: 12px;
    width: 180px;
    flex: 0 0 180px;
    text-align: center;
  }
  /* Mobile (<= 600px): pull the FAB closer to the edges so the fluid
     layout uses every available pixel. */
  @media (max-width: 600px) {
    .audio-fab[data-expanded="true"] {
      right: 8px;
      bottom: 8px;
      width: calc(100vw - 16px);
      padding-left: 8px;
      padding-right: 6px;
    }
    .audio-fab .no-audio-msg {
      flex: 1 1 auto;
      width: auto;
    }
  }
  @media (max-width: 360px) {
    .audio-fab[data-expanded="true"] .audio-fab-handle {
      width: 32px; height: 32px;
      flex: 0 0 32px;
      margin-right: 6px;
      font-size: 14px;
    }
  }

  /* Footer */
  footer.site-footer { margin-top: 56px; padding: 28px 20px 48px; border-top: 1px solid var(--border); color: var(--text-muted); font-size: 13px; text-align: center; }
  footer.site-footer .source-status { margin-top: 10px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
  .status-ok { color: #16a34a; }
  .status-err { color: #dc2626; }
`;

// Inline script that sets data-theme BEFORE paint to avoid flash.
const THEME_BOOT_SCRIPT = `
  (function() {
    try {
      var saved = localStorage.getItem('digest-theme');
      var theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'linear' : 'claude');
      document.documentElement.setAttribute('data-theme', theme);
    } catch (e) {
      document.documentElement.setAttribute('data-theme', 'claude');
    }
  })();
`;

const THEME_TOGGLE_SCRIPT = `
  (function() {
    var btns = document.querySelectorAll('.theme-switch button');
    function setTheme(t) {
      document.documentElement.setAttribute('data-theme', t);
      try { localStorage.setItem('digest-theme', t); } catch (e) {}
      btns.forEach(function(b) { b.setAttribute('aria-pressed', b.dataset.theme === t ? 'true' : 'false'); });
    }
    btns.forEach(function(b) {
      b.addEventListener('click', function() { setTheme(b.dataset.theme); });
      b.setAttribute('aria-pressed', b.dataset.theme === document.documentElement.getAttribute('data-theme') ? 'true' : 'false');
    });
  })();
`;

// Language switch — also swaps every translatable text node's content
// via data-tr-en / data-tr-zh / data-orig attributes.
const LANG_SWITCH_SCRIPT = `
  (function() {
    function applyTextFor(lang) {
      var sel = '[data-orig]';
      document.querySelectorAll(sel).forEach(function(el) {
        var orig = el.getAttribute('data-orig');
        var en = el.getAttribute('data-tr-en');
        var zh = el.getAttribute('data-tr-zh');
        var newText = orig;
        if (lang === 'en' && en) newText = en;
        else if (lang === 'zh' && zh) newText = zh;
        // Preserve nested elements (e.g. <strong> inside) only when text matches;
        // if textContent is non-trivial child, we replace it directly.
        el.textContent = newText;
      });
    }

    var saved = 'mix';
    try { saved = localStorage.getItem('digest-lang') || 'mix'; } catch(e) {}
    if (['mix','en','zh'].indexOf(saved) === -1) saved = 'mix';
    document.documentElement.setAttribute('data-lang', saved);
    if (saved !== 'mix') {
      // Apply on first paint (data-orig already holds original text)
      window.addEventListener('DOMContentLoaded', function() { applyTextFor(saved); });
    }

    var btns = document.querySelectorAll('.lang-switch button');
    btns.forEach(function(b) {
      b.setAttribute('aria-pressed', b.dataset.lang === saved ? 'true' : 'false');
      b.addEventListener('click', function() {
        var newLang = b.dataset.lang;
        try { localStorage.setItem('digest-lang', newLang); } catch(e) {}
        document.documentElement.setAttribute('data-lang', newLang);
        btns.forEach(function(other) {
          other.setAttribute('aria-pressed', other.dataset.lang === newLang ? 'true' : 'false');
        });
        applyTextFor(newLang);
        document.dispatchEvent(new CustomEvent('digest-lang-change', { detail: { lang: newLang } }));
      });
    });
  })();
`;

// Floating mini-player: expand/collapse + fully-custom audio controls
// (the native <audio> element is hidden so no browser chrome — kebab,
// volume slider, mute, overflow menu — ever appears).
const AUDIO_PLAYER_SCRIPT = `
  (function() {
    var fab = document.getElementById('audio-fab');
    if (!fab) return;
    var handle = document.getElementById('audio-fab-handle');
    var closeBtn = document.getElementById('audio-fab-close');
    var audio = document.getElementById('digest-audio');
    var playBtn = document.getElementById('play-btn');
    var scrubber = document.getElementById('scrubber');
    var fill = document.getElementById('scrubber-fill');
    var thumb = document.getElementById('scrubber-thumb');
    var timeLabel = document.getElementById('time-label');
    var speedBtn = document.getElementById('speed-btn');

    function expand(v) { fab.setAttribute('data-expanded', v ? 'true' : 'false'); }
    handle.addEventListener('click', function() {
      if (fab.getAttribute('data-expanded') === 'false') expand(true);
    });
    if (closeBtn) closeBtn.addEventListener('click', function(e) { e.stopPropagation(); expand(false); });

    if (!audio) return;

    // ---- Play / pause ----
    function setPlayIcon(playing) {
      if (playBtn) playBtn.textContent = playing ? '❚❚' : '▶';
    }
    function tryPlay() {
      // Force a fresh load if metadata never came through.
      if (audio.readyState === 0 || audio.networkState === 3) audio.load();
      var p;
      try { p = audio.play(); } catch (err) {
        console.error('[digest-audio] play threw:', err);
        if (timeLabel) timeLabel.textContent = 'play error';
        return;
      }
      if (p && typeof p.then === 'function') {
        p.catch(function(err) {
          console.error('[digest-audio] play rejected:', err && err.name, err && err.message);
          if (timeLabel) timeLabel.textContent = (err && err.name) || 'error';
        });
      }
    }
    if (playBtn) {
      playBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (audio.paused || audio.ended) tryPlay(); else audio.pause();
      });
    }
    audio.addEventListener('play', function() { setPlayIcon(true); });
    audio.addEventListener('pause', function() { setPlayIcon(false); });
    audio.addEventListener('ended', function() { setPlayIcon(false); });
    audio.addEventListener('error', function() {
      var err = audio.error;
      console.error('[digest-audio] media error:', err && err.code, err && err.message);
      if (timeLabel) timeLabel.textContent = 'load error';
    });

    // ---- Time display + scrubber fill ----
    function fmt(sec) {
      if (!isFinite(sec) || sec < 0) return '0:00';
      var m = Math.floor(sec / 60);
      var s = Math.floor(sec % 60);
      return m + ':' + (s < 10 ? '0' + s : s);
    }
    function refresh() {
      var d = audio.duration || 0;
      var c = audio.currentTime || 0;
      var pct = d > 0 ? (c / d) * 100 : 0;
      if (fill) fill.style.right = (100 - pct) + '%';
      if (thumb) thumb.style.left = pct + '%';
      if (timeLabel) {
        if (d > 0) timeLabel.textContent = fmt(c) + ' / ' + fmt(d);
        else timeLabel.textContent = fmt(c);
      }
    }
    audio.addEventListener('timeupdate', refresh);
    audio.addEventListener('loadedmetadata', refresh);
    audio.addEventListener('durationchange', refresh);
    refresh();

    // ---- Scrubber click + drag to seek ----
    function seekFromEvent(e) {
      if (!audio.duration) return;
      var rect = scrubber.getBoundingClientRect();
      var clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
      var pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      audio.currentTime = pct * audio.duration;
      refresh();
    }
    if (scrubber) {
      var dragging = false;
      scrubber.addEventListener('mousedown', function(e) { dragging = true; seekFromEvent(e); });
      scrubber.addEventListener('touchstart', function(e) { dragging = true; seekFromEvent(e); }, { passive: true });
      window.addEventListener('mousemove', function(e) { if (dragging) seekFromEvent(e); });
      window.addEventListener('touchmove', function(e) { if (dragging) seekFromEvent(e); }, { passive: true });
      window.addEventListener('mouseup', function() { dragging = false; });
      window.addEventListener('touchend', function() { dragging = false; });
      // Keyboard: left/right arrows seek ±5s
      scrubber.addEventListener('keydown', function(e) {
        if (!audio.duration) return;
        if (e.key === 'ArrowLeft') { audio.currentTime = Math.max(0, audio.currentTime - 5); refresh(); }
        if (e.key === 'ArrowRight') { audio.currentTime = Math.min(audio.duration, audio.currentTime + 5); refresh(); }
      });
    }

    // ---- Multi-language audio: cues per language, swap on selection ----
    var allCuesEl = document.getElementById('audio-cues-all');
    var tracksEl  = document.getElementById('audio-tracks');
    var allCues = {};
    var tracks = {};
    try { if (allCuesEl) allCues = JSON.parse(allCuesEl.textContent) || {}; } catch (e) {}
    try { if (tracksEl)  tracks  = JSON.parse(tracksEl.textContent)  || {}; } catch (e) {}

    function currentLang() {
      return document.documentElement.getAttribute('data-lang') || 'mix';
    }
    function activeCues() {
      var lang = currentLang();
      return allCues[lang] || allCues.mix || null;
    }
    var cuesData = activeCues();

    document.addEventListener('digest-lang-change', function(e) {
      var lang = (e.detail && e.detail.lang) || 'mix';
      var track = tracks[lang];
      if (track && track.available && track.src) {
        var wasPlaying = !audio.paused;
        var prevTime = audio.currentTime;
        audio.pause();
        audio.src = track.src;
        audio.load();
        // Start over on language switch (different track, different timing).
        audio.currentTime = 0;
      } else {
        console.warn('[digest] track not available for lang', lang);
      }
      cuesData = activeCues();
      lastAnchor = null;
      document.querySelectorAll('.now-playing').forEach(function(n) {
        n.classList.remove('now-playing');
      });
      document.querySelectorAll('nav.toc a.toc-active').forEach(function(n) {
        n.classList.remove('toc-active');
      });
      // Refresh click-to-seek bindings with new cue set
      refreshSeekBindings();
    });
    var lastAnchor = null;
    var lastUserScrollAt = 0;
    // Detect USER-initiated scroll via input events (wheel, touch,
    // navigation keys). Programmatic scrollIntoView does NOT fire these,
    // so we can pause auto-scroll for 8s after real user input without
    // the auto-scroll triggering its own lockout.
    function markUser() { lastUserScrollAt = Date.now(); }
    window.addEventListener('wheel', markUser, { passive: true });
    window.addEventListener('touchmove', markUser, { passive: true });
    window.addEventListener('keydown', function(e) {
      // Page navigation keys
      if (['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].indexOf(e.key) !== -1) {
        markUser();
      }
    });

    function maybeScroll() {
      if (!cuesData || !cuesData.cues) return;
      if (audio.paused) return;
      if (Date.now() - lastUserScrollAt < 8000) return;
      var t = audio.currentTime;
      // Article-only cues now — no section fallback (eliminates the
      // section-border highlight + the section->first-article double jump).
      var active = null;
      for (var i = 0; i < cuesData.cues.length; i++) {
        var c = cuesData.cues[i];
        if (t >= c.start && t < c.end) { active = c.anchor; break; }
      }
      if (active && active !== lastAnchor) {
        var el = document.getElementById(active);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          document.querySelectorAll('.now-playing').forEach(function(n) {
            n.classList.remove('now-playing');
          });
          el.classList.add('now-playing');
          // Highlight the TOC link for whichever section contains this article.
          var section = el.closest('section.block');
          if (section && section.id) {
            document.querySelectorAll('nav.toc a.toc-active').forEach(function(n) {
              n.classList.remove('toc-active');
            });
            var link = document.querySelector('nav.toc a[href="#' + section.id + '"]');
            if (link) link.classList.add('toc-active');
          }
        }
        lastAnchor = active;
      }
    }
    audio.addEventListener('timeupdate', maybeScroll);
    audio.addEventListener('pause', function() {
      document.querySelectorAll('.now-playing').forEach(function(n) {
        n.classList.remove('now-playing');
      });
      lastAnchor = null;
    });

    // ---- Click-to-seek on article cards (rebound on language change) ----
    // The handler binds to the explicit "▶ Listen from here" button only —
    // earlier versions bound to the whole article, which made stray clicks
    // (selecting text, clicking the card body) jump audio unexpectedly.
    var focusObserver = null;
    function refreshSeekBindings() {
      // Tear down previous bindings
      if (focusObserver) { focusObserver.disconnect(); focusObserver = null; }
      document.querySelectorAll('.audio-seekable').forEach(function(el) {
        el.classList.remove('audio-seekable');
        el.classList.remove('is-focused');
        var hint = el.querySelector('.seek-hint');
        if (hint) hint.remove();
      });
      if (!cuesData || !cuesData.cues) return;
      var cueByAnchor = {};
      cuesData.cues.forEach(function(c) { cueByAnchor[c.anchor] = c; });
      var seekableEls = [];
      document.querySelectorAll('[id^="article-"]').forEach(function(el) {
        var cue = cueByAnchor[el.id];
        if (!cue) return;
        el.classList.add('audio-seekable');
        seekableEls.push(el);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'seek-hint';
        btn.textContent = '▶ Listen from here';
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          audio.currentTime = cue.start + 0.05;
          fab.setAttribute('data-expanded', 'true');
          lastUserScrollAt = Date.now();
          // Apply the now-playing highlight immediately on click so the
          // user gets instant feedback. maybeScroll's 8-second
          // input-lockout would otherwise delay this until the next
          // automatic refresh. Mirror what maybeScroll() does on a
          // genuine cue transition.
          document.querySelectorAll('.now-playing').forEach(function(n) {
            n.classList.remove('now-playing');
          });
          el.classList.add('now-playing');
          var section = el.closest('section.block');
          if (section && section.id) {
            document.querySelectorAll('nav.toc a.toc-active').forEach(function(n) {
              n.classList.remove('toc-active');
            });
            var link = document.querySelector('nav.toc a[href="#' + section.id + '"]');
            if (link) link.classList.add('toc-active');
          }
          lastAnchor = el.id;
          if (audio.paused) tryPlay();
        });
        el.appendChild(btn);
      });

      // Mobile + keyboard: when the user taps inside a seekable card
      // (anywhere, but not on a link/button), mark THAT card as the
      // focused one. Tapping another card moves focus; tapping outside
      // any card clears it. This makes the seek button visible only
      // for the card the user is currently engaging with.
      if (!window._seekableFocusBound) {
        window._seekableFocusBound = true;
        document.addEventListener('click', function(e) {
          // Don't override on hover-capable pointer interactions —
          // hover already handles desktop perfectly.
          var card = e.target.closest('.audio-seekable');
          var clickedInteractive = e.target.closest('a, button, input, textarea, select, .seek-hint');
          document.querySelectorAll('.audio-seekable.is-focused').forEach(function(el) {
            if (el !== card) el.classList.remove('is-focused');
          });
          if (card && !clickedInteractive) {
            card.classList.add('is-focused');
          } else if (!card) {
            // Tapped outside any seekable card — clear focus
            document.querySelectorAll('.audio-seekable.is-focused').forEach(function(el) {
              el.classList.remove('is-focused');
            });
          }
        }, true);
      }

      // Mobile + scrolling: when the user scrolls a card to the
      // viewport center, mark it focused so the seek button surfaces
      // without requiring a tap first. Touch-only / coarse-pointer
      // devices benefit; desktop still uses hover.
      if ('IntersectionObserver' in window) {
        focusObserver = new IntersectionObserver(function(entries) {
          // Pick the entry with the largest intersection ratio that's
          // actually intersecting; clear focus from siblings.
          var best = null;
          entries.forEach(function(en) {
            if (!en.isIntersecting) return;
            if (!best || en.intersectionRatio > best.intersectionRatio) best = en;
          });
          if (best && best.intersectionRatio > 0.55) {
            seekableEls.forEach(function(el) {
              if (el !== best.target) el.classList.remove('is-focused');
            });
            best.target.classList.add('is-focused');
          }
        }, {
          // Focus the article when ~60% is in the middle viewport band.
          root: null,
          rootMargin: '-25% 0px -25% 0px',
          threshold: [0, 0.25, 0.5, 0.55, 0.75, 1],
        });
        seekableEls.forEach(function(el) { focusObserver.observe(el); });
      }
    }
    refreshSeekBindings();

    // ---- Playback speed cycle ----
    if (speedBtn) {
      var rates = [1, 1.25, 1.5, 1.75, 2];
      var saved = 1;
      try { saved = parseFloat(localStorage.getItem('digest-speed')) || 1; } catch (e) {}
      if (rates.indexOf(saved) === -1) saved = 1;
      function applyRate(r) {
        audio.playbackRate = r;
        speedBtn.textContent = r + '×';
        try { localStorage.setItem('digest-speed', String(r)); } catch (e) {}
      }
      applyRate(saved);
      audio.addEventListener('loadedmetadata', function() { applyRate(saved); });
      speedBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        var idx = rates.indexOf(saved);
        saved = rates[(idx + 1) % rates.length];
        applyRate(saved);
      });
    }
  })();
`;

function manifestStatusFooter(manifest) {
  if (!manifest?.sources) return "";
  return `<div class="source-status">${Object.entries(manifest.sources)
    .map(
      ([name, info]) =>
        `<span title="${escapeHtml(info.error || "")}" class="${info.status === "ok" ? "status-ok" : "status-err"}">${info.status === "ok" ? "●" : "○"} ${escapeHtml(name)}</span>`,
    )
    .join("")}</div>`;
}

function pickAihotSection(aihotDaily, labelHint) {
  if (!aihotDaily?.sections) return [];
  const sec = aihotDaily.sections.find((s) => s.label?.includes(labelHint));
  return sec?.items || [];
}

// ---- Page assembly ----

async function renderPage({
  date,
  manifest,
  aihotDaily,
  aihotModels,
  aihotProducts,
  aihotIndustry,
  aihotPaper,
  ghTrending,
  hfPopular,
  openaiBlog,
  simonWillison,
  xFeed,
  podFeed,
  blogFeed,
  localLlamaData,
  audioAvailable,
  audioCuesAll,
  audioTracks,
}) {
  // Pre-filter all sections so we can detect empty ones and skip both
  // the <section> and its TOC entry.

  // AIHOT: 24h date filter, no count cap.
  const modelItems = filterRecent(aihotModels?.items || pickAihotSection(aihotDaily, "模型") || [], "publishedAt");
  const productItems = filterRecent(aihotProducts?.items || pickAihotSection(aihotDaily, "产品") || [], "publishedAt");
  const industryItems = filterRecent(aihotIndustry?.items || pickAihotSection(aihotDaily, "行业") || pickAihotSection(aihotDaily, "动态") || [], "publishedAt");
  const paperItems = filterRecent(aihotPaper?.items || pickAihotSection(aihotDaily, "论文") || [], "publishedAt");

  // OpenAI lab: 24h + 16 cap
  const labItems = filterRecent(openaiBlog?.items || [], "pubDate").slice(0, OTHER_CAP);

  // Simon Willison: 24h + 16 cap
  const simonEntries = filterRecent(simonWillison?.entries || [], "updated").slice(0, OTHER_CAP);

  // GitHub Trending: 16 cap, no date filter (URL ?since=daily)
  const ghRepos = (ghTrending?.repos || []).slice(0, OTHER_CAP);

  // HF: 16 cap, no date filter
  const hfModels = (hfPopular?.models || []).slice(0, OTHER_CAP);

  // Follow Builders: NO date filter (upstream is curated daily, so by
  // the time we fetch, items are typically already 24h old). Trust the
  // upstream selection; sort tweets by likes.
  const allTweets = (xFeed?.x || []).flatMap((author) =>
    (author.tweets || []).map((t) => ({ ...t, author: author.name, handle: author.handle })),
  );
  const builderTweets = allTweets.slice();
  builderTweets.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  const builderPods = (podFeed?.podcasts || []);
  const builderBlogs = (blogFeed?.blogs || []);

  // r/LocalLLaMA: top-of-day, no extra date filter (upstream is daily).
  const llamaPosts = (localLlamaData?.posts || []).slice(0, OTHER_CAP);

  // Has-content flags drive both section visibility and TOC entries.
  const has = {
    models: modelItems.length > 0,
    products: productItems.length > 0,
    industry: industryItems.length > 0,
    papers: paperItems.length > 0,
    labs: labItems.length > 0,
    writing: simonEntries.length > 0,
    trending: ghRepos.length > 0,
    hf: hfModels.length > 0,
    builders: builderTweets.length > 0 || builderPods.length > 0 || builderBlogs.length > 0,
    llama: llamaPosts.length > 0,
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Daily Digest — ${escapeHtml(date)}</title>
  <meta name="description" content="A daily roundup of AI model releases, industry moves, builder voices, and trending signals.">
  <link rel="preconnect" href="https://rsms.me/" />
  <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
  <script>${THEME_BOOT_SCRIPT}</script>
  <style>${PAGE_CSS}</style>
</head>
<body>

  <header class="hero">
    <div class="lang-switch" role="tablist" aria-label="Audio language">
      <button data-lang="mix" role="tab">Mix</button>
      <button data-lang="en" role="tab">EN</button>
      <button data-lang="zh" role="tab">中文</button>
    </div>
    <div class="theme-switch" role="tablist" aria-label="Theme">
      <button data-theme="linear" role="tab">Linear</button>
      <button data-theme="claude" role="tab">Claude</button>
    </div>
    <h1>AI Daily Digest</h1>
    <p class="date">${escapeHtml(date)} · UTC</p>
    <p class="tagline">What shipped, what trended, what AI builders are saying — across labs, GitHub, HuggingFace, Hacker News, and Chinese AI media.</p>
  </header>

  <nav class="toc">
    <ul>
      ${has.models ? `<li><a href="#models">🤖 Models</a></li>` : ""}
      ${has.products ? `<li><a href="#products">📦 Products</a></li>` : ""}
      ${has.industry ? `<li><a href="#industry">📰 Industry</a></li>` : ""}
      ${has.papers ? `<li><a href="#papers">📄 Research</a></li>` : ""}
      ${has.labs ? `<li><a href="#labs">🏢 Lab posts</a></li>` : ""}
      ${has.writing ? `<li><a href="#writing">✍ Simon Willison</a></li>` : ""}
      ${has.builders ? `<li><a href="#builders">🎙 Builder voices</a></li>` : ""}
      ${has.llama ? `<li><a href="#llama">🦙 r/LocalLLaMA</a></li>` : ""}
      ${has.trending ? `<li><a href="#trending">🚀 GitHub</a></li>` : ""}
      ${has.hf ? `<li><a href="#hf">🤗 HuggingFace</a></li>` : ""}
      <li><a href="digests/">🗂 Archive</a></li>
    </ul>
  </nav>

  <main class="container">

    ${has.models ? `
    <section id="models" class="block">
      <h2><span class="section-icon">🤖</span> Model drops & updates</h2>
      <p class="section-sub">Latest model launches, version bumps, and capability releases from the Chinese AI ecosystem (AIHOT). Click <strong>Translate EN</strong> on any card for an English version.</p>
      ${aihotItemsCard(modelItems, "models")}
    </section>` : ""}

    ${has.products ? `
    <section id="products" class="block">
      <h2><span class="section-icon">📦</span> Products & applications</h2>
      <p class="section-sub">Consumer-facing and developer-facing product launches.</p>
      ${aihotItemsCard(productItems, "products")}
    </section>` : ""}

    ${has.industry ? `
    <section id="industry" class="block">
      <h2><span class="section-icon">📰</span> Industry moves</h2>
      <p class="section-sub">Funding, hiring, regulation, partnerships.</p>
      ${aihotItemsCard(industryItems, "industry")}
    </section>` : ""}

    ${has.papers ? `
    <section id="papers" class="block">
      <h2><span class="section-icon">📄</span> Research highlights</h2>
      <p class="section-sub">Notable papers and technical writeups from the last 24 hours.</p>
      ${aihotItemsCard(paperItems, "papers")}
    </section>` : ""}

    ${has.labs ? `
    <section id="labs" class="block">
      <h2><span class="section-icon">🏢</span> Lab announcements</h2>
      <p class="section-sub">Latest posts from OpenAI's blog. <span class="meta-time">(Anthropic doesn't publish RSS; their announcements surface elsewhere on this page.)</span></p>
      ${labBlogSection(labItems)}
    </section>` : ""}

    ${has.writing ? `
    <section id="writing" class="block">
      <h2><span class="section-icon">✍</span> Simon Willison</h2>
      <p class="section-sub">Daily-ish AI commentary, tool-of-the-day posts, and link roundups from Simon's weblog.</p>
      ${builderWritingSection(simonEntries)}
    </section>` : ""}

    ${has.builders ? `
    <section id="builders" class="block">
      <h2><span class="section-icon">🎙</span> Builder voices</h2>
      <p class="section-sub">Recent posts, episodes, and writing from named AI builders <span class="meta-time">(via Follow Builders feeds)</span>.</p>
      ${followBuildersSection(builderTweets, builderPods, builderBlogs)}
    </section>` : ""}

    ${has.llama ? `
    <section id="llama" class="block">
      <h2><span class="section-icon">🦙</span> r/LocalLLaMA</h2>
      <p class="section-sub">Top of the day from the open-source LLM community — model drops, runtime benchmarks, quantization tricks.</p>
      ${localLlamaSection(llamaPosts)}
    </section>` : ""}

    ${has.trending ? `
    <section id="trending" class="block">
      <h2><span class="section-icon">🚀</span> Trending on GitHub</h2>
      <p class="section-sub">Top trending repositories across all languages.</p>
      ${ghTrendingSection(ghRepos)}
    </section>` : ""}

    ${has.hf ? `
    <section id="hf" class="block">
      <h2><span class="section-icon">🤗</span> HuggingFace</h2>
      <p class="section-sub">Open-weight models ranked by ♥ likes (closest stable proxy for trending).</p>
      ${hfSection(hfModels)}
    </section>` : ""}

  </main>

  <footer class="site-footer">
    <div>Snapshot fetched ${escapeHtml(formatDate(manifest?.fetched_at))} · <a href="https://github.com/rowland-dot/ai-daily-digest" target="_blank" rel="noopener">source on GitHub</a></div>
    ${manifestStatusFooter(manifest)}
  </footer>

  <div id="audio-fab" class="audio-fab" data-expanded="false" role="region" aria-label="Audio player">
    <div id="audio-fab-handle" class="audio-fab-handle" role="button" tabindex="0" aria-label="Open audio player">🎧</div>
    <div class="audio-fab-body">
      ${
        audioAvailable
          ? `<audio id="digest-audio" preload="metadata" src="${audioTracks.mix.src}"></audio>
             <div class="audio-track">
               <button id="play-btn" class="play-btn" type="button" aria-label="Play/Pause">▶</button>
               <div id="scrubber" class="scrubber" role="slider" tabindex="0" aria-label="Seek">
                 <div id="scrubber-fill" class="scrubber-fill"></div>
                 <div id="scrubber-thumb" class="scrubber-thumb"></div>
               </div>
               <span id="time-label" class="time-label">0:00</span>
             </div>
             <button id="speed-btn" class="speed-btn" type="button" aria-label="Playback speed" title="Tap to cycle speed">1×</button>`
          : `<span class="no-audio-msg">Today's narration not yet generated</span>`
      }
      <button id="audio-fab-close" class="close-btn" type="button" aria-label="Close">✕</button>
    </div>
  </div>

  <script id="audio-cues-all" type="application/json">${JSON.stringify(audioCuesAll || {})}</script>
  <script id="audio-tracks" type="application/json">${JSON.stringify(audioTracks || {})}</script>
  <script>${THEME_TOGGLE_SCRIPT}</script>
  <script>${LANG_SWITCH_SCRIPT}</script>
  <script>${AUDIO_PLAYER_SCRIPT}</script>

</body>
</html>`;
}

async function renderArchiveIndex(days) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Daily Digest — Archive</title>
  <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
  <script>${THEME_BOOT_SCRIPT}</script>
  <style>${PAGE_CSS}</style>
</head>
<body>
  <header class="hero">
    <div class="theme-switch" role="tablist" aria-label="Theme">
      <button data-theme="linear" role="tab">Linear</button>
      <button data-theme="claude" role="tab">Claude</button>
    </div>
    <h1>Archive</h1>
    <p class="date">All past AI Daily Digests</p>
  </header>
  <main class="container">
    <ul class="hn-list">
      ${days.map((d) => `<li class="hn-item"><a class="hn-title" href="${escapeHtml(d)}.html">${escapeHtml(d)}</a></li>`).join("")}
    </ul>
  </main>
  <footer class="site-footer"><a href="../">← back to latest</a></footer>
  <script>${THEME_TOGGLE_SCRIPT}</script>
</body>
</html>`;
}

// ---- Run ----

await mkdir(DIGESTS_DIR, { recursive: true });

const manifest = await tryReadJson(join(DATA_DIR, "manifest.json"));
const today = manifest?.date_utc || new Date().toISOString().slice(0, 10);

const aihotDaily = await tryReadJson(join(DATA_DIR, "aihot-daily.json"));
const aihotModels = await tryReadJson(join(DATA_DIR, "aihot-ai-models.json"));
const aihotProducts = await tryReadJson(join(DATA_DIR, "aihot-ai-products.json"));
const aihotIndustry = await tryReadJson(join(DATA_DIR, "aihot-industry.json"));
const aihotPaper = await tryReadJson(join(DATA_DIR, "aihot-paper.json"));
const ghTrending = await tryReadJson(join(DATA_DIR, "github-trending.json"));
const hfPopular = await tryReadJson(join(DATA_DIR, "hf-popular.json"));
const openaiBlogData = await tryReadJson(join(DATA_DIR, "openai-blog.json"));
const simonWillisonData = await tryReadJson(join(DATA_DIR, "simon-willison.json"));
const xFeed = await tryReadJson(join(DATA_DIR, "follow-builders-x.json"));
const podFeed = await tryReadJson(join(DATA_DIR, "follow-builders-podcasts.json"));
const blogFeed = await tryReadJson(join(DATA_DIR, "follow-builders-blogs.json"));
const localLlamaData = await tryReadJson(join(DATA_DIR, "localllama.json"));

let archiveDays = [];
if (existsSync(DIGESTS_DIR)) {
  const entries = await readdir(DIGESTS_DIR);
  archiveDays = entries
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
    .map((f) => f.replace(/\.html$/, ""))
    .sort()
    .reverse();
}

const audioAvailable = existsSync(join(SITE_DIR, "digest.mp3"));

async function tryReadCues(name) {
  const p = join(SITE_DIR, name);
  if (!existsSync(p)) return null;
  try { return JSON.parse(await readFile(p, "utf8")); }
  catch { return null; }
}

// Three language tracks: Mix (default), English, 中文. Each has its own
// MP3 + cues. Renderer embeds all three cue sets and the player JS swaps
// audio src + active cue set on language change.
const audioCuesAll = {
  mix: await tryReadCues("audio-cues.json"),
  en: await tryReadCues("audio-cues-en.json"),
  zh: await tryReadCues("audio-cues-zh.json"),
};
const audioTracks = {
  mix: { src: "digest.mp3", available: existsSync(join(SITE_DIR, "digest.mp3")) },
  en: { src: "digest-en.mp3", available: existsSync(join(SITE_DIR, "digest-en.mp3")) },
  zh: { src: "digest-zh.mp3", available: existsSync(join(SITE_DIR, "digest-zh.mp3")) },
};

// Content translations for the visible page (pre-translated at build
// time by generate-audio.py). Each key is the original source text;
// the value is { en?: "...", zh?: "..." } with whichever translations
// are needed (a Chinese item only has 'en', an English item only 'zh').
const contentTranslations = await tryReadCues("content-translations.json") || {};

function txAttrs(text) {
  // Returns HTML attributes embedding translations for the given text.
  // The visible textContent stays in the original language; JS swaps it
  // on language change.
  if (text == null || text === "") return "";
  const entry = contentTranslations[String(text).trim()];
  if (!entry) return "";
  const a = [`data-orig="${escapeHtml(text)}"`];
  if (entry.en) a.push(`data-tr-en="${escapeHtml(entry.en)}"`);
  if (entry.zh) a.push(`data-tr-zh="${escapeHtml(entry.zh)}"`);
  return a.length > 1 ? " " + a.join(" ") : "";
}

const pageHtml = await renderPage({
  date: today,
  manifest,
  aihotDaily,
  aihotModels,
  aihotProducts,
  aihotIndustry,
  aihotPaper,
  ghTrending,
  hfPopular,
  openaiBlog: openaiBlogData,
  simonWillison: simonWillisonData,
  xFeed,
  podFeed,
  blogFeed,
  localLlamaData,
  audioAvailable,
  audioCuesAll,
  audioTracks,
});

await writeFile(join(SITE_DIR, "index.html"), pageHtml, "utf8");
await writeFile(join(DIGESTS_DIR, `${today}.html`), pageHtml, "utf8");

if (!archiveDays.includes(today)) archiveDays = [today, ...archiveDays];
await writeFile(join(DIGESTS_DIR, "index.html"), await renderArchiveIndex(archiveDays), "utf8");

console.log(`[ok] rendered ${today}.html (latest) + archive (${archiveDays.length} entries)`);
