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

function aihotItemsCard(items) {
  if (!items?.length) return `<p class="empty">No items.</p>`;
  return `<div class="cards">${items
    .map(
      (item) => `
    <article class="card">
      <h3 class="card-title">${escapeHtml(item.title || "")}</h3>
      ${item.summary ? `<p class="card-summary">${escapeHtml(item.summary)}</p>` : ""}
      <div class="card-meta">
        ${item.source ? `<span class="badge">${escapeHtml(item.source)}</span>` : ""}
        ${item.publishedAt ? `<span class="meta-time">${escapeHtml(item.publishedAt)}</span>` : ""}
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

function ghTrendingSection(gh) {
  const repos = (gh?.repos || []).slice(0, OTHER_CAP);
  if (!repos.length) return `<p class="empty">No items.</p>`;
  return `<div class="cards">${repos
    .map(
      (r) => `
    <article class="card gh-card">
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

function hnSection(hn) {
  // 24h filter (item.time is unix epoch seconds), then AI-first ordering, cap at OTHER_CAP.
  const items = (hn?.items || []).filter(
    (it) => it && !it.error && it.title && withinWindow(it.time),
  );
  const aiKeywords = /\b(AI|LLM|GPT|Claude|Gemini|Anthropic|OpenAI|model|agent|prompt|embedding|RAG|inference|fine-?tun|train|neural|transformer)\b/i;
  const aiItems = items.filter((it) => aiKeywords.test(it.title));
  const otherItems = items.filter((it) => !aiKeywords.test(it.title));
  const ordered = [...aiItems, ...otherItems].slice(0, OTHER_CAP);
  if (!ordered.length) return `<p class="empty">No items in the last 24 hours.</p>`;
  return `<ol class="hn-list">${ordered
    .map(
      (it) => `
    <li class="hn-item">
      <a class="hn-title" href="${escapeHtml(it.url || `https://news.ycombinator.com/item?id=${it.id}`)}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a>
      <div class="hn-meta">
        <span>▲ ${it.score ?? 0}</span>
        <span>·</span>
        <span>${it.descendants ?? 0} comments</span>
        ${it.by ? `<span>· by ${escapeHtml(it.by)}</span>` : ""}
        <a class="hn-comments" href="https://news.ycombinator.com/item?id=${it.id}" target="_blank" rel="noopener">HN ↗</a>
      </div>
    </li>
  `,
    )
    .join("")}</ol>`;
}

function hfSection(hf) {
  const models = (hf?.models || []).slice(0, OTHER_CAP);
  if (!models.length) return `<p class="empty">No models.</p>`;
  return `<div class="cards">${models
    .map(
      (m) => `
    <article class="card hf-card">
      <h3 class="card-title"><a href="https://huggingface.co/${escapeHtml(m.id || "")}" target="_blank" rel="noopener">${escapeHtml(m.id || "")}</a></h3>
      <div class="hf-stats">
        <span class="stat">❤ ${m.likes ?? 0}</span>
        <span class="stat">↓ ${(m.downloads ?? 0).toLocaleString()}</span>
        ${m.pipeline_tag ? `<span class="badge">${escapeHtml(m.pipeline_tag)}</span>` : ""}
      </div>
      ${m.tags?.length ? `<div class="hf-tags">${m.tags.slice(0, 5).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join("")}</div>` : ""}
    </article>
  `,
    )
    .join("")}</div>`;
}

function labBlogSection(openai) {
  // 24h date filter (pubDate is RFC 2822), then cap at OTHER_CAP.
  const items = filterRecent(openai?.items || [], "pubDate").slice(0, OTHER_CAP);
  if (!items.length) return `<p class="empty">No lab posts in the last 24 hours.</p>`;
  return `<div class="cards">${items
    .map(
      (it) => `
    <article class="card">
      <h3 class="card-title"><a href="${escapeHtml(it.link)}" target="_blank" rel="noopener">${escapeHtml(it.title)}</a></h3>
      ${it.description ? `<p class="card-summary">${escapeHtml(it.description)}</p>` : ""}
      <div class="card-meta">
        <span class="badge">OpenAI</span>
        ${it.pubDate ? `<span class="meta-time">${escapeHtml(it.pubDate.replace(/ \d{2}:\d{2}:\d{2} GMT$/, ""))}</span>` : ""}
      </div>
    </article>
  `,
    )
    .join("")}</div>`;
}

function builderWritingSection(sw) {
  // 24h date filter (updated is ISO), then cap at OTHER_CAP.
  const entries = filterRecent(sw?.entries || [], "updated").slice(0, OTHER_CAP);
  if (!entries.length) return `<p class="empty">No new posts in the last 24 hours.</p>`;
  return `<ul class="writing-list">${entries
    .map(
      (e) => `
    <li class="writing-item">
      <a class="writing-title" href="${escapeHtml(e.link)}" target="_blank" rel="noopener">${escapeHtml(e.title)}</a>
      ${e.summary ? `<p class="writing-summary">${escapeHtml(e.summary)}</p>` : ""}
      <div class="writing-meta">
        <span>Simon Willison</span>
        ${e.updated ? `<span>· ${escapeHtml(shortDate(e.updated))}</span>` : ""}
      </div>
    </li>
  `,
    )
    .join("")}</ul>`;
}

function followBuildersSection(xFeed, podFeed, blogFeed) {
  // Follow Builders: 24h date filter, NO count cap. Tweets sorted by likes.
  const allTweets = (xFeed?.x || []).flatMap((author) =>
    (author.tweets || []).map((t) => ({ ...t, author: author.name, handle: author.handle })),
  );
  const recentTweets = allTweets.filter((t) => withinWindow(t.createdAt));
  recentTweets.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  const xItems = recentTweets;

  const podItems = filterRecent(podFeed?.podcasts || [], "publishedAt");
  const blogItems = filterRecent(blogFeed?.blogs || [], "publishedAt");

  const renderTweet = (t) => {
    const text = (t.text || "").slice(0, 240) + (t.text?.length > 240 ? "…" : "");
    return `
      <li class="builder-item">
        <div class="builder-meta-top">
          <strong>${escapeHtml(t.author || "")}</strong>
          ${t.handle ? `<span class="muted">@${escapeHtml(t.handle)}</span>` : ""}
        </div>
        <p class="builder-text">${escapeHtml(text)}</p>
        <div class="builder-meta">
          ${typeof t.likes === "number" ? `<span>❤ ${t.likes}</span>` : ""}
          ${typeof t.retweets === "number" ? `<span>↻ ${t.retweets}</span>` : ""}
          ${t.url ? `<a href="${escapeHtml(t.url)}" target="_blank" rel="noopener">View on X ↗</a>` : ""}
        </div>
      </li>
    `;
  };

  const renderPostOrEpisode = (item, kind) => `
    <li class="builder-item">
      <a class="builder-title" href="${escapeHtml(item.url || "#")}" target="_blank" rel="noopener">${escapeHtml(item.title || "(untitled)")}</a>
      <div class="builder-meta">
        ${item.name ? `<span>${escapeHtml(item.name)}</span>` : ""}
        ${item.publishedAt ? `<span> · ${escapeHtml(item.publishedAt.slice(0, 10))}</span>` : ""}
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
    part("Podcasts", podItems.map((p) => renderPostOrEpisode(p, "podcast")).join("")),
    part("Blogs", blogItems.map((b) => renderPostOrEpisode(b, "blog")).join("")),
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
  .theme-switch {
    position: absolute;
    top: 14px;
    right: 14px;
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

  /* Sections */
  section.block { margin: 44px 0; scroll-margin-top: 60px; }
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
  .writing-meta { color: var(--text-tertiary); font-size: 12px; display: flex; gap: 6px; }

  .empty { color: var(--text-muted); font-style: italic; }

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
  /* Expanded: fluid row, sizes to its content + available viewport. */
  .audio-fab[data-expanded="true"] {
    display: flex;
    align-items: center;
    padding: 6px 8px 6px 8px;
    height: 52px;
    max-width: calc(100vw - 16px);
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
    height: 4px;
    background: var(--surface-2);
    border-radius: 2px;
    position: relative;
    cursor: pointer;
    overflow: hidden;
  }
  .scrubber-fill {
    position: absolute;
    inset: 0 100% 0 0;          /* width controlled via JS: right = 100% - pct */
    background: var(--accent);
    border-radius: 2px;
    pointer-events: none;
  }
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
    if (playBtn) {
      playBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (audio.paused) audio.play(); else audio.pause();
      });
    }
    audio.addEventListener('play', function() { setPlayIcon(true); });
    audio.addEventListener('pause', function() { setPlayIcon(false); });
    audio.addEventListener('ended', function() { setPlayIcon(false); });

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
  hnTop,
  hfPopular,
  openaiBlog,
  simonWillison,
  xFeed,
  podFeed,
  blogFeed,
  audioAvailable,
}) {
  // AIHOT: 24h date filter (recency is the only quality signal — items
  // lack a popularity field), no count cap after the filter.
  const modelItems = filterRecent(aihotModels?.items || pickAihotSection(aihotDaily, "模型") || [], "publishedAt");
  const productItems = filterRecent(aihotProducts?.items || pickAihotSection(aihotDaily, "产品") || [], "publishedAt");
  const industryItems = filterRecent(aihotIndustry?.items || pickAihotSection(aihotDaily, "行业") || pickAihotSection(aihotDaily, "动态") || [], "publishedAt");
  const paperItems = filterRecent(aihotPaper?.items || pickAihotSection(aihotDaily, "论文") || [], "publishedAt");

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
      <li><a href="#models">🤖 Models</a></li>
      <li><a href="#products">📦 Products</a></li>
      <li><a href="#industry">📰 Industry</a></li>
      <li><a href="#papers">📄 Research</a></li>
      <li><a href="#labs">🏢 Lab posts</a></li>
      <li><a href="#writing">✍ Simon Willison</a></li>
      <li><a href="#trending">🚀 GitHub</a></li>
      <li><a href="#hn">🔥 Hacker News</a></li>
      <li><a href="#hf">🤗 HuggingFace</a></li>
      <li><a href="#builders">🎙 Builder voices</a></li>
      <li><a href="digests/">🗂 Archive</a></li>
    </ul>
  </nav>

  <main class="container">

    <section id="models" class="block">
      <h2><span class="section-icon">🤖</span> Model releases & updates</h2>
      <p class="section-sub">Latest model launches, version bumps, and capability releases from the Chinese AI ecosystem (AIHOT). Click <strong>Translate EN</strong> on any card for an English version.</p>
      ${aihotItemsCard(modelItems)}
    </section>

    <section id="products" class="block">
      <h2><span class="section-icon">📦</span> Products & applications</h2>
      <p class="section-sub">Consumer-facing and developer-facing product launches.</p>
      ${aihotItemsCard(productItems)}
    </section>

    <section id="industry" class="block">
      <h2><span class="section-icon">📰</span> Industry moves</h2>
      <p class="section-sub">Funding, hiring, regulation, partnerships.</p>
      ${aihotItemsCard(industryItems)}
    </section>

    <section id="papers" class="block">
      <h2><span class="section-icon">📄</span> Research highlights</h2>
      <p class="section-sub">Notable papers and technical writeups from the last 24 hours.</p>
      ${aihotItemsCard(paperItems)}
    </section>

    <section id="labs" class="block">
      <h2><span class="section-icon">🏢</span> Lab announcements</h2>
      <p class="section-sub">Latest posts from OpenAI's blog. <span class="meta-time">(Anthropic doesn't publish RSS; their announcements surface elsewhere on this page.)</span></p>
      ${labBlogSection(openaiBlog)}
    </section>

    <section id="writing" class="block">
      <h2><span class="section-icon">✍</span> Builder writing — Simon Willison</h2>
      <p class="section-sub">Daily-ish AI commentary, tool-of-the-day posts, and link roundups from Simon Willison's weblog.</p>
      ${builderWritingSection(simonWillison)}
    </section>

    <section id="trending" class="block">
      <h2><span class="section-icon">🚀</span> Trending on GitHub today</h2>
      <p class="section-sub">Top 15 trending repositories across all languages.</p>
      ${ghTrendingSection(ghTrending)}
    </section>

    <section id="hn" class="block">
      <h2><span class="section-icon">🔥</span> Hacker News — what's hitting</h2>
      <p class="section-sub">Top AI-relevant front-page stories (AI/LLM/agent items surfaced first).</p>
      ${hnSection(hnTop)}
    </section>

    <section id="hf" class="block">
      <h2><span class="section-icon">🤗</span> HuggingFace — most-loved models</h2>
      <p class="section-sub">Open-weight models ranked by ❤ likes (closest stable proxy for trending).</p>
      ${hfSection(hfPopular)}
    </section>

    <section id="builders" class="block">
      <h2><span class="section-icon">🎙</span> Builder voices</h2>
      <p class="section-sub">Recent posts, episodes, and writing from named AI builders <span class="meta-time">(via Follow Builders feeds)</span>.</p>
      ${followBuildersSection(xFeed, podFeed, blogFeed)}
    </section>

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
          ? `<audio id="digest-audio" preload="metadata" src="digest.mp3"></audio>
             <div class="audio-track">
               <button id="play-btn" class="play-btn" type="button" aria-label="Play/Pause">▶</button>
               <div id="scrubber" class="scrubber" role="slider" tabindex="0" aria-label="Seek">
                 <div id="scrubber-fill" class="scrubber-fill"></div>
               </div>
               <span id="time-label" class="time-label">0:00</span>
             </div>
             <button id="speed-btn" class="speed-btn" type="button" aria-label="Playback speed" title="Tap to cycle speed">1×</button>`
          : `<span class="no-audio-msg">Today's narration not yet generated</span>`
      }
      <button id="audio-fab-close" class="close-btn" type="button" aria-label="Close">✕</button>
    </div>
  </div>

  <script>${THEME_TOGGLE_SCRIPT}</script>
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
const hnTop = await tryReadJson(join(DATA_DIR, "hn-top.json"));
const hfPopular = await tryReadJson(join(DATA_DIR, "hf-popular.json"));
const openaiBlogData = await tryReadJson(join(DATA_DIR, "openai-blog.json"));
const simonWillisonData = await tryReadJson(join(DATA_DIR, "simon-willison.json"));
const xFeed = await tryReadJson(join(DATA_DIR, "follow-builders-x.json"));
const podFeed = await tryReadJson(join(DATA_DIR, "follow-builders-podcasts.json"));
const blogFeed = await tryReadJson(join(DATA_DIR, "follow-builders-blogs.json"));

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

const pageHtml = await renderPage({
  date: today,
  manifest,
  aihotDaily,
  aihotModels,
  aihotProducts,
  aihotIndustry,
  aihotPaper,
  ghTrending,
  hnTop,
  hfPopular,
  openaiBlog: openaiBlogData,
  simonWillison: simonWillisonData,
  xFeed,
  podFeed,
  blogFeed,
  audioAvailable,
});

await writeFile(join(SITE_DIR, "index.html"), pageHtml, "utf8");
await writeFile(join(DIGESTS_DIR, `${today}.html`), pageHtml, "utf8");

if (!archiveDays.includes(today)) archiveDays = [today, ...archiveDays];
await writeFile(join(DIGESTS_DIR, "index.html"), await renderArchiveIndex(archiveDays), "utf8");

console.log(`[ok] rendered ${today}.html (latest) + archive (${archiveDays.length} entries)`);
