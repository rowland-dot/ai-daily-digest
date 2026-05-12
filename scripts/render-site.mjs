// Renders the bridged JSON snapshots into a static HTML site.
//
// Inputs:  data/*.json (created by fetch-sources.mjs)
// Outputs: docs/index.html        (latest day, served as site root)
//          docs/digests/YYYY-MM-DD.html  (archive of each day)
//          docs/digests/index.html       (archive index, list of all days)
//
// Deployed via GitHub Pages with /docs as the source.
//
// No LLM in the loop. The agent's "reader digest" curation lives in the
// Claude routine's run log; this page is a structured browse view of the
// raw bridged data — readable, mobile-friendly, all items linked to source.

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

const DATA_DIR = "data";
const SITE_DIR = "docs";
const DIGESTS_DIR = join(SITE_DIR, "digests");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function tryReadJson(path) {
  try {
    return await readJson(path);
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
  const d = new Date(iso);
  return d.toUTCString().replace(" GMT", " UTC");
}

function googleTranslateUrl(text) {
  return `https://translate.google.com/?sl=zh-CN&tl=en&op=translate&text=${encodeURIComponent(text)}`;
}

// ---- Section builders ----

function aihotItemsCard(items, opts = {}) {
  const { showTranslate = true } = opts;
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
        ${showTranslate && (item.title || item.summary) ? `<a class="secondary-link" href="${googleTranslateUrl(`${item.title}\n\n${item.summary || ""}`)}" target="_blank" rel="noopener">Translate EN ↗</a>` : ""}
      </div>
    </article>
  `,
    )
    .join("")}</div>`;
}

function hnSection(hn) {
  const items = (hn?.items || [])
    .filter((it) => it && !it.error && it.title)
    .slice(0, 20);

  // Light AI-relevance filter for prominence ordering
  const aiKeywords = /\b(AI|LLM|GPT|Claude|Gemini|Anthropic|OpenAI|model|agent|prompt|embedding|RAG|inference|fine-?tun|train|neural|transformer)\b/i;
  const aiItems = items.filter((it) => aiKeywords.test(it.title));
  const otherItems = items.filter((it) => !aiKeywords.test(it.title));
  const ordered = [...aiItems, ...otherItems].slice(0, 15);

  if (!ordered.length) return `<p class="empty">No items.</p>`;
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
  const models = (hf?.models || []).slice(0, 15);
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

function followBuildersSection(xFeed, podFeed, blogFeed) {
  // x feed shape: { x: [{ name, handle, bio, tweets: [{id, text, createdAt, url, likes, ...}] }] }
  // podcasts feed shape: { podcasts: [{ name, title, url, publishedAt, transcript }] }  (flat episodes)
  // blogs feed shape:    { blogs:    [{ name, title, url, publishedAt }] }              (flat posts)

  // Flatten X: take top tweets across all authors, rank by likes.
  const allTweets = (xFeed?.x || []).flatMap((author) =>
    (author.tweets || []).map((t) => ({ ...t, author: author.name, handle: author.handle })),
  );
  allTweets.sort((a, b) => (b.likes || 0) - (a.likes || 0));
  const xItems = allTweets.slice(0, 8);

  const podItems = (podFeed?.podcasts || []).slice(0, 6);
  const blogItems = (blogFeed?.blogs || []).slice(0, 6);

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

  const renderPostOrEpisode = (item, kind) => {
    return `
      <li class="builder-item">
        <a class="builder-title" href="${escapeHtml(item.url || "#")}" target="_blank" rel="noopener">${escapeHtml(item.title || "(untitled)")}</a>
        <div class="builder-meta">
          ${item.name ? `<span>${escapeHtml(item.name)}</span>` : ""}
          ${item.publishedAt ? `<span> · ${escapeHtml(item.publishedAt.slice(0, 10))}</span>` : ""}
          ${kind === "podcast" ? `<span class="badge">podcast</span>` : ""}
        </div>
      </li>
    `;
  };

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

// ---- Page assembly ----

const PAGE_CSS = `
  :root {
    --bg: #fafaf9;
    --surface: #ffffff;
    --text: #1c1917;
    --muted: #78716c;
    --border: #e7e5e4;
    --accent: #ea580c;
    --accent-soft: #fff7ed;
    --link: #c2410c;
    --shadow: 0 1px 2px rgba(0,0,0,0.04), 0 4px 8px rgba(0,0,0,0.03);
    --radius: 12px;
    --max: 980px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0c0a09;
      --surface: #1c1917;
      --text: #f5f5f4;
      --muted: #a8a29e;
      --border: #292524;
      --accent: #fb923c;
      --accent-soft: #1f1208;
      --link: #fdba74;
      --shadow: 0 1px 2px rgba(0,0,0,0.4);
    }
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--link); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .container { max-width: var(--max); margin: 0 auto; padding: 24px 20px; }

  header.hero {
    background: linear-gradient(135deg, var(--accent) 0%, #f59e0b 100%);
    color: #fff;
    padding: 48px 20px 40px;
    text-align: center;
  }
  header.hero h1 {
    margin: 0 0 8px;
    font-size: clamp(28px, 5vw, 42px);
    font-weight: 800;
    letter-spacing: -0.02em;
  }
  header.hero .date {
    font-size: 18px;
    opacity: 0.92;
    font-weight: 500;
  }
  header.hero .tagline {
    margin-top: 12px;
    font-size: 14px;
    opacity: 0.85;
    max-width: 560px;
    margin-left: auto;
    margin-right: auto;
  }

  nav.toc {
    position: sticky;
    top: 0;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
    padding: 12px 0;
    z-index: 10;
  }
  nav.toc ul {
    list-style: none; padding: 0; margin: 0;
    display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;
  }
  nav.toc a {
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
  }
  nav.toc a:hover { background: var(--accent-soft); border-color: var(--accent); text-decoration: none; }

  section.block { margin: 40px 0; }
  section.block h2 {
    font-size: 24px;
    margin: 0 0 4px;
    font-weight: 700;
    letter-spacing: -0.01em;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  section.block .section-icon { font-size: 28px; }
  section.block .section-sub {
    color: var(--muted);
    font-size: 14px;
    margin: 0 0 20px;
  }

  .cards { display: grid; grid-template-columns: 1fr; gap: 14px; }
  @media (min-width: 700px) {
    .cards { grid-template-columns: 1fr 1fr; }
  }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px;
    box-shadow: var(--shadow);
    display: flex; flex-direction: column; gap: 10px;
  }
  .card-title { margin: 0; font-size: 16px; line-height: 1.4; font-weight: 600; }
  .card-title a { color: var(--text); }
  .card-title a:hover { color: var(--link); }
  .card-summary { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.55; }
  .card-meta { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .badge { background: var(--accent-soft); color: var(--accent); padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
  .meta-time { color: var(--muted); font-size: 12px; }
  .card-actions { display: flex; gap: 12px; margin-top: auto; padding-top: 8px; border-top: 1px solid var(--border); }
  .primary-link { font-weight: 600; font-size: 13px; }
  .secondary-link { font-size: 13px; color: var(--muted); }

  .hn-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
  .hn-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px 16px;
    box-shadow: var(--shadow);
  }
  .hn-title { font-weight: 600; font-size: 15px; color: var(--text); display: block; margin-bottom: 4px; }
  .hn-title:hover { color: var(--link); }
  .hn-meta { color: var(--muted); font-size: 12px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .hn-comments { margin-left: 4px; font-weight: 500; }

  .hf-card { background: var(--surface); }
  .hf-stats { display: flex; gap: 10px; align-items: center; font-size: 13px; color: var(--muted); flex-wrap: wrap; }
  .hf-stats .stat { font-weight: 500; color: var(--text); }
  .hf-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .tag { background: var(--border); color: var(--text); padding: 2px 8px; border-radius: 4px; font-size: 11px; opacity: 0.85; }

  .builder-group { margin-bottom: 22px; }
  .builder-group-title { font-size: 14px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 700; margin: 0 0 10px; }
  .builder-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
  .builder-item {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 12px 14px;
  }
  .builder-title { font-size: 14px; font-weight: 600; color: var(--text); display: block; }
  .builder-title:hover { color: var(--link); }
  .builder-meta { color: var(--muted); font-size: 12px; margin-top: 6px; display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .builder-meta-top { font-size: 14px; margin-bottom: 6px; }
  .builder-meta-top .muted { color: var(--muted); font-weight: 400; margin-left: 4px; }
  .builder-text { font-size: 14px; line-height: 1.55; color: var(--text); margin: 0; }

  .empty { color: var(--muted); font-style: italic; }

  footer.site-footer {
    margin-top: 48px;
    padding: 24px 0 40px;
    border-top: 1px solid var(--border);
    color: var(--muted);
    font-size: 13px;
    text-align: center;
  }
  footer.site-footer code { background: var(--surface); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border); font-size: 12px; }
  footer.site-footer .source-status { margin-top: 8px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
  .status-ok { color: #16a34a; }
  .status-err { color: #dc2626; }
`;

function manifestStatusFooter(manifest) {
  if (!manifest?.sources) return "";
  const entries = Object.entries(manifest.sources);
  return `
    <div class="source-status">
      ${entries
        .map(
          ([name, info]) => `
        <span title="${escapeHtml(info.error || "")}" class="${info.status === "ok" ? "status-ok" : "status-err"}">
          ${info.status === "ok" ? "●" : "○"} ${escapeHtml(name)}
        </span>
      `,
        )
        .join("")}
    </div>
  `;
}

function pickAihotSection(aihotDaily, labelHint) {
  if (!aihotDaily?.sections) return [];
  const sec = aihotDaily.sections.find((s) =>
    s.label?.includes(labelHint),
  );
  return sec?.items || [];
}

async function renderPage({ date, manifest, aihotDaily, aihotModels, aihotProducts, aihotIndustry, aihotPaper, hnTop, hfPopular, xFeed, podFeed, blogFeed, archiveLinks = [] }) {
  // For AIHOT items, prefer the per-category items.json when available
  // (richer), fall back to the daily aggregate's section.
  const modelItems = (aihotModels?.items || aihotModels || pickAihotSection(aihotDaily, "模型")).slice(0, 12);
  const productItems = (aihotProducts?.items || aihotProducts || pickAihotSection(aihotDaily, "产品")).slice(0, 12);
  const industryItems = (aihotIndustry?.items || aihotIndustry || pickAihotSection(aihotDaily, "行业") || pickAihotSection(aihotDaily, "动态")).slice(0, 12);
  const paperItems = (aihotPaper?.items || aihotPaper || pickAihotSection(aihotDaily, "论文")).slice(0, 8);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AI Daily Digest — ${escapeHtml(date)}</title>
  <meta name="description" content="A daily roundup of AI model releases, industry moves, builder voices, and trending signals from Hacker News, HuggingFace, and beyond.">
  <style>${PAGE_CSS}</style>
</head>
<body>

  <header class="hero">
    <h1>AI Daily Digest</h1>
    <p class="date">${escapeHtml(date)} · UTC</p>
    <p class="tagline">Model releases · industry moves · what AI builders are saying · trending signals across Hacker News, HuggingFace, GitHub.</p>
  </header>

  <nav class="toc">
    <ul>
      <li><a href="#models">🤖 Models</a></li>
      <li><a href="#products">📦 Products</a></li>
      <li><a href="#industry">📰 Industry</a></li>
      <li><a href="#papers">📄 Research</a></li>
      <li><a href="#hn">🔥 Hacker News</a></li>
      <li><a href="#hf">🤗 HuggingFace</a></li>
      <li><a href="#builders">🎙 Builder voices</a></li>
      ${archiveLinks.length ? `<li><a href="digests/">🗂 Archive</a></li>` : ""}
    </ul>
  </nav>

  <main class="container">

    <section id="models" class="block">
      <h2><span class="section-icon">🤖</span> Model releases & updates</h2>
      <p class="section-sub">Latest AI model launches, version bumps, and capability releases from the Chinese AI ecosystem (AIHOT). Click <strong>Translate EN</strong> on any card for an English version via Google Translate.</p>
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

    <section id="hn" class="block">
      <h2><span class="section-icon">🔥</span> Hacker News — what's hitting</h2>
      <p class="section-sub">Top AI-relevant front-page stories (AI / LLM / agent items surfaced first).</p>
      ${hnSection(hnTop)}
    </section>

    <section id="hf" class="block">
      <h2><span class="section-icon">🤗</span> HuggingFace — most-loved</h2>
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
  <style>${PAGE_CSS}</style>
</head>
<body>
  <header class="hero"><h1>Archive</h1><p class="date">All past AI Daily Digests</p></header>
  <main class="container">
    <ul class="hn-list">
      ${days
        .map(
          (d) => `<li class="hn-item"><a class="hn-title" href="${escapeHtml(d)}.html">${escapeHtml(d)}</a></li>`,
        )
        .join("")}
    </ul>
  </main>
  <footer class="site-footer"><a href="../">← back to latest</a></footer>
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
const hnTop = await tryReadJson(join(DATA_DIR, "hn-top.json"));
const hfPopular = await tryReadJson(join(DATA_DIR, "hf-popular.json"));

// Follow Builders feeds aren't fetched into our /data — read them on demand
// directly from the upstream raw URLs would be a build-time fetch; for now we
// fetch them in the workflow's render step (see workflow). Here we just attempt
// to read them from data/ if a prior step cached them.
const xFeed = await tryReadJson(join(DATA_DIR, "follow-builders-x.json"));
const podFeed = await tryReadJson(join(DATA_DIR, "follow-builders-podcasts.json"));
const blogFeed = await tryReadJson(join(DATA_DIR, "follow-builders-blogs.json"));

// Existing archive entries
let archiveDays = [];
if (existsSync(DIGESTS_DIR)) {
  const entries = await readdir(DIGESTS_DIR);
  archiveDays = entries
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f))
    .map((f) => f.replace(/\.html$/, ""))
    .sort()
    .reverse();
}

// Render today's page (and add to archive if new)
const pageHtml = await renderPage({
  date: today,
  manifest,
  aihotDaily,
  aihotModels,
  aihotProducts,
  aihotIndustry,
  aihotPaper,
  hnTop,
  hfPopular,
  xFeed,
  podFeed,
  blogFeed,
  archiveLinks: archiveDays,
});

await writeFile(join(SITE_DIR, "index.html"), pageHtml, "utf8");
await writeFile(join(DIGESTS_DIR, `${today}.html`), pageHtml, "utf8");

// Refresh archive index
if (!archiveDays.includes(today)) archiveDays = [today, ...archiveDays];
await writeFile(join(DIGESTS_DIR, "index.html"), await renderArchiveIndex(archiveDays), "utf8");

console.log(`[ok] rendered ${today}.html (latest) + archive (${archiveDays.length} entries)`);
