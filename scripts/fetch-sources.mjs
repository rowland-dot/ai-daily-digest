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

// ---- Run all ----

await runSource("aihot_daily", "aihot-daily.json", aihotDaily);
await runSource("aihot_ai_models", "aihot-ai-models.json", () => aihotItems("ai-models"));
await runSource("aihot_ai_products", "aihot-ai-products.json", () => aihotItems("ai-products"));
await runSource("aihot_industry", "aihot-industry.json", () => aihotItems("industry"));
await runSource("aihot_paper", "aihot-paper.json", () => aihotItems("paper"));
await runSource("hn_top", "hn-top.json", hnTopStories);
await runSource("hf_popular", "hf-popular.json", hfPopular);

await writeJson("manifest.json", manifest);
console.log("manifest:", JSON.stringify(manifest.sources, null, 2));

const failures = Object.values(manifest.sources).filter((s) => s.status !== "ok").length;
if (failures > 0) {
  console.warn(`${failures} source(s) failed — see manifest.json`);
}
// Exit 0 regardless — partial data is still useful, and workflow commits what we got.
