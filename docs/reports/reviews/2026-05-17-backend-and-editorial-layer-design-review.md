# Design Review — backend-and-editorial-layer (Step 5 Phase 2)

**Branch:** `feat/backend-and-editorial-layer`
**Date:** 2026-05-17
**Coverage:** static-structural review only (no live browser, no dev server, Playwright not installed)
**Scope:** 30 mockup files in `docs/designs/backend-and-editorial-layer/`, renderer changes in `scripts/render-site.mjs`, helpers under `scripts/lib/`.
**Verdict:** **FAIL** — 2 CRITICAL, 2 HIGH, 5 MEDIUM, 4 LOW.

The mockup work itself is in good shape: tokens are consistent, theme-system extends cleanly, parity tags are well-formed, source provenance is documented. The failures are in the **renderer-to-mockup wiring**: the new components have HTML emitted but no matching CSS shipped to the live site, and the email helper diverges hard from the email mockups.

---

## CRITICAL findings (production-blocking)

### C1 — New component CSS is never shipped to the live site

**Severity:** CRITICAL
**Files:**
- `scripts/render-site.mjs` `PAGE_CSS` block (lines 363-946)
- `scripts/lib/favourites-page.mjs:84` `<link rel="stylesheet" href="../_shared.css">`
- `scripts/lib/account-page.mjs:73` `<link rel="stylesheet" href="../_shared.css">`
- `scripts/lib/translations.mjs:111` `<link rel="stylesheet" href="../../_shared.css">`

**Evidence:**
- `grep '\.fav-star\|\.editors-cut\|\.btn-primary\|\.subscribe-form\|\.account-card\|\.sync-prompt\|\.modal-overlay\|\.translation-\|\.empty-state\|\.btn-secondary\|\.btn-danger\|\.lang-pref\|\.toast' scripts/render-site.mjs` → **0 matches**.
- `ls docs/*.css` → no `_shared.css` exists at site root.
- All three helpers point `<link rel="stylesheet">` at `_shared.css` paths that resolve to a file that does not exist in the deployed `docs/` tree.

**Impact:**
- Every NEW class declared in `docs/designs/backend-and-editorial-layer/_shared.css` (`.fav-star`, `.editors-cut`, `.btn-primary/secondary/danger`, `.subscribe-form`, `.account-card`, `.account-row`, `.lang-pref`, `.modal-overlay`, `.modal`, `.toast`, `.sync-prompt`, `.translation-*`, `.empty-state`) will render **unstyled** on the live site.
- `/favourites`, `/account`, and every `/articles/<slug>/` translation page will load with a broken stylesheet (404 on `_shared.css`) and fall back to default browser styling.
- On the main digest page, the fav-star button still renders (`scripts/render-site.mjs:181`), and the editor's-cut box still emits (`scripts/render-site.mjs:178, 192`), but neither has any CSS — fav-star will be a default `<button>`, the editor's-cut box will be a default `<aside>` with no left rail, no soft background, no italic body.

**Fix shape:** Either (a) inline the NEW class block from `_shared.css` into the renderer's `PAGE_CSS` constant before the closing backtick at line 946 (consistent with current single-source-of-truth shape), AND copy `_shared.css` to `docs/_shared.css` at build time so the helpers' `<link>` resolves; OR (b) extract a real `docs/site.css` written from the renderer and update every page (root + favourites + account + translation) to reference it. The storyboard already flags this decision (`00-storyboard.md` § INVENT, paragraph 1-2). Pick one — but it must ship before any of these pages render correctly.

---

### C2 — Email-template helper does not match the email mockups (palette and structure drift)

**Severity:** CRITICAL
**Files:**
- `scripts/lib/email-template.mjs` (162 lines)
- `docs/designs/backend-and-editorial-layer/27-email-en.html`
- `docs/designs/backend-and-editorial-layer/28-email-zh.html`

**Evidence (palette mismatch):**

| Token | Email mockup (27/28) | email-template.mjs |
|---|---|---|
| Outer bg | `#efe9de` (Claude warm cream) | `#f3f4f6` (slate-100) |
| Card bg | `#faf9f5` | `#ffffff` |
| Hero bg | `linear-gradient(135deg,#efe9de 0%,#faf9f5 100%)` | `#1e293b` (slate-800) |
| Hero text | `#141413` | `#f8fafc` |
| Body text | `#141413` | `#1f2937` |
| Editor's Cut left rail | `#cc785c` (Claude coral) | `#f59e0b` (amber) |
| Editor's Cut label color | `#cc785c` | `#6b7280` (gray) |
| CTA button | `#cc785c` (Claude coral) | `#2563eb` (blue) |
| Hero font | `Georgia, 'Tiempos Headline', serif` | sans-serif default |

**Evidence (structure mismatch):**
- Mockup 27 has: hero with `AI Daily Digest` + date + "Editor's Cut" subtitle; Editor's Cut narrative block; "Today's picks" h2; 4 cut articles each with title + 1-line tease; "Read all N picks" CTA; footer with three links (Manage account / Switch language / Unsubscribe).
- Helper emits: hero with subject only; single `overallText` paragraph; cuts list (no titles, no per-article links — only commentary text); single CTA `Read today's digest →`; footer with one Unsubscribe link.
- The mockup's per-cut block links to the article (`?ref=email-en&article=...`) — the helper does NOT include article links at all. Cuts become disembodied commentary blocks instead of clickable digest items.

**Impact:** Email clients will render emails that look like a generic Tailwind starter, not the Claude-themed brand mockup. The cuts won't be clickable to articles. The "Manage account / Switch language" footer links are missing entirely — users can't get to `/account?lang=zh` from the email.

**Fix shape:** Rewrite `renderEmailBase` against mockups 27/28 verbatim. Use the literal hex values from the mockups (intentionally inlined per `00-storyboard.md` § "Email mockups — divergence note"). Add per-cut clickable rows with `href`, title, and tease. Add the three-link footer. Don't paraphrase the structure — the mockups exist to be lifted.

---

## HIGH findings

### H1 — Subscribe form is not emitted on the live site (renderer gap)

**Severity:** HIGH
**Files:** `scripts/render-site.mjs`, mockups 01-05.

**Evidence:** `grep -c 'subscribe-form\|subscribe-email\|data-testid="subscribe' scripts/render-site.mjs` → **0**. Mockups 01-05 are full surfaces for a subscribe form in the footer/section of the digest page; renderer does not contain any of the form, label, input, or message markup. Spec § "UI surfaces" lists subscribe-form as B1 with 5 states.

**Impact:** B1 (subscribe-form) ships unrendered. Users on the live site have no way to subscribe. The Beehiiv worker endpoint exists (per commit `91e8179`) but is unreachable from the UI.

**Fix shape:** Add a `<section class="block">` with the subscribe-form markup (lifted verbatim from mockup 01) to the page template in `render-site.mjs`. Wire the form-state transitions (idle → submitting → link-sent / error-*) via client JS or progressive-enhancement form submission to `/api/subscribe`.

### H2 — Sync prompt only ships the collapsed state; open/link-sent/error states are not in helper

**Severity:** HIGH
**File:** `scripts/lib/favourites-page.mjs:26-35` `renderSyncPrompt()`.

**Evidence:** The helper renders only `data-state="collapsed"` shape. Mockups 14 (`sync-favourites-prompt-open-email-input`), 15 (`link-sent-confirmation`), 16 (`error`) require the open shell with an email input + form, the link-sent message row, and the error message row. The comment on line 33 says "Expanded email-input state (mockups 14-16) driven by client JS" — but no client JS exists in this branch to do that, and the `_shared.css` doesn't include the `sp-title` / `sp-sub` style that the open state uses (it does — but only when CSS C1 is fixed).

**Impact:** B5 user can click `Sync` and nothing happens until client-JS is shipped in a later slice. The state index promises 4 states; only 1 is reachable.

**Fix shape:** Either (a) commit the client JS in this branch so collapsed → open → link-sent / error works, or (b) explicitly defer states 14-16 in the spec with a tagged `[DEFERRED: <slice> — reason]` annotation and note it in the brief. Per `discipline-spec-coverage.md`, silent partial implementation is the wrong shape.

---

## MEDIUM findings

### M1 — Mockup 14 (sync-prompt-open) overrides `.subscribe-form` styling with inline `style=""`

**File:** `docs/designs/backend-and-editorial-layer/14-sync-favourites-prompt-open-email-input.html:41`
```html
<form class="subscribe-form" ... style="box-shadow: none; padding: 0; border: 0;" ...>
```
**Impact:** Inline override of three structural properties from `.subscribe-form`. This is a smell: either the `.subscribe-form` shell is wrong for use inside `.sync-prompt`, or the open state needs its own variant class (e.g. `.subscribe-form--bare`). Inline `style=""` will not survive a refactor and is the kind of thing that quietly drifts.

**Fix shape:** Add a modifier class (`.subscribe-form.is-bare` or similar) to `_shared.css` and use it here.

### M2 — `data-state` attribute on `.translation-placeholder` is rendered inconsistently

**Files:**
- Mockup 30 line 49: `<div class="translation-placeholder" data-testid="translation-placeholder" data-state="pending">`
- Helper `scripts/lib/translations.mjs:135`: `<div class="translation-placeholder" data-testid="translation-placeholder">` (no `data-state`)

**Impact:** Parity-check / future CSS rules that key off `[data-state="pending"]` will miss the rendered version. Two-source-of-truth drift.

**Fix shape:** Add `data-state="pending"` to the helper's placeholder div.

### M3 — Empty-state and pending-placeholder content drift between mockup and helper

**Files:**
- Mockup 30 has a rich placeholder: 📝 icon, "Translation pending" heading, explanatory paragraph (`Our daily routine ran out of capacity...`), and CTA.
- Helper `translations.mjs:135-140` renders: `<p class="muted">Translation pending</p>` + `<p>The English translation excerpt for this article is not yet available.</p>` + CTA. No icon. No heading. Different copy.

**Impact:** Live placeholder will read shorter and look less designed than the mockup. The mockup copy ("Our daily routine ran out of capacity before it could produce an EN excerpt — we've preserved the URL so the link still works") gives users a useful explanation; the helper's copy is generic.

**Fix shape:** Lift the placeholder body from mockup 30 verbatim. Same for the empty-state on favourites-page.mjs vs mockup 09 — happens to match here, but worth double-checking.

### M4 — Hero on /favourites and /account loses the theme-switch tab

**Files:** `scripts/lib/favourites-page.mjs:87-94`, `scripts/lib/account-page.mjs:76-83`.

**Evidence:** Both helpers emit `<header class="hero">` with only a `.lang-switch` — no `.theme-switch`. Mockups 09-12 and 17-18 all have BOTH switches (and `_shared.css:113-114` defines `.theme-switch { right: 14px; }` and `.lang-switch { left: 14px; }`).

**Impact:** On `/favourites` and `/account`, a user cannot switch themes. They can on the digest page but lose the control when they navigate one click sideways.

**Fix shape:** Add the `.theme-switch` block to both helpers' hero markup.

### M5 — Translation page hero shows `EN Translation — {Source} Article` instead of the article title

**File:** `scripts/lib/translations.mjs:124`
```js
<h1 style="font-size:clamp(22px,4vw,32px);">EN Translation — ${escHtml(source)} Article</h1>
```
**Evidence:** Mockup 29 line 39 says the SAME generic hero text — so the mockup and helper agree, but this is still a content design problem worth flagging: the hero says "AIHOT Article" instead of the actual article title. The real title only shows further down inside `<article class="translation-article"><h1>...`. This is two h1s on the same page, the more prominent one carrying less information.

**Impact:** A11y (two `<h1>` on one page violates heading-uniqueness), SEO (the hero h1 isn't the canonical headline), and user clarity (the more visible heading is generic).

**Fix shape:** Either drop the hero h1 entirely (let the article h1 do the work) or move the article title into the hero and remove the inner h1.

---

## LOW findings

### L1 — Renderer comment claims `/favourites` is "always written; sync-prompt visible only when BACKEND_LIVE=true" but call site passes no `auth`

**File:** `scripts/render-site.mjs:1984`
```js
const favouritesHtml = renderFavouritesPage({ backendLive: BACKEND_LIVE, savedArticles: [], siteOrigin: SITE_ORIGIN });
```
`auth` defaults to `'anonymous'` in the helper (`favourites-page.mjs:65`). When `BACKEND_LIVE=true`, the sync-prompt shows — which is correct for anonymous users but wrong for linked users. There is no detection / variant for linked-user GET on the static page. Acceptable for now since linked-user favourites are server-driven, but worth a `// TODO: linked-user shell` note.

### L2 — `.fav-star` syncing spinner overlaps the card's border-radius

**File:** `docs/designs/backend-and-editorial-layer/_shared.css:192-201`
```css
.fav-star[data-syncing="true"]::after {
  position: absolute; width: 8px; height: 8px;
  bottom: -2px; right: -2px; ...
}
```
The spinner pseudo-element pokes 2px outside the star button's positioning box. Inside a `.card` with `border-radius: 12-14px` and `padding: 18px`, this is fine; on small viewports the spinner could clip if the star is near the card edge. Minor visual nit, not blocking.

### L3 — Helpers' card-meta copy says "saved {locale-date}" but mockup says "saved 2h ago"

**File:** `scripts/lib/favourites-page.mjs:49`
```js
<span class="meta-time">saved ${escHtml(new Date(a.savedAt).toLocaleDateString())}</span>
```
Mockup uses relative-time strings ("saved 2h ago", "saved yesterday"). Helper emits absolute locale-date strings. Cosmetic; the rest of the site uses `relTime()` from the renderer for this exact purpose — reuse it.

### L4 — Storyboard claims Tier-A `favourite-star-empty` is at entry-point `none` but the file shows it inside a populated digest page

**File:** `docs/designs/backend-and-editorial-layer/00-storyboard.md` row 06 / `06-favourite-star-empty.html`.
The entry-point is technically `none` (it's a baseline render), but the storyboard could be clearer that the star appears on every digest card by default. Cosmetic doc nit; doesn't affect rendering.

---

## What's solid

For balance — these things were done well:

- **Token system extension is clean.** New status colors (`--danger`, `--danger-bg`, `--success`, `--success-bg`) added to both themes; no new fonts, radii, or shadow values introduced. Provenance documented in storyboard with file:line.
- **Parity tags are well-formed.** Every per-state file has `data-mockup-state`, `data-mockup-tier`, `data-mockup-entry-point`, `data-mockup-capture`, `data-mockup-trigger` attributes. State index is in sync with file naming.
- **A11y attributes are present.** `aria-pressed`, `aria-label`, `aria-modal`, `aria-describedby`, `role="dialog"`, `role="tablist"`, `aria-invalid`, `role="alert"`, `aria-live`, `autofocus` on Cancel — all in the right places across modals, forms, error messages.
- **Email mockups intentionally diverge from the site CSS** and the divergence is documented (`00-storyboard.md` § "Email mockups — divergence note"). The helper just didn't follow the mockup — see C2.
- **Dark/light parity by construction.** Single CSS variable system, theme flips on `[data-theme]`. Two-line claim in the storyboard, fully supported by the `_shared.css`.
- **Translation page canonical is correct.** Points to the CN source URL, not the EN page (`translations.mjs:106`) — matches D6/D7 spec. Atom feed link in `<head>` is present.
- **Editor's Cut fallback flow is implemented end-to-end.** Helper emits the `(English only today)` tag and `data-fallback="en"` attribute when `commentary_zh` is missing (`editorial.mjs:33-41`). Mockups 24/25 cover both the populated-ZH and fallback states.

---

## Disposition

Two CRITICAL findings block the merge: the site is functionally unstyled for any of the new surfaces (C1), and the email is shipping a generic Tailwind shell instead of the brand template (C2). Two HIGH findings ship feature gaps users will notice (no subscribe form, partial sync-prompt). The MEDIUM and LOW findings are cleanup work that can land alongside C1/C2 in the same fix pass.

**Recommended next step:** Stage 8 (fix loop). Start with C1 — once the CSS is wired up, the rest of the findings become easier to verify visually. Then C2 (rewrite email helper against mockups), then H1/H2 (subscribe form + sync-prompt full flow), then mop up M/L.
