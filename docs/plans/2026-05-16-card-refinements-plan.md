# Card Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three small refinements to the public static site: drop the Mix audio/lang track, simplify AIHOT cards (title-as-link, no Translate/Read-original anchors), and update CI cache shape to match.

**Architecture:** All changes land in three files: `scripts/render-site.mjs`, `scripts/generate-audio.py`, `.github/workflows/fetch-sources.yml`. No backend, no identity, no persistent storage, no new generated artifacts.

**Tech Stack:** Node 20 (ESM, no deps for renderer), Python 3.11 + `edge-tts` for narration, GitHub Actions for daily build.

**Spec:** [`docs/specs/2026-05-16-card-refinements-spec.md`](../specs/2026-05-16-card-refinements-spec.md)

**Out of scope (moved to the backend-and-editorial-layer spec):** the Atom syndication feed at `/feed.xml` and its `<link rel="alternate">` autodiscovery — these moved into the backend-and-editorial-layer spec (D11 + B14 + B15) so they ship as part of the broader SEO/syndication bundle (sitemap.xml, JSON-LD, OG/Twitter Cards). The card-refinements branch does NOT touch feed code.

**Pre-locked decisions (confirmed with user 2026-05-17):**
- MP3 filenames stay at the existing dashes: `digest-en.mp3`, `digest-zh.mp3`. The spec's `(already the case)` parenthetical was incorrect; we only delete `digest.mp3` (the mix track). This preserves the audio cache key shape and avoids renaming six paths in the workflow.
- localStorage cleanup deletes `digest-lang` (the actual key the existing JS writes), not the spec's casual `localStorage.lang` shorthand. There is no `lang` key in pre-spec visitor storage.

**Operational notes:**
- No automated test framework exists in this repo; verification is per-behaviour browser smoke (B1–B6).
- Work on a feature branch from `main`; commit each task atomically.
- After Task 4, run a local end-to-end build (`node scripts/render-site.mjs`) to regenerate `docs/index.html` from existing cached `data/*.json`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `scripts/render-site.mjs` | HTML renderer, embedded LANG_SWITCH_SCRIPT + AUDIO_PLAYER_SCRIPT | Modify |
| `scripts/generate-audio.py` | TTS per-language track render + cues | Modify |
| `.github/workflows/fetch-sources.yml` | CI cache keys + fast-mode-fallback existence check | Modify |
| `docs/specs/2026-05-16-card-refinements-spec.md` | Spec | Read-only |

Each task below produces a self-contained commit.

---

## Task 1: Remove Mix from the audio generator

**Files:**
- Modify: `scripts/generate-audio.py:30-38` (LANGUAGE_TRACKS constant), `scripts/generate-audio.py:1027-1036` (track dispatch + return code)

- [ ] **Step 1: Replace the LANGUAGE_TRACKS list**

In `scripts/generate-audio.py` around line 33, replace the three-entry list with two entries (drop `("mix", None)`):

```python
# Two tracks, one per supported language. Each entry: (lang_code, voice).
LANGUAGE_TRACKS = [
    ("en", EN_VOICE),
    ("zh", ZH_VOICE),
]
```

- [ ] **Step 2: Replace the explicit `render_track` calls at the bottom of main()**

Around line 1027, replace the three-call block + `if not ok_mix` guard with a loop over the new constant:

```python
    # Render each track. Failure of either track returns non-zero so the
    # workflow surfaces the error and skips publish.
    all_ok = True
    for lang_code, voice in LANGUAGE_TRACKS:
        out_mp3 = SITE / f"digest-{lang_code}.mp3"
        cues_out = SITE / f"audio-cues-{lang_code}.json"
        ok = render_track(lang_code, voice, out_mp3, cues_out)
        if not ok:
            all_ok = False

    _save_trans_cache()

    if not all_ok:
        return 1
    return 0
```

- [ ] **Step 3: Update the module docstring to reflect two tracks**

`scripts/generate-audio.py:1-12` — change `concatenates the per-section MP3s into docs/digest.mp3.` to `concatenates the per-section MP3s into docs/digest-en.mp3 and docs/digest-zh.mp3 (one MP3 per supported language).`. Update the comment at line 750 from `docs/digest.mp3` to `docs/digest-en.mp3` (the new "presence canary" file the restore helper uses).

- [ ] **Step 4: Delete the `mix` segment directory cleanup branch (if present) and the `audio-concat-mix.txt` reference**

Search for any other `mix`-keyed branches in the file (`grep -n '"mix"\|/mix/' scripts/generate-audio.py`). The `seg_dir = SEGS / track_lang` line stays generic; with `"mix"` dropped from `LANGUAGE_TRACKS`, no `audio-segments/mix/` directory is created on new runs. Existing on-disk `audio-segments/mix/` is left alone (cleared by next cache refresh).

- [ ] **Step 5: Manual verify locally (optional, slow)**

If ffmpeg + edge-tts + the data snapshot are available locally:

Run: `python scripts/generate-audio.py`
Expected: console prints `--- Track [en] -> digest-en.mp3 ---` then `--- Track [zh] -> digest-zh.mp3 ---`. No `Track [mix]` line. `ls docs/*.mp3` shows exactly `digest-en.mp3` and `digest-zh.mp3`. No `docs/digest.mp3`, no `docs/audio-cues.json`.

If ffmpeg/edge-tts are not installed locally, skip this step; CI will exercise it on the next full run.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-audio.py
git commit -m "feat(audio): drop Mix track — render EN + ZH only

Removes the mix entry from LANGUAGE_TRACKS and replaces the
explicit three-call dispatch with a loop. Output set is now
digest-en.mp3 + digest-zh.mp3 (and matching audio-cues-*.json);
digest.mp3 and audio-cues.json are no longer produced.

Per docs/specs/2026-05-16-card-refinements-spec.md D1."
```

---

## Task 2: Remove Mix from the renderer's audio embed + language defaults

**Files:**
- Modify: `scripts/render-site.mjs` — multiple regions (lang switcher button, LANG_SWITCH_SCRIPT init, audio player track lookup, audioCuesAll + audioTracks, fallback `<audio src>`)

- [ ] **Step 1: Remove the Mix tab button**

`scripts/render-site.mjs:1436-1440` — delete the line `<button data-lang="mix" role="tab">Mix</button>`. The container now holds two buttons: EN and 中文.

- [ ] **Step 2: Rewrite LANG_SWITCH_SCRIPT init to default EN, drop persistence, clean up stale key**

Replace lines `scripts/render-site.mjs:958-980` (the IIFE body that reads `digest-lang` from localStorage, persists it on click, and initialises `data-lang`) with:

```js
    // Anonymous visitors always start EN on every page load.
    // localStorage.digest-lang from a pre-spec visit is deleted
    // exactly once; no read or write to that key from this point on.
    try { localStorage.removeItem('digest-lang'); } catch (e) {}

    var current = 'en';
    document.documentElement.setAttribute('data-lang', current);
    // Apply EN to every [data-orig] node on first paint. AIHOT items
    // hold the Chinese source in textContent and the English translation
    // in data-tr-en; without this call the page would flash Chinese for
    // a moment before JS swaps it.
    window.addEventListener('DOMContentLoaded', function() { applyTextFor(current); });

    var btns = document.querySelectorAll('.lang-switch button');
    btns.forEach(function(b) {
      b.setAttribute('aria-pressed', b.dataset.lang === current ? 'true' : 'false');
      b.addEventListener('click', function() {
        var newLang = b.dataset.lang;
        if (newLang !== 'en' && newLang !== 'zh') return;
        document.documentElement.setAttribute('data-lang', newLang);
        btns.forEach(function(other) {
          other.setAttribute('aria-pressed', other.dataset.lang === newLang ? 'true' : 'false');
        });
        applyTextFor(newLang);
        document.dispatchEvent(new CustomEvent('digest-lang-change', { detail: { lang: newLang } }));
      });
    });
```

The `applyTextFor` function above this block stays unchanged — it already handles `en` and `zh` and only treats unknown languages as a no-op via `var newText = orig;`.

- [ ] **Step 3: Drop `mix` defaults from the audio-player JS**

`scripts/render-site.mjs:1101-1112` — replace `currentLang()` and `activeCues()` so they fall back to `'en'` instead of `'mix'`, and the change listener defaults to `'en'`:

```js
    function currentLang() {
      return document.documentElement.getAttribute('data-lang') || 'en';
    }
    function activeCues() {
      var lang = currentLang();
      return allCues[lang] || allCues.en || null;
    }
    var cuesData = activeCues();

    document.addEventListener('digest-lang-change', function(e) {
      var lang = (e.detail && e.detail.lang) || 'en';
      var track = tracks[lang];
```

The rest of the event handler is unchanged.

- [ ] **Step 4: Drop the `mix` keys from `audioCuesAll` and `audioTracks`**

`scripts/render-site.mjs:1670-1682` — replace the comment block + both object literals with:

```js
// Two language tracks: English (default) + 中文. Each has its own
// MP3 + cues. Renderer embeds both cue sets and the player JS swaps
// audio src + active cue set on language change.
const audioCuesAll = {
  en: await tryReadCues("audio-cues-en.json"),
  zh: await tryReadCues("audio-cues-zh.json"),
};
const audioTracks = {
  en: { src: "digest-en.mp3", available: existsSync(join(SITE_DIR, "digest-en.mp3")) },
  zh: { src: "digest-zh.mp3", available: existsSync(join(SITE_DIR, "digest-zh.mp3")) },
};
```

- [ ] **Step 5: Update the `audioAvailable` canary file**

`scripts/render-site.mjs:1661` — replace:

```js
const audioAvailable = existsSync(join(SITE_DIR, "digest.mp3"));
```

with:

```js
const audioAvailable = existsSync(join(SITE_DIR, "digest-en.mp3"));
```

- [ ] **Step 6: Update the `<audio>` fallback `src`**

`scripts/render-site.mjs:1550` — replace `src="${audioTracks.mix.src}"` with `src="${audioTracks.en.src}"`. The `<audio>` element now loads `digest-en.mp3` on first paint; the `digest-lang-change` listener already swaps src to the zh track when the user clicks 中文.

- [ ] **Step 7: Remove the `Translate EN` instruction from the Models section subtitle**

`scripts/render-site.mjs:1471` — delete the trailing sentence `Click <strong>Translate EN</strong> on any card for an English version.` from the Models `<p class="section-sub">` (keep the leading "Latest model launches…" sentence). Sweep the other AIHOT section subtitles for the same phrase: grep `grep -n 'Translate EN' scripts/render-site.mjs` and delete every match found in section-subtitle copy.

- [ ] **Step 8: Local smoke**

Run: `node scripts/render-site.mjs`
Expected: writes `docs/index.html` without error. Open `docs/index.html` in a browser:
- Top-left language switcher shows only **EN** and **中文** (no Mix), EN highlighted.
- Open DevTools → Application → Local Storage → confirm `digest-lang` key is absent (or was removed if you set one before the load).
- Click 中文 → page text re-renders to Chinese, no localStorage write occurs (re-check the Storage panel).
- Reload the page → EN is selected again. Click 中文 → re-renders. Navigate to `docs/digests/<some-date>.html` from the Archive link → that page loads in EN (default). All matches behaviours B1, B2, B3.

- [ ] **Step 9: Commit**

```bash
git add scripts/render-site.mjs
git commit -m "feat(renderer): drop Mix lang track; EN default, session-only toggle

- Removes the Mix tab from the language switcher.
- LANG_SWITCH_SCRIPT no longer reads or writes localStorage.digest-lang;
  EN is selected on every page load. A one-time removeItem cleans up
  the stale key from pre-spec visitors.
- Audio player + cues default to EN; mix keys deleted from
  audioCuesAll and audioTracks. The <audio> element loads
  digest-en.mp3 on first paint.
- Drops the 'Click Translate EN…' instruction from AIHOT section
  subtitles (the link itself is removed in a follow-up commit).

Per docs/specs/2026-05-16-card-refinements-spec.md D1."
```

---

## Task 3: AIHOT card — title becomes the link; remove `Read original` and `Translate EN`

**Files:**
- Modify: `scripts/render-site.mjs:140-160` (`aihotItemsCard`)
- Possibly delete: `scripts/render-site.mjs:134-136` (`googleTranslateUrl` helper) — grep after deletion to confirm zero call sites remain.

- [ ] **Step 1: Rewrite the AIHOT card template**

Replace the body of `aihotItemsCard` (lines 140–160) with:

```js
function aihotItemsCard(items, anchorPrefix) {
  if (!items?.length) return `<p class="empty">No items.</p>`;
  return `<div class="cards">${items
    .map((item, idx) => {
      const titleText = escapeHtml(item.title || "");
      // The translatable text node lives in an inner <span> so the
      // outer <a> survives applyTextFor's textContent replacement
      // on language switch. data-orig / data-tr-* attributes sit on
      // the span; the <a> is structural and stays put.
      const titleInner = `<span${txAttrs(item.title || "")}>${titleText}</span>`;
      const titleHtml = item.url
        ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener">${titleInner}</a>`
        : titleInner;
      return `
    <article class="card" id="article-${anchorPrefix}-${idx}">
      <h3 class="card-title">${titleHtml}</h3>
      ${item.summary ? `<p class="card-summary"${txAttrs(item.summary)}>${escapeHtml(item.summary)}</p>` : ""}
      <div class="card-meta">
        ${item.source ? `<span class="badge">${escapeHtml(item.source)}</span>` : ""}
        ${item.publishedAt ? `<span class="meta-time" title="${escapeHtml(item.publishedAt)}">${escapeHtml(relTime(item.publishedAt))}</span>` : ""}
      </div>
    </article>
  `;
    })
    .join("")}</div>`;
}
```

The change set:
- `<h3>` title text is wrapped in `<a href="${item.url}" target="_blank" rel="noopener">` when `item.url` is present (matches the seven non-AIHOT card patterns, e.g. `hfSection` at line 199, `ghTrendingSection` at line 169).
- **Structure: `<h3><a><span data-orig data-tr-en data-tr-zh>title</span></a></h3>`.** The inner `<span>` carries the translation attributes, not the `<h3>` or the `<a>`. This matters because `applyTextFor` does `el.textContent = newText` on every `[data-orig]` node; if `data-orig` sat on the `<h3>` or the `<a>`, the textContent assignment would wipe the link and silently break B4 on the non-default language. Putting it on the `<span>` confines the replacement to the inner text node, leaving the `<a>` intact across language switches.
- The entire `<div class="card-actions">…</div>` block is deleted — that removes both `Read original ↗` and `Translate EN ↗`.

- [ ] **Step 1b: Verify B4 holds on both EN and 中文**

After the template change, the manual smoke in Step 3 below must confirm that clicking the title opens the original URL in **both** language modes — not just the default. If 中文 mode clicks fail, the `<span>`-vs-`<h3>` placement is wrong, fix before committing.

- [ ] **Step 2: Grep for `googleTranslateUrl` call sites**

Run: `grep -n 'googleTranslateUrl' scripts/render-site.mjs`
Expected: only the definition at line 134 remains; no other call sites.

If only the definition remains: delete lines 134–136 (the helper function).
If any caller remains: do NOT delete the helper; leave the unrelated caller alone and commit just the AIHOT-card change.

- [ ] **Step 3: Local smoke**

Run: `node scripts/render-site.mjs`
Open `docs/index.html` in a browser. In each AIHOT section (Models, Products, Industry, Research):
- Card title text is now an underlined link (or styled per `.card-title a`).
- Click the title → new tab opens at the article's original URL. Behaviour **B4**.
- No `Read original ↗` anchor, no `Translate EN ↗` anchor visible on the card. Behaviour **B5**.

- [ ] **Step 4: Commit**

```bash
git add scripts/render-site.mjs
git commit -m "feat(renderer): AIHOT card title becomes original-source link

- Wraps the <h3> title text in <a href=item.url target=_blank
  rel=noopener>, matching the convention used on every non-AIHOT
  card (HuggingFace, GitHub Trending, OpenAI lab posts, etc.).
- Title structure is <h3><a><span data-orig>title</span></a></h3>:
  the translation attributes live on the inner <span>, not the
  <h3> or <a>, so applyTextFor's textContent replacement on
  language switch leaves the <a> intact and B4 (title-as-link)
  holds in both EN and 中文.
- Removes the standalone 'Read original ↗' and 'Translate EN ↗'
  anchors from AIHOT cards — modern browsers ship inline page
  translation, and the title-as-link makes the card affordance
  uniform with the rest of the site.
- Deletes googleTranslateUrl() if no callers remain.

Per docs/specs/2026-05-16-card-refinements-spec.md D2, D3, B4, B5."
```

---

## Task 4: Update the CI cache list + fast-mode canary

**Files:**
- Modify: `.github/workflows/fetch-sources.yml:102-107` and `:120` and `:180-186` — three places that list `docs/digest.mp3` + `docs/audio-cues.json`.

- [ ] **Step 1: Drop `docs/digest.mp3` and `docs/audio-cues.json` from the pipeline-state cache (lines 102, 105)**

In the `Restore pipeline state` step's `path:` block, delete the lines:

```
            docs/digest.mp3
            docs/audio-cues.json
```

Leave `docs/digest-en.mp3`, `docs/digest-zh.mp3`, `docs/audio-cues-en.json`, `docs/audio-cues-zh.json`, `docs/content-translations.json` in place.

- [ ] **Step 2: Update the fast-mode fallback canary (line 120)**

Replace:

```bash
          if [ "$want" = "fast" ] && [ ! -f data/manifest.json -o ! -f docs/digest.mp3 ]; then
```

with:

```bash
          if [ "$want" = "fast" ] && [ ! -f data/manifest.json -o ! -f docs/digest-en.mp3 ]; then
```

This keeps the same intent (fall through to full mode if the cache restore was empty) but uses a file that still exists.

- [ ] **Step 3: Drop `docs/digest.mp3` and `docs/audio-cues.json` from the audio cache (lines 180, 183)**

In the `Restore audio cache` step's `path:` block, delete the same two lines as in Step 1.

- [ ] **Step 4: Bump the audio cache key**

Same step (`Restore audio cache`), line 187 — bump the cache key version so the new two-track shape gets a fresh cache and old three-track entries are not reused:

```yaml
          key: audio-v23-${{ steps.data-hash.outputs.hash }}
```

- [ ] **Step 5: Verify the workflow YAML still parses**

Run (if `yq` is available): `yq '.jobs.build.steps[] | select(.name == "Restore audio cache") | .with.path' .github/workflows/fetch-sources.yml`
Expected: the path list shows only the EN/ZH MP3s + their cue files + content-translations.json. No `digest.mp3`, no `audio-cues.json`.

If `yq` isn't available, eyeball the file with `grep -n 'digest\.mp3\|audio-cues\.json' .github/workflows/fetch-sources.yml` and confirm zero matches.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/fetch-sources.yml
git commit -m "ci: drop mix-track files from caches; bump audio cache key

- pipeline-state cache no longer lists docs/digest.mp3 or
  docs/audio-cues.json (the mix track is no longer produced).
- Fast-mode fallback canary switches from digest.mp3 to
  digest-en.mp3 (the renamed presence sentinel).
- Audio cache key bumped to audio-v23 so the new two-track
  shape gets a clean cache.

Per docs/specs/2026-05-16-card-refinements-spec.md D1."
```

---

## Task 5: End-to-end local verify (B1–B6)

This task only runs commands — no code changes. Each step maps to one of the spec's behaviours.

- [ ] **Step 1: Full render**

Run: `node scripts/render-site.mjs`
Expected: writes `docs/index.html`, `docs/digests/<today>.html`, `docs/digests/index.html`. No errors.

- [ ] **Step 2: Serve docs/ locally**

Run: `python -m http.server -d docs 8000` (in another shell)

- [ ] **Step 3: B1 + B2 + B3 — lang switcher behaviour**

In a browser, open `http://localhost:8000/`. DevTools → Application → Local Storage:
- Verify `digest-lang` key does NOT exist after a hard reload.
- Manually set it (`localStorage.setItem('digest-lang', 'zh')`) → reload → confirm the renderer's cleanup deletes it on next load and the page renders in EN.
- Click 中文 → page text renders in Chinese, no `digest-lang` key is written.
- Open the Archive link → that page loads in EN. **B1, B2, B3 pass.**

- [ ] **Step 4: B4 + B5 — AIHOT cards**

Scroll to Models / Products / Industry / Research. Click any card's title → new tab opens at the article URL — verify in **both** EN mode AND 中文 mode. No `Read original ↗` or `Translate EN ↗` anchors visible. **B4, B5 pass.**

- [ ] **Step 5: B6 — audio player tracks**

Expand the 🎧 FAB. With EN selected, the `<audio>` element's `src` attribute is `digest-en.mp3` (confirm via DevTools → Elements). Click 中文 → src updates to `digest-zh.mp3`. No reference to `digest.mp3` anywhere in the page source.

Run: `grep -c 'digest\.mp3' docs/index.html`
Expected: `0`. **B6 pass.**

- [ ] **Step 6: Stop the local server**

Ctrl-C the `python -m http.server` process.

- [ ] **Step 7: (No commit — verify-only task)**

If any check failed, return to the relevant task above and fix; do not paper over a failure with .todo() or comments.

---

## Out of scope (deferred)

These are explicitly NOT in this plan, per the spec's Out of scope section:

- **Atom syndication feed (`/feed.xml`) and `<link rel="alternate">` autodiscovery** — moved to the backend-and-editorial-layer spec (D11 + B14 + B15) so they ship with the rest of the SEO/syndication bundle.
- Per-article permalink pages (`docs/articles/<slug>.html`).
- `sitemap.xml`, JSON-LD `NewsArticle`, OpenGraph / Twitter Cards on the digest pages.
- RSS 2.0 / JSON Feed companions to the Atom feed.
- Email subscription pipeline (Resend / Postmark / Buttondown).
- Editor's Cut commentary.
- Internal CN-original articles.

All of the above land in the backend-and-editorial-layer spec ([`2026-05-17-backend-and-editorial-layer-spec.md`](../specs/2026-05-17-backend-and-editorial-layer-spec.md)).

---

## Commit summary

The branch will have five commits, in order:

1. `feat(audio): drop Mix track — render EN + ZH only`
2. `feat(renderer): drop Mix lang track; EN default, session-only toggle`
3. `feat(renderer): AIHOT card title becomes original-source link`
4. `ci: drop mix-track files from caches; bump audio cache key`
5. (verify-only — no commit)

**Ordering invariant: commits 1, 2, and 4 must travel together to CI** — the audio script, the renderer's audio-track lookup, and the workflow cache list all reference the same set of MP3 files, so shipping any subset alone produces a broken site (page loads expecting `digest-en.mp3` while CI caches still serve `digest.mp3`, or vice versa). The first three commits should land in the same push (or be merged together via a single PR). Commit 3 is independent and can ship or revert in isolation.
