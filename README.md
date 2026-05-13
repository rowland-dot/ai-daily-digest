# AI Daily Digest

A daily, opinion-free snapshot of what shipped, what trended, and what AI builders are saying — published every weekday morning at a real URL you can bookmark, with a narrated audio version baked in.

**Live site →** https://rowland-dot.github.io/ai-daily-digest/

---

## What it is

A static, single-page reader that aggregates ten distinct AI news/signal sources, renders them into one mobile-friendly page (Linear / Claude themes you can toggle), and generates an MP3 narration with a Microsoft Neural voice so you can listen on commute. Updates automatically every weekday at 06:30 Sydney time (20:30 UTC) via a GitHub Actions workflow — no servers, no databases, no ongoing cost.

The site is intentionally **opinion-free**: no LLM curation, no "editorial" layer, no recommendation algorithm. Every item is rendered with its original title, link to source, and recency metadata. The only signal applied is a 24-hour date window so the reader sees today's content, not a backlog.

---

## What's in the digest

Eleven sections, grouped by interest area:

| # | Section | Source | Date-filtered | Cap |
|---|---|---|---|---|
| 1 | 🤖 Model releases & updates | [AIHOT](https://aihot.virxact.com) (`ai-models`) | last 24h | none |
| 2 | 📦 Products & applications | AIHOT (`ai-products`) | last 24h | none |
| 3 | 📰 Industry moves | AIHOT (`industry`) | last 24h | none |
| 4 | 📄 Research highlights | AIHOT (`paper`) | last 24h | none |
| 5 | 🏢 Lab announcements | [OpenAI News RSS](https://openai.com/news/rss.xml) | last 24h | 16 |
| 6 | ✍ Simon Willison | [Simon's atom feed](https://simonwillison.net/atom/everything/) | last 24h | 16 |
| 7 | 🚀 Trending on GitHub today | [github.com/trending](https://github.com/trending) HTML | n/a (URL = daily) | 16 |
| 8 | 🔥 Hacker News | [HN Firebase API](https://github.com/HackerNews/API) | last 24h | 16 |
| 9 | 🤗 HuggingFace — most-loved | [HF Models API](https://huggingface.co/api/models?sort=likes) | n/a (overall popularity) | 16 |
| 10 | 🎙 Builder voices | [Follow Builders](https://github.com/zarazhangrui/follow-builders) feeds (X + podcasts + blogs) | last 24h | none |

**Caps + date filter rationale.** AIHOT items lack any popularity field, so recency is the only quality signal — keep the 24h filter, no count cap. Follow Builders is curated upstream by Zara Zhang, so we trust the selection and surface everything in window. Other sources have either popularity or are inherently "trending now" lists, where 16 is a comfortable read.

---

## How it works

```
                       ┌──────────────────────────────────────────────┐
                       │   GitHub Actions  (06:30 Sydney weekdays)    │
                       ├──────────────────────────────────────────────┤
                       │                                              │
   AIHOT public API ───▶ fetch-sources.mjs       ──▶ data/*.json      │
   HN Firebase API  ───▶                                              │
   HF Models API    ───▶                              ┃               │
   github.com/trending HTML ─▶                        ┃               │
   OpenAI RSS       ───▶                              ▼               │
   Simon Willison atom ─▶                        generate-audio.py    │
   Follow Builders raw github ─▶                       ┃              │
                                                       │ edge-tts     │
                                                       │ + ffmpeg     │
                                                       ▼              │
                       render-site.mjs  ◀──┐         digest.mp3       │
                                ┃          │                          │
                                ▼          │                          │
                          docs/index.html  └─ embeds <audio>          │
                          docs/digests/                               │
                                ┃                                     │
                                └──────▶  Pages artifact + deploy     │
                                                                      │
                       └──────────────────────────────────────────────┘
                                              ▼
                                  https://rowland-dot.github.io/ai-daily-digest/
```

**Key properties of this design:**

1. **No servers, no databases.** Everything is static HTML + a single MP3 served from GitHub Pages.
2. **No race conditions.** The workflow doesn't commit anything back to the repo — it builds artifacts in CI and deploys them directly to Pages. Code pushes are always fast-forward.
3. **Resilient to source outages.** Each fetcher writes a status to `manifest.json`; if one source fails, the others still render. The site never goes blank.
4. **Reproducible locally.** Clone the repo, run `node scripts/fetch-sources.mjs && node scripts/render-site.mjs`, open `docs/index.html`. That's it.

---

## Using the site

### Reading

Open https://rowland-dot.github.io/ai-daily-digest/ on any device. The page is responsive and theme-aware:

- **Top-right header:** toggle between **Linear** (dark, modernist, lavender accent) and **Claude** (warm cream, coral, serif display). Choice persists per browser via `localStorage`.
- **Sticky TOC:** jump to any section.
- **Each AIHOT card:** "Read original" link to the Chinese source + "Translate EN" button (opens Google Translate inline).
- **Each section:** sources cited inline per item; no "trust me" claims.

### Listening

A floating 🎧 bubble lives in the bottom-right of every page. Tap it to expand the mini-player:

- ▶ Play / pause native browser controls.
- **1× / 1.25× / 1.5× / 1.75× / 2×** speed button (cycles on tap; choice persists per browser).
- ✕ collapses the player back to the bubble.

The audio is ~10–15 minutes depending on the day. Voices auto-switch per section:
- **`zh-CN-XiaoxiaoNeural`** for AIHOT (Chinese)
- **`en-US-AriaNeural`** for English sections

If the daily Edge TTS call rate-limits or fails (rare), the site still deploys without audio; the mini-player shows "Today's narration not yet generated".

### Archive

`/digests/` lists every past digest. Each day is a self-contained HTML snapshot.

---

## Architecture

### Repository layout

```
ai-daily-digest/
├── .github/workflows/
│   └── fetch-sources.yml         # Daily GHA workflow (cron + manual)
├── scripts/
│   ├── fetch-sources.mjs         # Pulls all upstream sources → data/*.json
│   ├── render-site.mjs           # Renders docs/index.html + per-date HTML
│   └── generate-audio.py         # Edge-TTS narration → docs/digest.mp3
├── README.md
└── .gitignore                    # data/ and docs/ are gitignored —
                                  # the workflow builds them in CI only
```

### Data flow per workflow run

1. **`fetch-sources.mjs`** (~3 seconds)
   - Calls every source HTTP API with a browser User-Agent.
   - Writes `data/<source>.json` per source plus `data/manifest.json` (fetched_at + per-source ok/error status).
2. **Follow Builders feeds fetch** (inline curl loop): pulls `feed-x.json`, `feed-podcasts.json`, `feed-blogs.json` from `raw.githubusercontent.com/zarazhangrui/follow-builders`.
3. **`generate-audio.py`** (~30–60 seconds)
   - Builds per-section narration text from the JSON, stripping URLs / markdown / HTML / emoji / hashtags / handles / ISO timestamps before TTS.
   - Calls Microsoft Edge TTS (`edge-tts` Python lib, free, no API key) per section with the appropriate voice.
   - Concatenates segments via `ffmpeg` (re-encoded at 64kbps / 24kHz / mono) → `docs/digest.mp3`.
4. **`render-site.mjs`** (~1 second)
   - Loads all JSON.
   - Applies date filter (last 24h) to chronological sources; cap of 16 on non-AIHOT/non-Follow-Builders sources.
   - Renders `docs/index.html` + `docs/digests/YYYY-MM-DD.html` + `docs/digests/index.html`.
5. **`actions/upload-pages-artifact@v3` → `actions/deploy-pages@v4`**
   - Site is live at the Pages URL within ~30 seconds of trigger.

### Why the sandbox bridge exists

The Claude Code remote-routine sandbox (originally explored for this project) has a strict host allowlist — AIHOT, Hacker News, HuggingFace, and Product Hunt are all blocked. GitHub Actions runners have no such restriction. So this repo's GHA workflow does all the source-fetching, and the routine (if used) reads from `raw.githubusercontent.com` which IS allowlisted.

For this site, the GitHub Action does the whole job end-to-end and the routine is no longer required.

---

## Source attribution & licenses

Inspired by, and in some cases consuming feeds from:

- **AIHOT** by [数字生命卡兹克 (KKKKhazix)](https://github.com/KKKKhazix/khazix-skills) — public REST API at `aihot.virxact.com`. Chinese AI ecosystem coverage.
- **Follow Builders** by [Zara Zhang (zarazhangrui)](https://github.com/zarazhangrui/follow-builders) — curated daily feed of AI builders on X, podcasts, and blogs.
- **BuilderPulse** concept by [Liu Xiaopai (BuilderPulse)](https://github.com/BuilderPulse/BuilderPulse) — cross-validating activity across HN / GitHub Trending / HF / etc. We replicate the *concept* (not the proprietary data feed) by fetching the underlying sources directly.

Each item on the page links to its original source. No content is reproduced beyond title + summary preview.

---

## Local development

### Requirements

- Node.js ≥ 20 (for the renderer + fetcher)
- Python ≥ 3.11 (for the audio generator) — optional unless you want to test audio locally
- `ffmpeg` on `PATH` (audio concat) — optional, same reason

### Quick start

```bash
git clone https://github.com/rowland-dot/ai-daily-digest.git
cd ai-daily-digest

# Fetch the upstream sources
node scripts/fetch-sources.mjs

# (optional) generate the narration MP3 locally
pip install edge-tts
python scripts/generate-audio.py

# Render the site
node scripts/render-site.mjs

# Preview
open docs/index.html       # macOS
start docs/index.html      # Windows
xdg-open docs/index.html   # Linux
```

`data/` and `docs/` are gitignored — local previews don't pollute commits.

### Adding a new source

1. Add a fetcher in `scripts/fetch-sources.mjs` following the existing pattern (one async fn, register via `runSource`).
2. Add a section in `scripts/render-site.mjs` (one builder fn + one `<section>` in the page template + a TOC entry).
3. Add narration in `scripts/generate-audio.py` if it should appear in the MP3 too.
4. Decide whether the source is chronological (apply 24h filter) or "trending now" (skip the filter).

### Configuration knobs

In `scripts/render-site.mjs` and `scripts/generate-audio.py`:

- `LOOKBACK_HOURS` — date-window for chronological sources (default `24`)
- `OTHER_CAP` — max items per non-AIHOT/non-FB section (default `16`)
- `MAX_TTS_CHARS` (audio only) — split section text into multiple TTS calls above this length (default `3500`, well under edge-tts's practical per-call limit)

---

## Deployment

GitHub Pages is configured with `build_type=workflow` — Pages serves whatever the most recent workflow run uploaded as an artifact. No branch tracking, no `/docs` folder source.

The workflow's permissions:
- `contents: read` — we never push to the repo from CI
- `pages: write` — required for the deploy step
- `id-token: write` — required by `actions/deploy-pages@v4`

---

## Operational notes

- **Empty sections on slow days are expected.** If AIHOT papers had nothing publish in 24h, the section will say "No items in the last 24 hours." That's correct behavior, not a bug.
- **Wide date variance is fine.** Some days a section has 5 items, others 15. The cap is a ceiling, not a target.
- **Source ordering is preserved.** AIHOT items are already returned date-desc by the API; we don't re-sort. HF popular is sorted by likes via the API request. HN comes back ranked.

---

## License

The site code (this repo) is MIT.

Content from upstream sources is owned by its original publishers and surfaced here under fair-use snippet conventions (title + short summary + link to source). BuilderPulse content is CC BY-NC 4.0; commercial reuse of its data requires permission from Liu Xiaopai (not this project).

---

## Contributing

This is a personal daily-reader project, but PRs are welcome — especially for:

- New high-signal sources (with date or popularity metadata)
- Theme additions (port a profile from [awesome-design-md](https://github.com/sandboxes/awesome-design-md) following the Linear/Claude pattern in `scripts/render-site.mjs`)
- Accessibility improvements
- Bug fixes

Keep changes additive — the architecture's main invariant is that **no two writers ever push to `main` simultaneously**. The CI builds artifacts in-runner and deploys via Pages artifact; it never commits. That's what keeps the local dev loop simple. Maintain it.
