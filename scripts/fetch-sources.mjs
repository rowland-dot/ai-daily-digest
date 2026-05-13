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

// Extract a one-paragraph TL;DR for an article URL.
//
// Strategy:
//   1. Fast path — fetch the raw HTML and look for <meta og:description>
//      / <meta description> / <meta twitter:description>. Works on most
//      server-rendered news / blog / docs sites in ~1s.
//   2. Slow fallback — call Jina AI Reader (https://r.jina.ai/{url}),
//      which returns clean markdown of the article even for SPAs.
//      Take the first substantial paragraph as the TLDR. ~5-15s/call.
//
// Returns "" if both paths fail.
async function articleSummary(url) {
  if (!url || !/^https?:\/\//.test(url)) return "";
  const fast = await fetchMetaDescription(url);
  if (fast) return fast;
  return await fetchJinaSummary(url);
}

async function fetchMetaDescription(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,*/*" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html")) return "";
    const reader = res.body?.getReader();
    if (!reader) return pickDescription(await res.text());
    let received = 0;
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (received > 200 * 1024) break;
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    return pickDescription(html);
  } catch {
    return "";
  }
}

async function fetchJinaSummary(url) {
  try {
    const res = await fetch("https://r.jina.ai/" + url, {
      headers: { Accept: "text/plain", "X-Return-Format": "text" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return "";
    const text = await res.text();
    // Jina Reader prefixes a brief header (Title:, URL Source:, etc.)
    // then the article body. Skip lines that look like metadata,
    // headings, or markdown link-only lines; take the first prose
    // paragraph long enough to be useful.
    const lines = text.split("\n");
    let body = [];
    let inBody = false;
    for (const ln of lines) {
      const t = ln.trim();
      if (!inBody) {
        // Metadata block ends after the first blank line following "Markdown Content:"
        if (t === "Markdown Content:" || t.startsWith("===") || t.startsWith("Published Time:")) {
          inBody = true;
          continue;
        }
        if (t.startsWith("Title:") || t.startsWith("URL Source:") || t.startsWith("Description:")) {
          continue;
        }
      }
      body.push(ln);
    }
    if (body.length === 0) body = lines; // fallback if header detection failed
    // Find first paragraph with >= 80 chars of prose
    const paragraphs = body.join("\n").split(/\n\s*\n/);
    for (const p of paragraphs) {
      const stripped = p
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
        .replace(/[*_`]/g, "")
        .replace(/\s+/g, " ")
        .trim();
      if (stripped.length >= 80 && stripped.length <= 600) {
        return stripped.slice(0, 400);
      }
    }
    return "";
  } catch {
    return "";
  }
}

function pickDescription(html) {
  const patterns = [
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
    /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  ];
  for (const re of patterns) {
    const m = re.exec(html);
    if (m && m[1]) {
      const out = decodeEntities(m[1]).replace(/\s+/g, " ").trim();
      if (out.length > 30) return out.slice(0, 400);
    }
  }
  return "";
}

async function hnTopStories(count = 30) {
  const ids = await fetchJson("https://hacker-news.firebaseio.com/v0/topstories.json");
  const top = ids.slice(0, count);
  const items = await Promise.all(
    top.map((id) =>
      fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).catch(
        (err) => ({ id, error: String(err.message || err) }),
      ),
    ),
  );
  // Add TL;DR summaries. Try ALL top items with a URL (up to 20) so that
  // the AI-keyword filter at render time picks from a fully-summarised
  // pool. Limited concurrency to keep the build budget bounded.
  const candidates = items.filter((it) => it && it.title && it.url).slice(0, 20);
  const concurrency = 4;
  let idx = 0;
  async function worker() {
    while (idx < candidates.length) {
      const it = candidates[idx++];
      try { it.summary = await articleSummary(it.url); }
      catch { it.summary = ""; }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { fetched_at: new Date().toISOString(), items };
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
  return { fetched_at: new Date().toISOString(), source: "OpenAI", items };
}

async function simonWillison(limit = 12) {
  const xml = await fetchText("https://simonwillison.net/atom/everything/");
  const entries = parseAtomEntries(xml).slice(0, limit);
  return { fetched_at: new Date().toISOString(), source: "Simon Willison", entries };
}

// ---- Run all ----

await runSource("aihot_daily", "aihot-daily.json", aihotDaily);
await runSource("aihot_ai_models", "aihot-ai-models.json", () => aihotItems("ai-models"));
await runSource("aihot_ai_products", "aihot-ai-products.json", () => aihotItems("ai-products"));
await runSource("aihot_industry", "aihot-industry.json", () => aihotItems("industry"));
await runSource("aihot_paper", "aihot-paper.json", () => aihotItems("paper"));
await runSource("hn_top", "hn-top.json", hnTopStories);
await runSource("hf_popular", "hf-popular.json", hfPopular);
await runSource("github_trending", "github-trending.json", githubTrending);
await runSource("openai_blog", "openai-blog.json", openaiBlog);
await runSource("simon_willison", "simon-willison.json", simonWillison);

await writeJson("manifest.json", manifest);
console.log("manifest:", JSON.stringify(manifest.sources, null, 2));

const failures = Object.values(manifest.sources).filter((s) => s.status !== "ok").length;
if (failures > 0) {
  console.warn(`${failures} source(s) failed — see manifest.json`);
}
// Exit 0 regardless — partial data is still useful, and workflow commits what we got.
