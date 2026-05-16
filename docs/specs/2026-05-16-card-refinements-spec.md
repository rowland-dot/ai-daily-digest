# Card Refinements

**Date:** 2026-05-16
**Status:** Draft → user review
**Supersedes:** parts of `2026-05-14-claude-summary-engine-spec.md` (Mix-track language behaviour)
**Companion specs:** the **backend-and-editorial-layer spec** ([`2026-05-17-backend-and-editorial-layer-spec.md`](2026-05-17-backend-and-editorial-layer-spec.md)) covers backend, identity, subscriptions, internal articles, SEO, and the Atom syndication feed. The **monetisation spec** (to be drafted) follows after that ships.

---

## Motivation

Three small, mechanical refinements to the public-facing static site, sequenced ahead of the bigger architectural changes in the backend-and-editorial-layer spec. None of these require a backend, identity, or persistent storage; they only touch the renderer, the audio generator, and the workflow.

1. The **Mix** audio/language track has not earned its complexity. It costs ~⅓ of every TTS run, doubles the number of cached audio files, and degrades to "English with Chinese AIHOT sections" — which is neither a coherent listening experience nor what monolingual readers want. EN and 中文 alone are clearer affordances.
2. **AIHOT cards carry two extra links** (`Read original ↗`, `Translate EN ↗`) that no other card section has. The result is visual inconsistency and an interaction (`Translate EN`) that any modern browser already does in-context.
3. **Card titles should be the link** — the dominant convention across news/aggregator sites, and what every non-AIHOT card on this site already does. The current `Read original ↗` row is a holdover.

---

## Scope

In scope:

- Renderer changes (`scripts/render-site.mjs`)
- Audio generator changes (`scripts/generate-audio.py`)
- Frontend lang-switcher JS (lives inline in `render-site.mjs`)

Out of scope (deferred to the backend-and-editorial-layer spec):

- **Atom syndication feed and `<link rel="alternate">` autodiscovery** (moved to the backend-and-editorial-layer spec for cohesion with the rest of the SEO/syndication bundle: sitemap.xml, news-sitemap.xml, robots.txt, JSON-LD)
- Per-article permalink pages
- sitemap.xml, JSON-LD `NewsArticle`, OpenGraph / Twitter Cards
- RSS 2.0 / JSON Feed
- Email subscription pipeline
- Editor's Cut commentary
- Internal-article hosting

---

## Decisions

### D1 — Drop Mix entirely, EN becomes the default and the lang toggle is session-only (per-page-load)

The Mix track is removed from the audio generator, the lang switcher tab, the audio player JS, and the `audio-cues.json` schema. EN becomes the default selection for both the lang tab and the audio track on every page load.

The lang toggle no longer persists in localStorage. Anonymous visitors get EN on every page load; clicking 中文 re-renders the current page only — navigating to a different page resets to EN. This aligns with the identity model in the backend-and-editorial-layer spec (anonymous users have no per-user state at all; the only persistent home for a language preference is `subscribers.language`, which arrives in the backend spec).

**Why:** Mix saves no time for monolingual users (it's strictly worse than picking your own language) and confuses bilingual users (the boundary is "this section is AIHOT, so it's Chinese," which is implementation-driven, not user-driven). Cost: ~⅓ of TTS runtime per build, one extra audio file per build, one extra track in the cache key. Benefit: zero clear use cases.

**Why no localStorage persistence:** removes a soft "shadow account" surface and gives the language preference a single canonical home once subscribers exist. For visitors today, the cost is one extra click if they want 中文 on subsequent pages — small price for a clean model.

**Cleanup of stored preference:** any browser with a stale `localStorage.lang` key (from before this spec) has it deleted on first load post-deploy. No reads from the key after this spec ships.

### D2 — Remove "Translate EN" from AIHOT cards

The `Translate EN ↗` link (currently `googleTranslateUrl(…)` on AIHOT cards only) is deleted. Browsers ship inline translation; the link is redundant.

### D3 — Title becomes the original-source link on every card

The standalone `Read original ↗` anchor is removed from AIHOT cards. The card's `<h3>` title is wrapped in `<a href="<item.url>" target="_blank" rel="noopener">…</a>`. This matches the existing pattern on the seven non-AIHOT sections and makes the card design uniform.

---

## User-visible behaviours (testable contracts)

### B1 — Lang switcher shows two tabs, EN selected by default

- **Entry point:** any page on the site, top-left lang switcher.
- **User action:** loads the page.
- **Expected result:** two tabs visible, labelled "EN" and "中文". No "Mix" tab. EN is selected on every page load, regardless of any previous in-session choice. No localStorage read for lang.

### B2 — Lang toggle is session-only and re-applies per page load

- **Entry point:** any page on the site.
- **User action:** clicks "中文" → the current page's text re-renders in 中文 → clicks a link to navigate to a different page on the same site.
- **Expected result:** the new page loads in EN (default). The user would have to click "中文" again on the new page. No localStorage write occurs on either page.

### B3 — Stale `localStorage.lang` key is cleaned up on first load

- **Entry point:** any page, with a `localStorage.lang` key set from a pre-spec visit (any value: `"en"`, `"zh"`, `"mix"`).
- **User action:** loads the page.
- **Expected result:** the page loads in EN (default). The renderer's frontend JS deletes the `localStorage.lang` key during init. Subsequent loads no longer see the key.

### B4 — AIHOT card title is the original-source link

- **Entry point:** any AIHOT section (Model releases, Products, Industry, Papers).
- **User action:** clicks the card's title.
- **Expected result:** new tab opens at the article's original URL.

### B5 — AIHOT card has no separate "Read original" or "Translate EN" links

- **Entry point:** any AIHOT card.
- **User action:** visual inspection.
- **Expected result:** no `Read original ↗` anchor, no `Translate EN ↗` anchor. Card body shows: title (linked), upstream Chinese summary, optional listen-from-here button. Same structure as non-AIHOT cards.

### B6 — Audio player exposes two tracks

- **Entry point:** floating 🎧 FAB, expanded.
- **User action:** loads any page.
- **Expected result:** the player loads `digest-en.mp3` by default. Switching the top-left lang tab to 中文 swaps the player to `digest-zh.mp3` at the same playhead-relative cue. No `digest.mp3` (the former Mix track) is referenced anywhere.

---

## Implementation notes

### `scripts/render-site.mjs`

- **Lang switcher (~line 1437):** delete the `<button data-lang="mix">Mix</button>`. Update inline JS that handles tab selection: drop the `"mix"` case; the active tab defaults to `"en"` on every page load (no localStorage read). On init, if `localStorage.digest-lang` exists from a pre-spec visit, delete it (one-time cleanup). Clicking a tab re-renders the current page only — no localStorage write.
- **AIHOT card body (~lines 153–154):** delete both anchor lines (`Read original ↗` and `Translate EN ↗`). Wrap the title in `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">…</a>`.
- **`section-sub` copy (~line 1471):** delete the sentence `Click <strong>Translate EN</strong> on any card for an English version.` from the AIHOT section subtitles.
- **`googleTranslateUrl()` helper:** delete if no other call site remains (grep before removing).

### `scripts/generate-audio.py`

- Delete the Mix-track code path. The three-track loop becomes two tracks (`en`, `zh`).
- Output filenames stay at `digest-en.mp3`, `digest-zh.mp3` (existing dashes preserved); only `digest.mp3` (the former Mix track) is removed.
- `audio-cues.json` is no longer produced; `audio-cues-en.json` and `audio-cues-zh.json` remain.
- Update the audio cache key generator if it includes track names — content-hash basis stays the same, just one less file per output set.

### Frontend audio player JS (inline in `render-site.mjs`)

- Player track-selection: read the active lang tab; map `"en" → digest-en.mp3`, `"zh" → digest-zh.mp3`. Remove the `"mix"` branch.
- Cue-seek logic uses `audio-cues-en.json` or `audio-cues-zh.json` for the "Listen from here" buttons. Drop the `mix` lookup.

---

## Test plan

Per-behaviour testable contracts (B1–B6) above are the acceptance criteria. Each must be verified before sign-off.

- **B1, B2, B3, B5:** browser smoke — open `docs/index.html` locally after a render, walk the steps in DevTools (clear localStorage, set `digest-lang=mix`, etc.).
- **B4:** browser smoke — click an AIHOT title, verify new tab opens at `item.url`. Test in both EN and 中文 modes.
- **B6:** local audio run — `python scripts/generate-audio.py`, confirm exactly two `.mp3` files in `docs/` (`digest-en.mp3`, `digest-zh.mp3`). Switch tabs in the loaded page, verify the `<audio>` element's `src` updates.

No automated test framework is added in this spec — the site has none today and adding one is a concern for the backend-and-editorial-layer spec.

---

## Risks & one-time costs

- **Audio cache wipes once.** First post-deploy build regenerates `digest-en.mp3` and `digest-zh.mp3` from scratch (~6 min combined, down from ~10 min for three tracks). Subsequent runs cache as today.
- **Any external link to `digest.mp3`** (the former Mix track) **will 404.** Search confirms the file isn't promoted outside the site; risk is theoretical.
- **Anyone with a `localStorage.digest-lang` key from a previous visit** has it silently deleted on first load. UX impact: their language preference doesn't carry over, but since the new model is "EN on every page load" anyway, the deletion is just bookkeeping. No user-facing surprise.
- **Visitors who rely on persistent language preference today** lose it. They have to click 中文 on each page they want translated. Trade is captured in D1 — single canonical home for language preference once subscribers exist (in the backend-and-editorial-layer spec).

---

## Cross-spec pointers

- The **backend-and-editorial-layer spec** will add: backend (identity, subscriptions, favourites), per-article permalinks, **Atom syndication feed at `/feed.xml` and `<link rel="alternate">` autodiscovery**, SEO bundle (sitemap.xml, JSON-LD `NewsArticle`, OG/Twitter Cards, canonical URLs), Editor's Cut commentary (per-article + email digest), internal CN-original articles with bilingual support, hosting decision (Cloudflare Pages + Workers being the leading candidate).
- The **monetisation spec** will add: monetisation strategy (built once the backend-and-editorial-layer spec's behaviours are in production and we have real traffic + engagement signals).
