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

async function aihotDaily() {
  return fetchJson("https://aihot.virxact.com/api/public/daily");
}

async function aihotItems(category, limit = 20) {
  return fetchJson(
    `https://aihot.virxact.com/api/public/items?category=${category}&limit=${limit}`,
  );
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
  return [...xml.matchAll(/<entry[^>]*>([\s\S]*?)<\/entry>/g)].map((m) => {
    const block = m[1];
    return {
      title: stripTags(firstMatch(/<title[^>]*>([\s\S]*?)<\/title>/i, block)),
      link: firstMatch(/<link[^>]*href="([^"]+)"/i, block),
      updated: stripTags(firstMatch(/<updated[^>]*>([\s\S]*?)<\/updated>/i, block)),
      summary: stripTags(firstMatch(/<summary[^>]*>([\s\S]*?)<\/summary>/i, block)).slice(0, 400),
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
