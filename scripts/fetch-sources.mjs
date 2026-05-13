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

async function _fetchJinaContent(url) {
  try {
    const res = await fetch("https://r.jina.ai/" + url, {
      headers: { Accept: "text/plain", "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
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

// Batch helper — fetches essences for many URLs with bounded concurrency.
async function enrichItemsWithEssence(items, urlKey, concurrency = 4) {
  const work = items.filter((it) => it && it[urlKey] && /^https?:\/\//.test(it[urlKey]));
  let idx = 0;
  async function worker() {
    while (idx < work.length) {
      const it = work[idx++];
      try {
        const e = await articleEssence(it[urlKey]);
        if (e) it.summary = e;
      } catch {}
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  saveEssenceCache();
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
await runSource("simon_willison", "simon-willison.json", simonWillison);
await runSource("follow_builders_x", "follow-builders-x.json", () => followBuildersFeed("x"));
await runSource("follow_builders_podcasts", "follow-builders-podcasts.json", () => followBuildersFeed("podcasts"));
await runSource("follow_builders_blogs", "follow-builders-blogs.json", () => followBuildersFeed("blogs"));

await writeJson("manifest.json", manifest);
console.log("manifest:", JSON.stringify(manifest.sources, null, 2));

const failures = Object.values(manifest.sources).filter((s) => s.status !== "ok").length;
if (failures > 0) {
  console.warn(`${failures} source(s) failed — see manifest.json`);
}
// Exit 0 regardless — partial data is still useful, and workflow commits what we got.
