# Claude Summary Engine — Spec

**Status:** Approved 2026-05-14
**Owner:** rowland-dot
**Routine:** `trig_01RgkpuoDzTduFNrESeoQRrH` (AI Daily Digest)

## Problem

Three feeds currently surface articles without quality one-paragraph summaries:

| Feed | Current state | Failure mode |
|---|---|---|
| OpenAI blog | Jina first-paragraph extract | Lead-heavy posts: extract misses the actual announcement |
| Simon Willison | Jina first-paragraph extract | Setup quotes/blockquotes get treated as the summary |
| r/LocalLLaMA self-posts | `essenceFromHtmlBody` on RSS body | Variable; some posts bury the point in paragraph 3 |

The reader has to click through to learn what each is about. Meanwhile, the daily Claude routine quota currently produces zero user-visible value.

**Solution:** the routine reads bridged article bodies once per data refresh and writes a JSON of Claude-quality summaries in both English and Chinese. The renderer and audio script prefer Claude summaries when present and fall back to today's behavior when absent.

## Scope

**In scope** — routine generates summaries for:
- OpenAI blog posts (`data/openai-blog.json`)
- **Anthropic news** (`data/anthropic-news.json`) — scraped from `anthropic.com/news`, no RSS available
- **Anthropic engineering** (`data/anthropic-engineering.json`) — scraped from `anthropic.com/engineering`
- Simon Willison weblog entries (`data/simon-willison.json`)
- r/LocalLLaMA self-posts (`data/localllama.json`)

Anthropic posts merge into the 🏢 Lab announcements section alongside OpenAI items at render time, so the section finally lives up to its label.

**Out of scope** — these have good upstream summaries or are excluded by user design:
- AIHOT (Chinese AI media supplies summaries; existing translation handles EN)
- Follow Builders feeds (tweets are full text; pods/blogs upstream-titled)
- GitHub Trending (scraped descriptions only; no Claude summary)
- HuggingFace models (stats + tags only; no Claude summary)

## Targets

Per article, per routine run:

| Setting | Value | Rationale |
|---|---|---|
| Body sent to Claude | **Full article** (no truncation) | User decision: complete context coverage for accurate summarization regardless of cost |
| Output languages | **EN + ZH both, written natively by Claude** | Avoids EN→ZH machine-translation rounding for tech jargon. PRESERVE_TERMS dance not needed for these summaries |
| EN summary length | ~70 words | Matches AIHOT's median Chinese summary information density (~140 char ≈ 70 EN words) |
| ZH summary length | ~140 chars | Matches AIHOT's actual median |
| Push target | Direct to `main` | Triggers GHA fast path immediately; needs routine `Permissions: write` for repo (already configured) |

## Volume

Per-source candidate caps + filters (amended 2026-05-14):

| Source | Cap | Pre-routine filter |
|---|---|---|
| OpenAI blog | OTHER_CAP (16) | 24h date window |
| Anthropic news | OTHER_CAP (16) | 24h date window |
| Anthropic engineering | OTHER_CAP (16) | 24h date window |
| Simon Willison | **12** | 24h date window (routine acts as AI-relevance gate; non-AI Simon posts get omitted) |
| r/LocalLLaMA | **12** | `score≥100 AND (body≥200 chars OR comments≥30)` — JSON-fetched; routine acts as quality gate to drop hardware-anxiety / meme content |

Typical day estimate after filters: ~40 articles in scope. Per article: ~10k chars body + ~70 EN words output + ~140 ZH chars output.

Total per routine run:
- Input: ~100k tokens
- Output: ~12k tokens
- Comfortably within Opus 4.7 routine session budget

## Data flow

```
20:30 UTC cron (or push that touches fetch/audio scripts):
  fetch-sources.mjs:
    - fetches feeds as today
    - reuses existing article-essence-cache.json
    - emits new data/article-bodies.json containing FULL cleaned bodies
      for in-scope URLs only
  GHA hash-checks data → publishes to `data` branch
  GHA renders page v1 with FALLBACK summaries (current Jina/RSS extracts)
  GHA deploys v1
  GHA fires routine via API POST (already wired)

~20:35 UTC:
  Routine reads:
    https://raw.githubusercontent.com/rowland-dot/ai-daily-digest/data/article-bodies.json
  For each article:
    generate ~70 word EN TLDR + ~140 char ZH TLDR via Claude
  Writes data/claude-summaries.json
  git commit + git push origin main
    (if signing wrapper 400s, retry with --no-gpg-sign — pre-approved)

~20:38 UTC:
  Push to main triggers GHA fast-path (paths include data/claude-summaries.json)
  Renderer reads claude-summaries.json
    For each article in in-scope sources:
      summaries[url].en / .zh → render preferred
      missing → fall back to existing Jina/RSS extract
  Audio script: same lookup; chooses Claude summary for narration text
  GHA deploys v2 with Claude summaries + Claude-narrated audio
```

## Schemas

### `data/article-bodies.json` (GHA writes)

```json
{
  "fetched_at": "2026-05-14T20:30:00Z",
  "articles": [
    {
      "url": "https://openai.com/news/...",
      "source": "openai-blog",
      "title": "Article title verbatim from feed",
      "body": "Full cleaned plaintext article body (no markdown, no HTML, no Jina headers)."
    }
  ]
}
```

Sources enumerated: `openai-blog`, `anthropic-news`, `anthropic-engineering`, `simon-willison`, `localllama`.

### `data/claude-summaries.json` (routine writes)

```json
{
  "generated_at": "2026-05-14T20:35:00Z",
  "summaries": {
    "https://openai.com/news/...": {
      "en": "~70 word English summary written by Claude.",
      "zh": "约140字中文摘要。"
    }
  }
}
```

Keyed on canonical URL. URLs missing from `summaries` fall back to existing extract.

## Renderer behavior (`scripts/render-site.mjs`)

The 🏢 Lab announcements section merges items from `openaiBlog.items`, `anthropicNews.items`, and `anthropicEngineering.items` into a single sorted list (by `pubDate` desc, capped to `OTHER_CAP`). Each card carries a source label so the reader can tell which lab posted.

For each in-scope article (across all five feeds):

1. Look up `claudeSummaries.summaries[item.url]`
2. If present:
   - For Mix track / default render: use `.en` (these feeds are English-native)
   - For EN track: use `.en`
   - For ZH track: use `.zh` directly (skip `deep-translator` for this item)
3. If absent: fall back to existing `summary` / Jina-extracted text + `deep-translator` pipeline

The `txAttrs()` helper that embeds translations on each card needs a small update: when a Claude `.zh` exists, use it as `data-tr-zh` instead of the `deep-translator` output.

## Audio behavior (`scripts/generate-audio.py`)

Same lookup. For each article segment:

- Mix / EN track narration: use Claude `.en` if present, else current extract
- ZH track narration: use Claude `.zh` if present, else current extract

No change to TTS voices, segment-anchor pattern, or cache-key shape.

## Routine quality gate (Phase 5)

The routine doubles as a relevance/quality gate for the noisy in-scope
sources. The prompt MUST include drop-rules so the routine OMITS
summaries for posts it judges low-value. The renderer drops in-scope
items that have no Claude summary (after Phase 5 lands), so omission
becomes the page-side filter.

Drop rules for r/LocalLLaMA (omit summary if any apply):
- Hardware-anxiety / build-cost / GPU-price rant with no technical content
- Single-user support thread ("X just stops working", "why won't Y load")
- Meme / joke / image-only post
- Low-effort self-promotion with no substance
- Duplicate of an item already covered in the HuggingFace or GitHub
  Trending sections (model card share where the model is on HF)

Keep rules for r/LocalLLaMA:
- Open-source model releases / weight drops
- Quantization / runtime / hardware benchmark writeups
- Fine-tuning / training techniques
- Paper analyses with substantive commentary
- Tool launches (training UIs, runtimes, debugging utilities)
- Technical deep-dives on local inference

Drop rules for Simon Willison (omit summary if any apply):
- Posts not about AI / LLMs / agents / ML tooling (e.g. pure Datasette
  releases, personal life updates, unrelated tech links)
- Quote posts where the QUOTED content is not about AI / LLMs / agents
  (e.g. quoting someone on web framework choices, not on AI).
- Daily link roundups where none of the linked items are AI-relevant.

Keep rules for Simon Willison:
- LLM / agent capability commentary
- AI tool / prompt-engineering posts
- Quote posts where the QUOTE ITSELF is about AI / LLMs / agents — even
  if Simon adds no commentary, the quote is the substance. ("Quoting
  Boris Mann on '11 AI agents' is meaningless" is a keep, because the
  quote is an AI-relevance statement.)
- Tool / library release notes that ship with AI-relevant features
  (e.g. `llm` CLI version bumps, Datasette plugins for AI use cases).

## Routine prompt requirements

The new prompt replaces the current Editor's Cut prompt entirely.

```
You are the AI Daily Digest's per-article summarizer. Each day you read fresh article bodies from the bridged data and write one short summary per article in BOTH English and Chinese. The site picks them up automatically.

## Step 1 — Fetch article bodies

Fetch: https://raw.githubusercontent.com/rowland-dot/ai-daily-digest/data/article-bodies.json

The response has an `articles` array, each entry has { url, source, title, body }.

## Step 2 — Generate summaries

For each article:
- Read the body
- Write an EN summary (~70 words, single paragraph)
- Write a ZH summary (~140 characters, single paragraph)
- Both grounded in the body. No fabrication.
- Preserve product, lab, and people names verbatim in BOTH languages. Never transliterate "Sam Altman" to "山姆奥特曼", never translate "Claude" to "克劳德".

## Step 3 — Write claude-summaries.json

Output a single file at data/claude-summaries.json:

{
  "generated_at": "<ISO timestamp>",
  "summaries": {
    "<url>": { "en": "...", "zh": "..." }
  }
}

## Step 4 — Commit + push

git add data/claude-summaries.json
git commit -m "summaries: $(date -u +%Y-%m-%d)"
git push origin main

If signing wrapper returns HTTP 400: retry with `git -c commit.gpgsign=false commit`. Pre-approved.
```

## Non-goals

- Editor's Cut / editorial synthesis layer (cut by user 2026-05-14)
- Translation of AIHOT / Follow Builders summaries (handled by existing `deep-translator` pipeline)
- Audio TTS generation (handled by `edge-tts`)
- Summaries for GitHub Trending or HuggingFace (out of scope)

## Cleanup required (Phase 0)

Before building Phase 1, remove Editor's Cut entirely:

- Delete `editorial/today.md`
- In `scripts/render-site.mjs`: remove `readEditorial`, `editorialToHtml`, `tryReadText` (if unused elsewhere), `has.editorial` flag, TOC entry `📝 Editor's Cut`, editorial section render, CSS for `.editorial-*` selectors, `editorial` parameter through `renderPage`
- In `.github/workflows/fetch-sources.yml`: remove `"editorial/**"` from paths trigger
- Update routine prompt in claude.ai/code UI: replace Editor's Cut prompt with the per-article summarizer prompt above
- Update `README.md` to reflect the new routine role

## Build phases

| Phase | Work | Owner |
|---|---|---|
| 0 | Cleanup Editor's Cut | code (me) — ✅ done |
| 1a | New scrapers: Anthropic news + engineering page | code (me) — ✅ done |
| 1b | Merge Anthropic + OpenAI items into the Lab announcements section render | code (me) — ✅ done |
| 1c | `fetch-sources.mjs` emits `data/article-bodies.json` for all in-scope URLs | code (me) — ✅ done |
| 1d | r/LocalLLaMA: switch to JSON fetcher; cap 12; filter `score≥100 AND (body≥200 OR comments≥30)` | code (me) |
| 1e | Simon Willison: cap reduced to 12 | code (me) |
| 2 | Routine prompt rewrite (per-article summarizer + drop-rules for r/LocalLLaMA / Simon) | user (UI paste) |
| 3 | Renderer + audio integration: read `claude-summaries.json`, prefer Claude text | code (me) — ✅ done |
| 4 | First end-to-end test fire; verify file lands; eyeball page output | both — ✅ done |
| 5 | Renderer drops in-scope items without Claude summary (omission = quality gate) | code (me) |
| 6 | Iterate prompt based on real summary quality | both |

## Fallback policy

Soft degradation in every failure mode:

| Failure | Result |
|---|---|
| Routine fails to fire | Page renders with Jina/RSS extracts (today's behavior) |
| Routine fires but produces malformed JSON | Renderer logs the parse error, falls back to extracts |
| Routine produces summaries for some URLs but not others | Per-article fallback: those with Claude summary use it, others use extracts |
| `data/claude-summaries.json` is stale (older than data hash) | Use whatever URLs match; mismatched URLs (new articles since last routine run) use extracts |

No "page broken" state.

## Open questions

None. Spec is approved at all settings.

## References

- Current Jina pipeline: `scripts/fetch-sources.mjs` → `articleEssence()`, `essenceFromHtmlBody()`
- Existing translation pipeline: `scripts/generate-audio.py` → `translate()`, `PRESERVE_TERMS`
- Routine API trigger: `.github/workflows/fetch-sources.yml` → "Fire Editor's Cut routine" step (to be renamed)
- Routine config UI: claude.ai/code → AI Daily Digest routine → Edit
