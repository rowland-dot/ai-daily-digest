# AI Daily Digest

A daily, machine-curated snapshot of what shipped, what trended, and what AI builders are saying — published every morning at a real URL you can bookmark, with a narrated audio version baked in. Per-article summaries are written by a Claude routine; everything else is aggregated automatically.

**Live site →** https://rowland-dot.github.io/ai-daily-digest/

---

## What it is

A static page that aggregates ten AI news/signal sources, layers Claude-generated one-paragraph TLDRs (EN + 中文) on top of three of them, and produces an MP3 narration with Microsoft Edge TTS so you can listen on commute. Updates automatically every day at 06:30 Sydney time (20:30 UTC) via a GitHub Actions workflow + a Claude Code routine. No servers, no databases, no ongoing cost. The routine quota is the only metered resource and it's free at the Pro Max tier.

Two themes: **Linear** (dark, lavender) and **Claude** (warm cream, coral). Three audio tracks: **Mix** (each section in its native language), **EN**, **中文**. Claude EN/中文 summaries are written natively by the routine — no machine-translation rounding for tech jargon.

---

## What's in the digest

| # | Section | Source | Date filter | Cap | Quality gate |
|---|---|---|---|---|---|
| 1 | 🤖 Model releases & updates | [AIHOT](https://aihot.virxact.com) (`ai-models`) | last 24h | none | upstream curation |
| 2 | 📦 Products & applications | AIHOT (`ai-products`) | last 24h | none | upstream curation |
| 3 | 📰 Industry moves | AIHOT (`industry`) | last 24h | none | upstream curation |
| 4 | 📄 Research highlights | AIHOT (`paper`) | last 24h | none | upstream curation |
| 5 | 🏢 Lab announcements | [OpenAI News RSS](https://openai.com/news/rss.xml) + Anthropic news scrape + Anthropic engineering scrape | last 24h | 16/source | first-party |
| 6 | ✍ Simon Willison | [Atom feed](https://simonwillison.net/atom/everything/) | last 24h | 12 | **Claude-gated** (drops non-AI posts) |
| 7 | 🚀 Trending on GitHub today | [github.com/trending](https://github.com/trending) HTML scrape | n/a | 16 | rank-only |
| 8 | 🤗 HuggingFace — most-loved | [HF Models API](https://huggingface.co/api/models?sort=likes) | n/a | 16 | rank-only |
| 9 | 🎙 Builder voices | [Follow Builders](https://github.com/zarazhangrui/follow-builders) feeds (X + podcasts + blogs) | n/a (upstream curated) | none | upstream curation |
| 10 | 🦙 r/LocalLLaMA | Reddit JSON `top.json?t=day` | n/a (top-of-day) | 12 | `score≥100 AND (body≥200 OR comments≥30)` + **Claude-gated** |

**Claude summary layer:** OpenAI / Anthropic / Simon / r/LocalLLaMA cards display Claude-written EN summaries (~70 words) with native ZH translations on the language switcher. AIHOT cards keep their upstream Chinese summaries. GitHub + HF + Builders show metadata only.

**Claude quality gate (Phase 5):** for the noise-prone Simon and r/LocalLLaMA sections, the routine omits summaries for posts it judges off-topic. The renderer drops items that have no Claude summary, so routine omission is the page-side filter.

---

## How it works

```
                           daily 20:30 UTC
                                 │
                                 ▼
              ┌──────────────────────────────────────┐
              │  GHA cron — full pipeline            │
              │  ─ fetch all sources                 │
              │  ─ build article-bodies.json         │
              │  ─ publish to `data` branch          │
              │  ─ render page v1 (Jina fallback)    │
              │  ─ deploy v1 to Pages                │
              │  ─ POST → routine fire endpoint      │
              └──────────────────────┬───────────────┘
                                     │
                                     ▼
              ┌──────────────────────────────────────┐
              │  Claude Code routine                 │
              │  ─ reads article-bodies.json from    │
              │    raw.githubusercontent.com         │
              │  ─ writes ~70w EN + ~140 char ZH     │
              │    summary per in-scope article      │
              │  ─ omits summaries for noise         │
              │  ─ commits data/claude-summaries.json│
              │    to main, push                     │
              └──────────────────────┬───────────────┘
                                     │
                                     ▼
              ┌──────────────────────────────────────┐
              │  GHA fast-path                       │
              │  (triggered by data/                 │
              │   claude-summaries.json change)      │
              │  ─ render page v2                    │
              │  ─ regen audio with Claude EN/ZH     │
              │  ─ deploy v2                         │
              └──────────────────────┬───────────────┘
                                     │
                                     ▼
              https://rowland-dot.github.io/ai-daily-digest/
```

Total time cron-fire to v2-live: ~15 min on a typical day.

**Two-mode workflow design:**

- **Full mode** (cron / workflow_dispatch / push that touches fetch or audio scripts) — full fetch + audio regen, ~12 min.
- **Fast mode** (any other push to `main`) — restores cached state from the last full run + just re-renders + redeploys, ~2 min.

Audio cache key includes a content hash of the data files, so audio is regenerated when (and only when) the underlying article set changes.

**Branch model:**

- `main` — code + spec + the latest `data/claude-summaries.json`. The only branch the page renders from.
- `data` — bot-only snapshots of `data/*.json` (article bodies + per-source feeds). Routine reads from here. Local pushes never touch this branch.

---

## The Claude routine layer

A daily Claude Code routine (`trig_01RgkpuoDz...`) on the user's Pro Max account does the editorial layer:

1. **Read** `data/article-bodies.json` from the `data` branch (raw.githubusercontent.com is allowlisted in the routine sandbox; `*.github.io` is not).
2. **Decide which posts to summarize.** Per the in-prompt drop-rules, posts that are hardware anxiety / single-user support / memes / off-topic get omitted. First-party lab posts are always summarized.
3. **Write** a ~70-word English summary + a ~140-character Chinese summary per kept article, grounded in the body, no fabrication, names verbatim (no "Sam Altman" → "山姆奥特曼").
4. **Commit** `data/claude-summaries.json` to `main` and push.

The routine is wired three ways:

- **Cron** — daily at 7am Sydney (21:00 UTC), 30 min after the GHA cron publishes fresh data.
- **API** — GHA's daily build POSTs to the routine's fire endpoint (`api.anthropic.com/v1/claude_code/routines/<id>/fire`) so the routine triggers immediately after fresh data lands. Gated to schedule + workflow_dispatch only — code pushes don't fire it.
- **Manual** — "Run now" button in claude.ai/code routine UI.

All three converge on the same loop. The routine's commit triggers the GHA fast-path, which re-renders the page with Claude EN/中文 summaries.

---

## Using the site

### Reading

Open https://rowland-dot.github.io/ai-daily-digest/. Mobile-friendly, theme + language switchers in the top-left.

- **Theme switcher (top-right):** Linear / Claude
- **Language switcher (top-left):** Mix / EN / 中文 — swaps card text + audio track
- **Sticky TOC:** jump to any section
- **AIHOT cards:** "Read original" link + "Translate EN" inline
- **All other cards:** original-source link + Claude-summary blurb
- **🎙 "Listen from here" button** (per article card with a matching audio cue): seeks the FAB player to that article

### Listening

A floating 🎧 bubble lives bottom-right. Tap to expand:

- ▶ Play / pause
- Speed cycle: 1× / 1.25× / 1.5× / 1.75× / 2×
- ✕ collapse

Audio is ~10–20 minutes depending on day. Voices auto-switch per language track:
- **`zh-CN-XiaoxiaoNeural`** for Mandarin (Mix track AIHOT sections, full ZH track)
- **`en-US-AriaNeural`** for English (Mix track non-AIHOT, full EN track)

### Archive

`/digests/` lists every past digest as a self-contained HTML snapshot.

---

## Architecture

### Repository layout

```
ai-daily-digest/
├── .github/workflows/
│   └── fetch-sources.yml         # Cron + push triggers, full/fast modes
├── scripts/
│   ├── fetch-sources.mjs         # Pulls all sources → data/*.json,
│   │                             # builds article-bodies.json
│   ├── render-site.mjs           # Renders docs/*.html, applies Claude
│   │                             # summaries + Phase 5 quality gate
│   └── generate-audio.py         # Edge-TTS narration (3 tracks),
│   │                             # uses Claude summaries when present
├── docs/specs/
│   └── 2026-05-14-claude-summary-engine-spec.md   # Source of truth
├── data/
│   └── claude-summaries.json     # Routine-written, tracked
│   (everything else in data/ is gitignored — built in CI)
├── README.md
└── .gitignore                    # data/* gitignored except
                                  # claude-summaries.json; docs/<build outputs>
                                  # gitignored, docs/specs tracked
```

### Data flow per workflow run (full mode)

1. **Restore caches** — pipeline-state cache (data + audio + cues from the last successful full run) and helpers cache (translation + article-essence).
2. **`fetch-sources.mjs`** (~30s) — fetches every source HTTP API; runs Jina Reader for OpenAI / Anthropic / Simon article bodies; assembles `data/article-bodies.json` for the routine; emits per-source JSON + `manifest.json`.
3. **Hash data + restore audio cache** — audio cache key = content hash of `data/*.json` (excluding caches + `article-bodies.json` + `claude-summaries.json` — those are derived). Same data → audio cache hit → skip TTS.
4. **`generate-audio.py`** (~10 min on cache miss) — three TTS tracks (Mix / EN / ZH); applies Claude EN/ZH overlay so narration uses Claude text; outputs `digest.mp3` + `audio-cues.json` per track.
5. **Publish data to Pages + `data` branch** — `data/*.json` to `docs/data/` for browser view, and to the `data` branch for the routine.
6. **Fire summarizer routine (cron + manual only)** — POST to the routine's fire endpoint with the auth token.
7. **`render-site.mjs`** (~1s) — reads JSON; applies Claude summary overlay; applies Phase 5 quality gate (drops Simon + r/LocalLLaMA items without Claude summary); renders `docs/index.html` + `docs/digests/YYYY-MM-DD.html` + `docs/digests/index.html`.
8. **Upload Pages artifact + deploy** — site live within ~30s.

### Sandbox bridge

The Claude Code routine sandbox has a host allowlist that blocks `*.github.io` and many third-party APIs (AIHOT, Reddit JSON, etc.) but ALLOWS `raw.githubusercontent.com`. So:

- The GHA workflow does all upstream fetching from a runner with no allowlist restriction.
- The aggregated `data/article-bodies.json` is published to a dedicated `data` branch in the same repo.
- The routine reads from `https://raw.githubusercontent.com/rowland-dot/ai-daily-digest/data/article-bodies.json`, summarizes, commits back to `main` (where it has write permission via the routine's repo connector).

This bridge is what lets the routine participate without needing host-allowlist changes on Anthropic's side.

---

## Source attribution & licenses

Inspired by, and in some cases consuming feeds from:

- **AIHOT** by [数字生命卡兹克 (KKKKhazix)](https://github.com/KKKKhazix/khazix-skills) — public REST API at `aihot.virxact.com`. Chinese AI ecosystem coverage.
- **Follow Builders** by [Zara Zhang (zarazhangrui)](https://github.com/zarazhangrui/follow-builders) — curated daily feed of AI builders on X, podcasts, and blogs.
- **Anthropic** — `anthropic.com/news` and `anthropic.com/engineering` HTML scrape (no RSS feed available).
- **OpenAI** — `openai.com/news/rss.xml`.
- **Simon Willison** — `simonwillison.net/atom/everything/`.
- **r/LocalLLaMA** — Reddit JSON `top.json?t=day`.
- **HuggingFace** — `huggingface.co/api/models?sort=likes`.
- **GitHub Trending** — `github.com/trending` HTML scrape.

Each item on the page links to its original source. No content is reproduced beyond title + summary preview.

---

## Local development

### Requirements

- Node.js ≥ 20 (renderer + fetcher)
- Python ≥ 3.11 (audio generator) — optional unless testing audio locally
- `ffmpeg` on `PATH` (audio concat) — optional, same reason

### Quick start

```bash
git clone https://github.com/rowland-dot/ai-daily-digest.git
cd ai-daily-digest

# Fetch upstream sources
node scripts/fetch-sources.mjs

# (optional) generate the narration MP3 locally
pip install edge-tts deep-translator
python scripts/generate-audio.py

# Render the site
node scripts/render-site.mjs

# Preview
open docs/index.html       # macOS
start docs/index.html      # Windows
xdg-open docs/index.html   # Linux
```

`data/*` and `docs/<generated>` are gitignored — local previews don't pollute commits. Specs in `docs/specs/` and the Claude summaries file at `data/claude-summaries.json` ARE tracked (gitignore carve-outs).

### Adding a new source

1. Add a fetcher in `scripts/fetch-sources.mjs` (one async fn, register via `runSource`).
2. If it should feed the Claude summarizer, also add it to `buildArticleBodies()` so its bodies land in `data/article-bodies.json`.
3. Add a section in `scripts/render-site.mjs` (one builder fn + one `<section>` + a TOC entry).
4. Add narration in `scripts/generate-audio.py` if it should appear in the MP3.
5. Update the spec at `docs/specs/2026-05-14-claude-summary-engine-spec.md` and the routine prompt drop-rules to cover the new source.

### Configuration knobs

In `scripts/fetch-sources.mjs`:
- r/LocalLLaMA: `SCORE_MIN`, `BODY_MIN`, `COMMENTS_MIN` heuristic filter thresholds; `limit` cap (currently 12)
- Simon Willison: `limit` cap (currently 12)
- 24h date window: `LOOKBACK_HOURS` in `buildArticleBodies()` (currently 24)

In `scripts/render-site.mjs`:
- `LOOKBACK_HOURS` — date-window for chronological sources (default `24`)
- `OTHER_CAP` — max items per section that doesn't have its own cap (default `16`)
- Per-section caps: Simon (12), r/LocalLLaMA (12) hard-coded inline

In `scripts/generate-audio.py`:
- `MAX_TTS_CHARS` — split section text into multiple TTS calls above this length (default `3500`)
- `_PRESERVE_RE` + `_NAME_PATTERN_RE` — names + brand terms that bypass deep-translator's Chinese transliteration

---

## Deployment

GitHub Pages is configured with `build_type=workflow` — Pages serves whatever the most recent workflow run uploaded as an artifact. No branch tracking, no `/docs` folder source.

Workflow permissions:
- `contents: write` — needed to push `data/*.json` snapshots to the `data` branch
- `pages: write` — required for the deploy step
- `id-token: write` — required by `actions/deploy-pages@v4`

GHA secret `CLAUDE_ROUTINE_TOKEN` holds the OAuth token for the routine fire endpoint.

---

## Operational notes

- **Empty sections are expected on slow days.** AIHOT papers section with no items in 24h shows "No items in the last 24 hours." Same for Simon / r/LocalLLaMA when the routine drops everything as off-topic.
- **The routine quota is the only metered resource.** Free at Pro Max tier (one daily routine run). Code pushes mid-day NO LONGER auto-fire the routine — it's gated to cron + manual triggers (since 2026-05-14).
- **Audio cache invalidates on content change, not schedule.** Same data → cached audio reused. New data (new article from any source, or new Claude summary) → audio regenerates.
- **Source ordering is preserved.** AIHOT items date-desc by API. HF popular by likes. r/LocalLLaMA by score. Lab section: OpenAI then Anthropic news then engineering, in scrape order within each.

---

## License

The site code (this repo) is MIT.

Content from upstream sources is owned by its original publishers and surfaced here under fair-use snippet conventions (title + short summary + link). BuilderPulse content (concept inspiration only) is CC BY-NC 4.0; commercial reuse of its data requires permission from Liu Xiaopai (not this project).

---

## Contributing

This is a personal daily-reader project. PRs welcome for:

- New high-signal sources (with date or popularity metadata)
- Theme additions (port a profile from [awesome-design-md](https://github.com/sandboxes/awesome-design-md) following the Linear/Claude pattern in `scripts/render-site.mjs`)
- Accessibility improvements
- Bug fixes

Architecture invariants to preserve:
- The page renders entirely from `main`. The `data` branch is bot-only and never merged into main.
- Routine output is the only "AI-generated" content; the rest is straight aggregation. Don't add LLM curation outside the routine boundary.
- The pipeline tolerates source outages — every fetcher writes a status to `manifest.json` and the page still renders if some sources fail.
