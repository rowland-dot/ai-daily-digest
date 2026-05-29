# Integrated Home-Page Layout — backend-and-editorial-layer

**Spec:** [`docs/specs/2026-05-17-backend-and-editorial-layer-spec.md`](../../specs/2026-05-17-backend-and-editorial-layer-spec.md)
**Mockup:** [`00-home-page-integrated.html`](00-home-page-integrated.html)
**Companion to:** [`00-storyboard.md`](00-storyboard.md) — that file describes per-state surfaces in isolation; this file describes how they assemble into the home page.

---

## Why this file exists

The 30 per-state mockups under `docs/designs/backend-and-editorial-layer/`
describe each component (subscribe form, fav-star, /favourites page,
/account page, Editor's Cut box, translation page, daily email) in
**isolation**. Each one renders the component on a minimal stub page
with a generic hero + one section.

What was missing: a single mockup of the **assembled home page** showing
every backend-and-editorial-layer surface in its decided slot, with
spec-grounded rationale for each placement. The current
`scripts/render-site.mjs` had drifted from the spec's explicit placement
language — subscribe form was a bottom-of-`<main>` section block instead
of a footer-area banner, site-nav link said "★ Saved" instead of
"★ Favourites" (spec §B4), and there was no diagram showing which
elements belonged where.

This file fixes that. It is the **integration source-of-truth** that
implementation tasks should cite when wiring the renderer.

---

## Element placement table (with spec citations)

Each row maps an element to its slot on the integrated home page, the
spec citation that pinned the placement (where applicable), and the
file:line in `scripts/render-site.mjs` that needs to change to match.

| # | Element | Slot on home page | Spec citation | render-site.mjs file:line |
|---|---|---|---|---|
| 1 | `lang-switch` (EN / 中文) | Top-left of `<header class="hero">` | §D1b L69 "language toggle is visible in the header" | L2039 ✓ already correct |
| 2 | `theme-switch` (Linear / Claude) | Top-right of `<header class="hero">` | (not spec-governed; existing convention) | L2043 ✓ already correct |
| 3 | `site-nav` strip (Daily digest / ★ Favourites / Account) | Inside `<header class="hero">`, top center, above `<h1>` | §B4 L355 "click '★ Favourites' in the header" | L2038 calls `renderSiteNav` — rename "★ Saved" → "★ Favourites" at L1431 |
| 4 | `<h1>AI Daily Digest</h1>` + date + tagline | Hero center | (existing) | L2047-L2049 ✓ |
| 5 | `nav.toc` (sticky section navigator) | Below hero, above `<main>` | (existing) | L2052-L2066 ✓ |
| 6 | 10 content `<section class="block">`s | Inside `<main class="container">`, in fixed order: models → products → industry → papers → labs → writing → builders → llama → trending → hf | (existing card-refinements spec) | L2070-L2138 ✓ |
| 7 | Fav-star button (☆/★) | Top-right of every `<article class="card">`, every `.writing-item`, every `.builder-item` | §D5 L141 "Sits in the top-right corner of every article card" | aihotItemsCard L183, ghTrendingSection L208, hfSection L247, labBlogSection L278, builderWritingSection L304, localLlamaSection L330, followBuildersSection L356, L378 ✓ all wired |
| 8 | Editor's Cut commentary box (🏅) | Inline `<aside class="editors-cut">` inside any cut `<article class="card">`, beneath `.card-meta` | §D3 L116 "cut articles get an inline 🏅 commentary box"; §B7 L387 "cards that made the cut show a small 🏅 box" | aihotItemsCard L194 ✓; **GAP:** ghTrendingSection, hfSection, labBlogSection, builderWritingSection, localLlamaSection, followBuildersSection do NOT pass through `editorialCuts` (see Open Questions §1) |
| 9 | **Subscribe form** | Full-width banner section `<section class="subscribe-section">` between `</main>` and `<footer>`, gated by `BACKEND_LIVE` | §B1 L325 "subscribe form in header or footer" — chose **footer** (rationale below) | L2140 currently renders inside `</main>`; move to its own `<section>` after `</main>` |
| 10 | `<footer class="site-footer">` (snapshot timestamp + source-status badges) | Below subscribe section | (existing) | L2144-L2147 ✓ unchanged |
| 11 | Audio FAB | Fixed bottom-right, position: fixed | (existing) | L2149-L2168 ✓ unchanged |
| 12 | Sync prompt | NOT on home page — `/favourites` page only | §D5 L145 "lives only on the /favourites page header" | N/A on home page; rendered by `renderFavouritesPage` |
| 13 | "Save these across devices" email form | NOT on home page — `/favourites` page header only | §B4 L359 "the page header shows: 'Save these across devices →'" | N/A on home page |

---

## Decision rationale: subscribe form → footer (not header)

Spec §B1 line 325 says **"subscribe form in header or footer"** — both
are valid. Chose **footer-area banner** because:

1. **Header is already dense.** The hero contains site-nav (3 links) +
   lang-switch (2 buttons) + theme-switch (2 buttons) + h1 + date +
   tagline. Adding an email input + submit button would push the hero
   past 200px tall on mobile and force a wrap that breaks the
   absolute-positioned switches.
2. **Subscribe is a conversion action, not a navigation action.**
   Conversion-oriented forms perform better at the foot of long-scroll
   content (user has consumed value → email exchange feels earned) than
   at the top (user hasn't seen anything yet).
3. **Smallest delta from current shipping render.** L2140 already places
   `renderSubscribeForm()` at the bottom of `<main>`. Moving it ~6 lines
   down — into its own `<section class="subscribe-section">` between
   `</main>` and `<footer>` — is a one-line change to the renderer and a
   visual upgrade (full-width banner with `--surface-2` background +
   border-top divider, instead of a centered card inside the content
   column).
4. **The `.subscribe-form` styling has `max-width: 520px; margin: 0 auto;`** —
   reads as a footer call-to-action pattern, not a hero pattern.

If the user prefers header placement, the mockup can be re-cut with
`.subscribe-form` injected into the hero just below the tagline. Spec
permits it.

---

## Decision rationale: rename "★ Saved" → "★ Favourites"

`scripts/render-site.mjs` L1431 currently emits:

```js
`<a href="${favHref}"  class="site-nav-link" data-current="${currentPage === 'favourites'}"${currentPage === 'favourites' ? ' aria-current="page"' : ''}>★ Saved</a>`
```

The spec uses "★ Favourites" verbatim three times:
- §B4 L355: "click '★ Favourites' in the header, OR navigate to /favourites"
- §D5 L140: section title "Favourites" + subhead "Sits in the top-right corner of every article card"
- §B4 L353: behaviour title "View saved articles" — the **destination page is /favourites**

"Saved" and "Favourites" are not interchangeable vocabulary in the spec.
The fav-star button has `aria-label="Save article"` (verb) and stores in
`localStorage.favourites_v1` (noun for the collection). The nav link
points to the **collection**, so it should match the collection's name:
"★ Favourites".

One-line rename. Mockup uses the corrected label.

---

## Decision rationale: Editor's Cut renders on ALL section types

Spec §D3 L116:
> cut articles get an inline 🏅 commentary box (replacing the space
> where the card-refinements spec deleted "Read original" and
> "Translate EN")

Spec §B7 L387:
> cards that made the cut show a small 🏅 box beneath the card body

Neither passage restricts the cut to AIHOT-only. Routine prompt §D3
L600 says "8–15 articles that make the cut" — the routine selects from
the day's full pool, which spans every section's article inventory
(AIHOT, OpenAI, Anthropic, Simon, GitHub, HuggingFace, r/LocalLLaMA,
Follow Builders).

`article_id` is computed identically for every section type via
`lib/article-id.mjs::articleId(prefix, url)`. The match logic in
`aihotItemsCard` L179 (`editorialCuts.find(c => c.article_id === aid)`)
works for any prefix.

**Decision:** the integrated mockup shows 🏅 boxes on cards across
multiple sections (one on a Models AIHOT card, one on a Labs OpenAI
card) to make this explicit. The implementation gap is logged in
Open Questions §1 — the non-AIHOT section builders need the
`editorialCuts` parameter wired through.

---

## What this layout deliberately does NOT include

- **`/favourites` page** — separate route, separate mockups (09-12).
  The home page only shows the link to it (item 3 in the placement
  table).
- **`/account` page** — separate route, separate mockups (17-22). The
  home page only shows the link (item 3, BACKEND_LIVE-gated).
- **Sync prompt** — `/favourites` page only per §D5 L145. Not on home.
- **Subscribe magic-link email** — separate Resend-rendered email, not
  on the site.
- **Daily subscriber email body** — separate Beehiiv-rendered email
  (mockups 27, 28), not on the site.
- **Translation `/articles/<slug>/` pages** — separate route, separate
  mockups (29, 30). Home page links to them from CN AIHOT card titles
  when EN tab is active per §D6.

These are correctly omitted, not gaps.

---

## Open questions surfaced by this integration

### Q1 — Editor's Cut on non-AIHOT sections

`scripts/render-site.mjs` currently passes `editorialCuts` only to
`aihotItemsCard` (L2074, L2081, L2088, L2095). The other six section
builders (`ghTrendingSection`, `hfSection`, `labBlogSection`,
`builderWritingSection`, `localLlamaSection`, `followBuildersSection`)
do not accept the parameter and do not render `.editors-cut` boxes.

The spec does not restrict the cut to AIHOT. The routine output
(`editorial.cuts[]`) is section-agnostic.

**Question for user:** is the AIHOT-only rendering deliberate (e.g. "in
practice the cut is always AIHOT because that's the day's signal-
densest source") or accidental (initial implementation only wired
through the first section family)?

If deliberate → document the constraint in spec §D3 or §B7.
If accidental → file a TODO for the renderer to thread `editorialCuts`
through every section builder.

This file documents the placement decision (cut box goes inline beneath
card body, regardless of section) — the user decides which sections
actually get the parameter wired.

### Q2 — Subscribe-section visual treatment

The integrated mockup styles the subscribe section as a full-width
banner with `background: var(--surface-2)` and `border-top: 1px solid
var(--border)`. This is a footer-area pattern.

Two visual alternatives the user might prefer instead:
- (a) **Inline card** — keep the current `.subscribe-form` centered
  card-shell at the bottom of `<main>` (smallest delta, matches the
  per-state mockup `01-subscribe-form-idle.html` visual exactly).
- (b) **Full-width banner with accent gradient** — same shape as (a)
  but the banner background uses `var(--hero-bg)` to visually book-end
  the page (hero at top, subscribe banner at bottom).

Mockup uses option (a)'s structural box + option (b)'s mild surface
contrast as a middle ground. Both alternatives are one-style-block
edits if user prefers.

---

## Implementation handoff

To match this mockup, `scripts/render-site.mjs` needs:

1. **L1431** — rename `★ Saved` → `★ Favourites` in `renderSiteNav`.
2. **L2140** — move `${BACKEND_LIVE ? renderSubscribeForm() : ""}` out
   of `<main>` and wrap it in its own `<section class="subscribe-section">`
   between `</main>` and `<footer class="site-footer">`. Update
   `renderSubscribeForm()` to emit the section heading + section-sub
   prose ("Subscribe to the daily email" / "One email per day at 07:00
   Sydney. Bilingual support. Unsubscribe any time.") which currently
   only exists on the per-state mockups.
3. **L156, L201, L239, L266, L296, L322, L350** — see Q1. Each section
   builder needs to either accept `editorialCuts` and render the
   `.editors-cut` aside on matching articles, OR the spec needs to
   document the AIHOT-only constraint.
4. **PAGE_CSS** — append the two style blocks defined in the integrated
   mockup's `<style>` tag:
   - `.site-nav` strip (already exists at L1366 ✓)
   - `.subscribe-section` banner (NEW — copy from mockup `<style>`)

No new design tokens introduced. All styling uses existing CSS custom
properties from `PAGE_CSS` / `_shared.css`.

---

## Provenance

- **Spec citations:** §B1 L325, §B4 L355 L359, §D1b L69, §D3 L116,
  §D5 L141 L145, §B7 L387
- **render-site.mjs read:** full file (2602 LOC), page-assembly function
  L1892-L2181, site-nav helper L1421-L1436
- **Tokens used:** all from existing `[data-theme="claude"]` /
  `[data-theme="linear"]` blocks in `_shared.css` and `PAGE_CSS`
- **No invented elements:** every placement is either (a) lifted from
  spec text verbatim, or (b) a decision between spec-permitted
  alternatives with rationale recorded in this file
