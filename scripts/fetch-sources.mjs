// Fetches third-party sources the Claude routine sandbox can't reach
// (host-allowlisted) and writes them to data/*.json so the routine can
// read them via raw.githubusercontent.com.
//
// Sources:
//   - AIHOT (aihot.virxact.com) — requires browser User-Agent
//   - Hacker News (Firebase API) — open, no UA tricks
//   - HuggingFace trending models — open API
//
// Each source writes its raw JSON plus a status entry into manifest.json.
// If any one source fails, the others still get written. The workflow
// always commits whatever it got.

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DATA_DIR = "data";
const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC

const manifest = {
  fetched_at: new Date().toISOString(),
  date_utc: today,
  sources: {},
};

async function writeJson(filename, payload) {
  const path = join(DATA_DIR, filename);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

async function fetchJson(url, { headers = {} } = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA, ...headers },
  });
  const ct = res.headers.get("content-type") || "";
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} :: ${body.slice(0, 200)}`);
  }
  if (!ct.includes("json")) {
    const body = await res.text();
    throw new Error(`Expected JSON, got ${ct} :: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchText(url, { headers = {} } = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA, ...headers },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return res.text();
}

// Tiny helpers for extracting from XML/HTML without a parser dep.
function decodeEntities(s) {
  return String(s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
}

function stripTags(s) {
  // Decode entities first (so &lt;p&gt; becomes <p>), then strip tags.
  // Run twice in case there's double-encoded content (RSS-in-HTML-in-XML).
  let out = decodeEntities(s);
  out = out.replace(/<[^>]+>/g, " ");
  out = decodeEntities(out);
  return out.replace(/\s+/g, " ").trim();
}

function firstParagraph(rawHtmlOrText) {
  // Extract the first SUBSTANTIVE paragraph from an atom <summary> body.
  //
  // Simon Willison's atom summaries follow a specific pattern:
  //   - Tool/Release/Quoting posts begin with a "label paragraph":
  //     <p><strong>Tool:</strong> <a>Link Title</a></p>
  //     ...then the actual content follows in a separate <p> or <blockquote>.
  //   - TIL / blog posts start directly with the content paragraph.
  //   - "Quoting Foo" posts start with a <blockquote>.
  //
  // Treating the label paragraph as "first paragraph" was wrong — it's
  // really a title, not a paragraph. This function skips label-style
  // lead paragraphs and returns the first real content block.

  if (!rawHtmlOrText) return "";
  const decoded = decodeEntities(rawHtmlOrText);

  // Match top-level <p>...</p> and <blockquote>...</blockquote> blocks
  // in source order.
  const blockRe = /<(p|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
  const blocks = [...decoded.matchAll(blockRe)];

  if (blocks.length === 0) {
    // No structured blocks — fall back to first double-newline chunk.
    return stripTags(decoded.split(/\n\s*\n/)[0]);
  }

  // A "label paragraph" looks like:  <strong>Tool:</strong> <a>...</a>
  // or sometimes:                    <strong>Quoting:</strong> ...
  const isLabelPara = (inner) =>
    /^\s*<strong>\s*[A-Z][a-zA-Z ]+\s*:\s*<\/strong>/i.test(inner);

  for (let i = 0; i < blocks.length; i++) {
    const inner = blocks[i][2];
    if (i === 0 && isLabelPara(inner)) continue;
    return stripTags(inner);
  }

  // Everything was a label — return the first (it IS the entire post).
  return stripTags(blocks[0][2]);
}

function firstMatch(re, str, group = 1) {
  const m = re.exec(str);
  return m ? m[group] : "";
}

async function runSource(name, filename, fetcher) {
  const started = Date.now();
  try {
    const data = await fetcher();
    await writeJson(filename, data);
    manifest.sources[name] = {
      status: "ok",
      file: filename,
      ms: Date.now() - started,
    };
    console.log(`[ok] ${name} -> ${filename} (${Date.now() - started}ms)`);
  } catch (err) {
    manifest.sources[name] = {
      status: "error",
      file: null,
      error: String(err.message || err),
      ms: Date.now() - started,
    };
    console.error(`[err] ${name}: ${err.message || err}`);
  }
}

// ---- Sources ----

// Common Chinese transliterations of English brand/product names that we
// want to normalize back to the original English in AIHOT content. Chinese
// AI media often uses these (e.g. 克劳德 = Claude, 黑曜石 = Obsidian).
// Avoids "translating" a Chinese transliteration through Google Translate
// into nonsense when the original English term is what the reader wants.
const ZH_TO_EN_BRANDS = {
  "克劳德": "Claude",
  "黑曜石": "Obsidian",
  "抱抱脸": "Hugging Face",
  "杰米尼": "Gemini",
  "双子座": "Gemini",
  "图灵": "Turing",
  "深寻": "DeepSeek",
  "智谱": "Zhipu",
  "通义千问": "Qwen",
  "扎克伯格": "Zuckerberg",
  "马斯克": "Musk",
  "奥特曼": "Altman",
  "皮查伊": "Pichai",
  "纳德拉": "Nadella",
};

function normalizeChineseTechTerms(text) {
  if (!text || typeof text !== "string") return text;
  let out = text;
  for (const [zh, en] of Object.entries(ZH_TO_EN_BRANDS)) {
    if (out.includes(zh)) out = out.split(zh).join(en);
  }
  return out;
}

function normalizeAihotItems(payload) {
  if (!payload) return payload;
  // Daily aggregate has sections[].items[]; items endpoints have items[] directly.
  const visit = (item) => {
    if (!item || typeof item !== "object") return item;
    if (typeof item.title === "string") item.title = normalizeChineseTechTerms(item.title);
    if (typeof item.summary === "string") item.summary = normalizeChineseTechTerms(item.summary);
    return item;
  };
  if (Array.isArray(payload.items)) payload.items = payload.items.map(visit);
  if (Array.isArray(payload.sections)) {
    payload.sections = payload.sections.map((sec) => {
      if (Array.isArray(sec.items)) sec.items = sec.items.map(visit);
      return sec;
    });
  }
  return payload;
}

async function aihotDaily() {
  return normalizeAihotItems(await fetchJson("https://aihot.virxact.com/api/public/daily"));
}

async function aihotItems(category, limit = 20) {
  return normalizeAihotItems(
    await fetchJson(
      `https://aihot.virxact.com/api/public/items?category=${category}&limit=${limit}`,
    ),
  );
}

// ============================================================
// Article Essence Engine
// ------------------------------------------------------------
// Given a blog/article URL, fetch the actual content (via Jina AI
// Reader so SPAs work) and extract a one-paragraph TL;DR that
// captures the essence — the first 2-3 substantive prose sentences
// of the article body, skipping navigation, headings, share
// buttons, code blocks, lists, and footer chrome.
//
// Used by Simon Willison entries, OpenAI lab posts, and Follow
// Builders blog posts — anywhere we want a real-content summary
// instead of whatever metadata blurb the feed happens to provide.
//
// Results are persisted in data/article-essence-cache.json keyed
// by URL, so unchanged articles are free on subsequent runs.
// ============================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const ESSENCE_CACHE_PATH = "data/article-essence-cache.json";
let _essenceCache = null;

function _loadEssenceCache() {
  if (_essenceCache !== null) return _essenceCache;
  try {
    _essenceCache = existsSync(ESSENCE_CACHE_PATH)
      ? JSON.parse(readFileSync(ESSENCE_CACHE_PATH, "utf8"))
      : {};
  } catch {
    _essenceCache = {};
  }
  return _essenceCache;
}

function saveEssenceCache() {
  if (_essenceCache === null) return;
  try {
    writeFileSync(ESSENCE_CACHE_PATH, JSON.stringify(_essenceCache, null, 2) + "\n");
  } catch (e) {
    console.warn("[essence-cache] save failed:", e.message);
  }
}

function _cleanMarkdown(s) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")            // images
    .replace(/\[\]\([^)]*\)/g, "")                   // empty-text links (share/nav icons)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")         // [text](url) -> text
    .replace(/^#{1,6}\s+/gm, "")                     // heading markers
    .replace(/(?:^|\s)>+\s*/g, " ")                  // blockquote > sigils (anywhere)
    .replace(/[*_`]/g, "")                           // emphasis/code formatting
    .replace(/\s+/g, " ")
    .trim();
}

function _isProseLine(line) {
  const t = line.trim();
  if (!t) return false;
  if (/^#{1,6}\s/.test(t)) return false;            // markdown heading
  if (/^[*+-]\s/.test(t)) return false;             // unordered list
  if (/^\d+\.\s/.test(t)) return false;             // ordered list
  if (/^\|/.test(t)) return false;                  // table row
  if (/^!\[/.test(t)) return false;                 // image
  if (/^```/.test(t)) return false;                 // code fence
  if (/^\[.*\]\(.*\)\s*$/.test(t)) return false;    // bare link
  // Note: blockquote `> ` lines are now KEPT (the > marker is
  // stripped before evaluation) so 'Quoting' posts' actual content
  // can be surfaced. The cleaner below removes the > sigil.
  return true;
}

// Paragraph-level junk filter — sponsorship banners, footer
// boilerplate, share prompts, etc. These technically pass prose
// checks but aren't article essence.
const JUNK_PARAGRAPH_PATTERNS = [
  /^Sponsored by[:\s]/i,
  /^This is a quotation collected by /i,
  /^This is a quotation from /i,
  /^Posted on \d{1,2}(st|nd|rd|th)? /i,
  /^Subscribe to /i,
  /^Share this /i,
  /^Posted by /i,
  /^\(via /i,
  /^Tags?:\s/i,
  /^Filed under/i,
  /^\d+ Comments?$/i,
];

function _isJunkParagraph(text) {
  const t = text.trim();
  if (t.length < 30) return true;
  return JUNK_PARAGRAPH_PATTERNS.some((re) => re.test(t));
}

function _looksLikeProse(text) {
  // Real article prose has sentences and a reasonable word count.
  const words = text.split(/\s+/).length;
  if (words < 12) return false;
  // At least one sentence-ending punctuation followed by space, OR
  // ending in sentence punctuation.
  if (!/[.!?。！？]\s/.test(text) && !/[.!?。！？]$/.test(text.trim())) return false;
  // Reject paragraphs dominated by URL fragments.
  const urlChars = (text.match(/(https?:\/\/|\.com\/|\.io\/|\.org\/|\?\w+=)/g) || []).length;
  if (urlChars > 3 && urlChars * 6 > text.length) return false;
  return true;
}

function _extractEssence(jinaText) {
  // Jina Reader output is: "Title: ...\nURL Source: ...\n...\nMarkdown Content:\n<body>"
  const split = jinaText.split(/\nMarkdown Content:\n/);
  const body = (split[1] || jinaText).trim();
  if (!body) return "";

  const paragraphs = body.split(/\n\s*\n/);

  // Phase 1: collect substantive prose paragraphs (skip nav, lists, code, etc).
  const prose = [];
  for (const p of paragraphs) {
    const lines = p.split("\n").filter(_isProseLine);
    if (lines.length === 0) continue;
    const cleaned = _cleanMarkdown(lines.join(" "));
    if (cleaned.length < 60) continue;
    if (_isJunkParagraph(cleaned)) continue;
    if (!_looksLikeProse(cleaned)) continue;
    prose.push(cleaned);
    if (prose.length >= 4) break; // cap exploration
  }

  if (prose.length === 0) {
    // Phase 2 fallback: relaxed — just take the first paragraph >= 80 chars
    for (const p of paragraphs) {
      const lines = p.split("\n").filter(_isProseLine);
      if (!lines.length) continue;
      const cleaned = _cleanMarkdown(lines.join(" "));
      if (cleaned.length >= 80) return cleaned.slice(0, 400);
    }
    return "";
  }

  // Combine sentences from the prose paragraphs up to ~360 chars total.
  // Capture 2-4 sentences for a true one-paragraph essence.
  const SENTENCE_RE = /[^.!?。！？]+[.!?。！？]+/g;
  let combined = "";
  outer: for (const p of prose) {
    const sentences = p.match(SENTENCE_RE) || [p];
    for (const s of sentences) {
      const candidate = (combined ? combined + " " : "") + s.trim();
      if (candidate.length > 380) break outer;
      combined = candidate;
    }
    if (combined.length >= 200) break;
  }
  return combined.trim().slice(0, 400);
}

// Raw-content cache: stores Jina's full plaintext output keyed by URL.
// Lets us extract BOTH the short essence (one paragraph) AND the full
// body for the routine summarizer from a single Jina fetch per article.
const RAW_CACHE_PATH = "data/article-raw-cache.json";
let _rawCache = null;

function _loadRawCache() {
  if (_rawCache !== null) return _rawCache;
  try {
    _rawCache = existsSync(RAW_CACHE_PATH)
      ? JSON.parse(readFileSync(RAW_CACHE_PATH, "utf8"))
      : {};
  } catch {
    _rawCache = {};
  }
  return _rawCache;
}

function saveRawCache() {
  if (_rawCache === null) return;
  try {
    writeFileSync(RAW_CACHE_PATH, JSON.stringify(_rawCache, null, 2) + "\n");
  } catch (e) {
    console.warn("[raw-cache] save failed:", e.message);
  }
}

async function _fetchJinaContent(url) {
  const cache = _loadRawCache();
  // Only honor non-empty cache hits — empties may be transient Jina
  // failures (rate-limit, timeout, slow render), so retry next run.
  if (typeof cache[url] === "string" && cache[url].length > 0) return cache[url];
  let raw = "";
  try {
    const res = await fetch("https://r.jina.ai/" + url, {
      headers: { Accept: "text/plain", "User-Agent": BROWSER_UA },
      // Increased timeout — Jina occasionally needs longer for
      // JS-rendered pages (Anthropic news/engineering).
      signal: AbortSignal.timeout(45000),
    });
    if (res.ok) raw = await res.text();
  } catch {
    raw = "";
  }
  if (raw) cache[url] = raw;   // cache positives only
  return raw;
}

// Strip Jina headers + markdown formatting to get plaintext body.
// Preserves paragraph breaks (\n\n). Strips images, link targets,
// heading markers, blockquote sigils, emphasis. Used for the routine
// summarizer's input bodies.
function _extractFullBody(jinaText) {
  const split = jinaText.split(/\nMarkdown Content:\n/);
  let body = (split[1] || jinaText).trim();
  if (!body) return "";
  body = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")          // images
    .replace(/\[\]\([^)]*\)/g, "")                 // empty-text links
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")       // [text](url) -> text
    .replace(/^#{1,6}\s+/gm, "")                   // heading markers
    .replace(/^>\s+/gm, "")                        // blockquote sigils
    .replace(/[*_`]/g, "")                         // emphasis/inline-code formatting
    .replace(/\n{3,}/g, "\n\n")                    // collapse 3+ newlines
    .trim();
  return body;
}

export async function articleBody(url) {
  if (!url || !/^https?:\/\//.test(url)) return "";
  const raw = await _fetchJinaContent(url);
  if (!raw) return "";
  return _extractFullBody(raw);
}

export async function articleEssence(url) {
  if (!url || !/^https?:\/\//.test(url)) return "";
  const cache = _loadEssenceCache();
  if (typeof cache[url] === "string") return cache[url];

  const raw = await _fetchJinaContent(url);
  if (!raw) {
    cache[url] = ""; // negative cache to avoid retrying within the day
    return "";
  }
  const essence = _extractEssence(raw);
  cache[url] = essence; // cache success or empty
  return essence;
}

// Same engine as articleEssence(), but the body is already in hand (e.g.
// Reddit RSS ships the OP's self-post body inline, so we don't need a
// Jina fetch — feed the HTML body through the paragraph-split + prose
// filter + one-paragraph synthesis the same way.
function _cleanHtmlBodyToText(htmlBody) {
  // Shared cleanup: HTML → plaintext with paragraph breaks preserved.
  let text = decodeEntities(htmlBody);
  text = text.replace(/<\s*(p|div|br|li|h[1-6])[^>]*>/gi, "\n\n");
  text = text.replace(/<\s*\/\s*(p|div|li|h[1-6])\s*>/gi, "\n\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);
  text = text
    .replace(/\[link\]/gi, " ")
    .replace(/\[comments\]/gi, " ")
    .replace(/^submitted by[\s\S]*?$/gim, " ");
  text = text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
  return text;
}

function essenceFromHtmlBody(cacheKey, htmlBody) {
  if (!htmlBody) return "";
  const cache = _loadEssenceCache();
  if (cacheKey && typeof cache[cacheKey] === "string") return cache[cacheKey];

  const text = _cleanHtmlBodyToText(htmlBody);
  if (!text) return "";

  const essence = _extractEssence(text);
  if (cacheKey) cache[cacheKey] = essence;
  return essence;
}

// Sibling helper used by the article-bodies producer for r/LocalLLaMA:
// returns the FULL cleaned body text (not just the first paragraph).
function fullBodyFromHtmlBody(htmlBody) {
  if (!htmlBody) return "";
  return _cleanHtmlBodyToText(htmlBody);
}

// Batch helper — fetches essences (short one-paragraph summary) AND full
// bodies (for the routine summarizer) for many URLs with bounded
// concurrency. Both come from the same Jina fetch — the raw payload is
// cached so subsequent runs reuse it without re-hitting Jina.
async function enrichItemsWithEssence(items, urlKey, concurrency = 4) {
  const work = items.filter((it) => it && it[urlKey] && /^https?:\/\//.test(it[urlKey]));
  let idx = 0;
  async function worker() {
    while (idx < work.length) {
      const it = work[idx++];
      try {
        const url = it[urlKey];
        // _fetchJinaContent is now cached — calling articleEssence and
        // articleBody back-to-back hits the same cached raw payload.
        const e = await articleEssence(url);
        if (e) it.summary = e;
        const b = await articleBody(url);
        if (b) it.body = b;
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  saveEssenceCache();
  saveRawCache();
}

// Convert a URL slug like "claude-for-small-business" into a Title-Cased
// human title. Used as a fallback when Jina doesn't yield a usable
// document title for an Anthropic news/engineering article.
function _slugToTitle(slug) {
  return slug
    .replace(/^\/?(news|engineering)\//, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// Generic Anthropic index-page scraper. Anthropic has no RSS feed for
// news or engineering — both index pages are React-rendered, but the
// article hrefs AND a sibling <time> element containing a human-formatted
// publish date ARE present in the initial HTML payload. Pulls
// /<root>/<slug> URLs + their dates, dedupes, then enriches each via
// the same Jina essence pipeline OpenAI lab posts use.
async function anthropicIndex(rootPath, limit, sourceLabel) {
  // rootPath is "news" or "engineering"
  const html = await fetchText(`https://www.anthropic.com/${rootPath}`);
  // Match each href + the next "Mon DD, YYYY" date text within ~800 chars
  // after it. News uses <time>...</time>, engineering uses <div
  // class="...__date">...</div> — matching the date text directly avoids
  // the wrapping-tag difference.
  const pairRe = new RegExp(
    `href="(/${rootPath}/[a-z][a-z0-9-]{3,})"[\\s\\S]{0,800}?` +
      `((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\\s+\\d{1,2},?\\s+20\\d{2})`,
    "g",
  );
  // Dedupe while preserving page order (top of page = newest in practice).
  const seen = new Set();
  const found = [];
  for (const m of html.matchAll(pairRe)) {
    const slug = m[1];
    if (seen.has(slug)) continue;
    seen.add(slug);
    found.push({ slug, dateText: (m[2] || "").trim() });
    if (found.length >= limit) break;
  }
  const items = found.map(({ slug, dateText }) => {
    // "May 13, 2026" → ISO via Date.parse (timezoneless, treated as local
    // midnight; close enough for 24h-window filtering at render time).
    let pubDate = "";
    if (dateText) {
      const t = Date.parse(dateText);
      if (!isNaN(t)) pubDate = new Date(t).toISOString();
    }
    return {
      title: _slugToTitle(slug),
      link: `https://www.anthropic.com${slug}`,
      pubDate,
      pubDateText: dateText,
      description: "",
    };
  });
  // Fill .summary via Jina essence engine (same pipeline as OpenAI blog).
  await enrichItemsWithEssence(items, "link");
  return { fetched_at: new Date().toISOString(), source: sourceLabel, items };
}

async function anthropicNews(limit = 16) {
  return anthropicIndex("news", limit, "Anthropic news");
}

async function anthropicEngineering(limit = 16) {
  return anthropicIndex("engineering", limit, "Anthropic engineering");
}

async function hfPopular(limit = 20) {
  // HF API doesn't expose the website's trending score; sort=likes is the
  // closest stable proxy for "what's hot right now".
  const list = await fetchJson(
    `https://huggingface.co/api/models?sort=likes&direction=-1&limit=${limit}`,
  );
  return { fetched_at: new Date().toISOString(), models: list };
}

async function githubTrending() {
  const html = await fetchText("https://github.com/trending?since=daily");
  const articles = [...html.matchAll(/<article class="Box-row">([\s\S]*?)<\/article>/g)];
  const repos = articles.map((m) => {
    const block = m[1];
    const href = firstMatch(/<h2[^>]*>[\s\S]*?<a[^>]*href="(\/[^"]+)"/i, block);
    const slug = href.replace(/^\//, ""); // e.g. "owner/repo"
    const [owner, name] = slug.split("/");
    const description = stripTags(firstMatch(/<p class="col-9[^"]*"[^>]*>([\s\S]*?)<\/p>/i, block));
    const language = stripTags(firstMatch(/<span itemprop="programmingLanguage">([\s\S]*?)<\/span>/i, block));
    const languageColor = firstMatch(/<span class="repo-language-color"[^>]*style="background-color:\s*([^"]+)"/i, block);
    const stars = stripTags(firstMatch(/\/stargazers"[\s\S]*?<\/svg>\s*([\d,]+)/i, block)).replace(/,/g, "");
    const forks = stripTags(firstMatch(/\/forks"[\s\S]*?<\/svg>\s*([\d,]+)/i, block)).replace(/,/g, "");
    const starsToday = stripTags(firstMatch(/([\d,]+)\s*stars?\s*today/i, block)).replace(/,/g, "");
    return {
      owner,
      name,
      url: `https://github.com${href}`,
      description,
      language,
      languageColor,
      stars: stars ? parseInt(stars, 10) : null,
      forks: forks ? parseInt(forks, 10) : null,
      starsToday: starsToday ? parseInt(starsToday, 10) : null,
    };
  });
  return { fetched_at: new Date().toISOString(), repos };
}

function parseRssItems(xml) {
  // Generic RSS 2.0 <item> extractor.
  return [...xml.matchAll(/<item[^>]*>([\s\S]*?)<\/item>/g)].map((m) => {
    const block = m[1];
    return {
      title: stripTags(firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, block)),
      link: stripTags(firstMatch(/<link[^>]*>([\s\S]*?)<\/link>/i, block)),
      pubDate: stripTags(firstMatch(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i, block)),
      description: stripTags(firstMatch(/<description[^>]*>([\s\S]*?)<\/description>/i, block)).slice(0, 400),
    };
  });
}

function parseAtomEntries(xml) {
  // Generic Atom <entry> extractor. <link> uses href= attribute.
  // For <summary>, keep only the first paragraph (per design — atom
  // summaries can contain the entire post body, which makes cards
  // multi-screen tall).
  return [...xml.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/g)].map((m) => {
    const block = m[1];
    return {
      title: stripTags(firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, block)),
      link: firstMatch(/<link[^>]*href="([^"]+)"/i, block),
      updated: stripTags(firstMatch(/<updated[^>]*>([\s\S]*?)<\/updated>/i, block)),
      summary: firstParagraph(firstMatch(/<summary[^>]*>([\s\S]*?)<\/summary>/i, block)),
    };
  });
}

async function openaiBlog(limit = 15) {
  const xml = await fetchText("https://openai.com/news/rss.xml");
  const items = parseRssItems(xml).slice(0, limit);
  // Replace the RSS <description> blurb with a real article essence
  // pulled from the actual blog post.
  await enrichItemsWithEssence(items, "link");
  return { fetched_at: new Date().toISOString(), source: "OpenAI", items };
}

async function simonWillison(limit = 12) {
  const xml = await fetchText("https://simonwillison.net/atom/everything/");
  const entries = parseAtomEntries(xml).slice(0, limit);
  // Replace the atom <summary> (often just the title or a brief
  // first-paragraph fragment) with a proper essence pulled from
  // the actual blog post via Jina Reader.
  await enrichItemsWithEssence(entries, "link");
  return { fetched_at: new Date().toISOString(), source: "Simon Willison", entries };
}

async function localLlama(limit = 14) {
  // r/LocalLLaMA top-of-day via Reddit's Atom feed. Reddit's JSON API
  // returns 403 from GitHub Actions IPs; the RSS path is on a different
  // route and tolerates datacenter traffic.
  //
  // RSS gives us title, link, author, updated, content — but NOT score,
  // comments, or flair. Trade-off we accept for the section to actually
  // populate. The unique UA follows Reddit's API etiquette (platform:
  // app:version (by /u/x)) which earns a lighter rate-limit budget.
  const REDDIT_UA = "web:ai-daily-digest:v1.0 (by /u/rowland-dot)";
  const xml = await fetchText(
    "https://www.reddit.com/r/LocalLLaMA/top.rss?t=day&limit=30",
    { headers: { "User-Agent": REDDIT_UA, "Accept": "application/rss+xml,text/xml,*/*" } },
  );
  const entries = [...xml.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/g)].map((m) => {
    const block = m[1];
    const title = decodeEntities(firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, block));
    const link = firstMatch(/<link[^>]*href="([^"]+)"/i, block);
    const updated = firstMatch(/<updated[^>]*>([\s\S]*?)<\/updated>/i, block);
    const author = firstMatch(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/i, block);
    const contentRaw = firstMatch(/<content[^>]*>([\s\S]*?)<\/content>/i, block);
    // Reddit RSS ships the OP's self-post HTML inline in <content>.
    // Run it through the SAME one-paragraph essence engine used for
    // Simon Willison, OpenAI lab posts, and Follow Builders blogs.
    // Link-posts have no body → essence returns "" → filtered later.
    const summary = essenceFromHtmlBody(link, contentRaw);
    const body = fullBodyFromHtmlBody(contentRaw);
    return {
      title,
      author: (author || "").replace(/^\/u\//, ""),
      updated,
      permalink: link,
      summary,
      body,   // full cleaned plaintext for the routine summarizer
    };
  });
  // Filter: drop posts with no real TLDR (image-only / meme / link-out
  // with no self-post body). These are noise — title alone rarely
  // conveys whether the post is worth opening, and image-driven
  // jokes pollute the section. "If the TLDR engine returns nothing,
  // eliminate on spot." (user rule, 2026-05-14.)
  //
  // Title refinement: when Reddit auto-grabbed a meaningless page
  // title (HF model card "Foo/Bar · Hugging Face", or a bare repo
  // slug "owner/repo" with no spaces), promote the summary's first
  // sentence to title. The slug-style title is moved into a
  // sourceLabel so the original ref stays visible.
  for (const e of entries) {
    if (!e.summary) continue;
    const t = (e.title || "").trim();
    const isHfAuto = /·\s*Hugging Face(?:\s+Spaces)?\s*$/i.test(t);
    const isBareSlug = !/\s/.test(t) && /\//.test(t) && t.length < 80;
    if (!(isHfAuto || isBareSlug)) continue;
    const firstSentence = e.summary.split(/(?<=[.!?])\s+/)[0] || "";
    const clean = firstSentence.replace(/\.+$/, "").trim();
    if (clean.length >= 30 && clean.length <= 200) {
      e.sourceLabel = t;
      e.title = clean;
    }
  }
  const posts = entries.filter((e) => e.summary && e.summary.length >= 60).slice(0, limit);
  return {
    fetched_at: new Date().toISOString(),
    source: "r/LocalLLaMA",
    posts,
  };
}

async function followBuildersFeed(name) {
  // Fetch the upstream Follow Builders feed verbatim. raw.githubusercontent.com
  // serves these JSON files as text/plain, so we fetchText + JSON.parse
  // rather than going through fetchJson's content-type check.
  const raw = await fetchText(
    `https://raw.githubusercontent.com/zarazhangrui/follow-builders/main/feed-${name}.json`,
  );
  const data = JSON.parse(raw);
  // Run essence enrichment on the blogs feed only (X tweets already
  // have body text; podcasts have no article URL to summarise).
  if (name === "blogs" && Array.isArray(data.blogs)) {
    await enrichItemsWithEssence(data.blogs, "url");
  }
  return data;
}

// ---- Run all ----

await runSource("aihot_daily", "aihot-daily.json", aihotDaily);
await runSource("aihot_ai_models", "aihot-ai-models.json", () => aihotItems("ai-models"));
await runSource("aihot_ai_products", "aihot-ai-products.json", () => aihotItems("ai-products"));
await runSource("aihot_industry", "aihot-industry.json", () => aihotItems("industry"));
await runSource("aihot_paper", "aihot-paper.json", () => aihotItems("paper"));
await runSource("hf_popular", "hf-popular.json", hfPopular);
await runSource("github_trending", "github-trending.json", githubTrending);
await runSource("openai_blog", "openai-blog.json", openaiBlog);
await runSource("anthropic_news", "anthropic-news.json", anthropicNews);
await runSource("anthropic_engineering", "anthropic-engineering.json", anthropicEngineering);
await runSource("simon_willison", "simon-willison.json", simonWillison);
await runSource("follow_builders_x", "follow-builders-x.json", () => followBuildersFeed("x"));
await runSource("follow_builders_podcasts", "follow-builders-podcasts.json", () => followBuildersFeed("podcasts"));
await runSource("follow_builders_blogs", "follow-builders-blogs.json", () => followBuildersFeed("blogs"));
await runSource("localllama", "localllama.json", localLlama);

// ---- article-bodies.json ----
// Aggregated input for the Claude summarizer routine. For each in-scope
// article (OpenAI, Anthropic news+engineering, Simon Willison,
// r/LocalLLaMA), emit { url, source, title, body } where body is the
// full cleaned plaintext. Per spec: routine reads this single file,
// writes summaries keyed on URL back to data/claude-summaries.json.
async function buildArticleBodies() {
  // 24h date window — same as the renderer's filterRecent. Articles
  // older than this won't render on the page, so summarising them in
  // the routine wastes token budget.
  const LOOKBACK_HOURS = 24;
  const windowMs = LOOKBACK_HOURS * 60 * 60 * 1000;
  const now = Date.now();
  const withinWindow = (value) => {
    if (value == null) return true; // No date → don't filter (localllama, etc.)
    const ms = typeof value === "number" && value < 1e12 ? value * 1000 : new Date(value).getTime();
    if (isNaN(ms)) return true;
    return now - ms <= windowMs;
  };

  const articles = [];
  let droppedOld = 0;

  const push = (url, source, title, body, pubDate) => {
    if (!url || !body) return;
    if (typeof body !== "string" || body.trim().length < 60) return;
    if (pubDate !== undefined && !withinWindow(pubDate)) {
      droppedOld++;
      return;
    }
    articles.push({ url, source, title: title || "", body: body.trim() });
  };

  const tryRead = (path) => {
    try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
  };

  const openai = tryRead("data/openai-blog.json");
  for (const it of openai?.items || []) push(it.link, "openai-blog", it.title, it.body, it.pubDate);

  const anews = tryRead("data/anthropic-news.json");
  for (const it of anews?.items || []) push(it.link, "anthropic-news", it.title, it.body, it.pubDate);

  const aeng = tryRead("data/anthropic-engineering.json");
  for (const it of aeng?.items || []) push(it.link, "anthropic-engineering", it.title, it.body, it.pubDate);

  const simon = tryRead("data/simon-willison.json");
  for (const e of simon?.entries || []) push(e.link, "simon-willison", e.title, e.body, e.updated);

  // r/LocalLLaMA: no pubDate filter (Reddit RSS already top-of-day curated upstream)
  const llama = tryRead("data/localllama.json");
  for (const p of llama?.posts || []) push(p.permalink, "localllama", p.title, p.body);

  if (droppedOld > 0) {
    console.log(`[article-bodies] dropped ${droppedOld} items older than ${LOOKBACK_HOURS}h`);
  }
  return {
    fetched_at: new Date().toISOString(),
    articles,
  };
}

await runSource("article_bodies", "article-bodies.json", buildArticleBodies);

await writeJson("manifest.json", manifest);
console.log("manifest:", JSON.stringify(manifest.sources, null, 2));

const failures = Object.values(manifest.sources).filter((s) => s.status !== "ok").length;
if (failures > 0) {
  console.warn(`${failures} source(s) failed — see manifest.json`);
}
// Exit 0 regardless — partial data is still useful, and workflow commits what we got.
