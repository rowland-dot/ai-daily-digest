# Integrated end-state mockup — backend-and-editorial-layer + card-refinements

A navigable end-state mockup mini-site showing the complete user experience
across both specs that ship on `feat/backend-and-editorial-layer`:

- **Spec A — card-refinements:** [`docs/specs/2026-05-16-card-refinements-spec.md`](../../../specs/2026-05-16-card-refinements-spec.md) (merged to main)
- **Spec B — backend-and-editorial-layer:** [`docs/specs/2026-05-17-backend-and-editorial-layer-spec.md`](../../../specs/2026-05-17-backend-and-editorial-layer-spec.md) (current branch)

The 30 per-state mockups under `docs/designs/backend-and-editorial-layer/`
show each component in **isolation**. The three subscribe-form variants
(A / B / C) explore one detail. **This folder is what's been missing:**
a navigable end-state product mockup showing how everything assembles into
the user's complete experience.

---

## Pages

Open `index.html` to start. Each page has a sticky nav strip at the top
linking to the others.

| Page | What it shows |
|---|---|
| [`index.html`](index.html) | Home page (BACKEND_LIVE=true). All Spec A + Spec B home-page elements visible. Subscribe banner uses Variant A. |
| [`favourites.html`](favourites.html) | /favourites/ page, Cloudflare-live state with sync prompt visible. |
| [`account.html`](account.html) | /account/ page, linked-active state with language picker + delete card. |
| [`article.html`](article.html) | /articles/&lt;slug&gt;/ translation page sample (CN source + EN excerpt). |
| [`subscribe-states.html`](subscribe-states.html) | 5 subscribe-form states side-by-side: idle / submitting / link-sent / error-invalid / error-network. |
| [`favourites-sync-flow.html`](favourites-sync-flow.html) | 4 sync-favourites states side-by-side: prompt-collapsed / open-email-input / link-sent / error. |
| [`account-states.html`](account-states.html) | 6 account-page states side-by-side: linked-active / linked-unsubscribed / language-saving / language-saved-toast / delete-confirm-modal-open / delete-confirm-modal-closed. |
| [`email-en.html`](email-en.html) | Daily email template, EN body (lifted from mockup 27). |
| [`email-zh.html`](email-zh.html) | Daily email template, ZH body (lifted from mockup 28). |

---

## Spec coverage table

### Spec A — card-refinements (`docs/specs/2026-05-16-card-refinements-spec.md`)

| Spec A feature | Where it appears in this mockup |
|---|---|
| Bilingual audio EN+ZH only (no Mix language) | `index.html` lang-switch in hero shows EN / 中文 only |
| AIHOT card titles link to original source (or our /articles/&lt;slug&gt;/ EN-translation page for CN AIHOT when EN tab is active) | `index.html` Models / Products / Industry / Research AIHOT card titles link to `article.html`; `article.html` is the EN-translation excerpt |
| Anonymous EN-default | `index.html` lang-switch has `data-lang="en"` pressed |
| Session-only language toggle (anonymous users) | Documented at lang-switch in hero — no persisted preference for anonymous users |
| "Read original" / "Translate EN" buttons removed | No such buttons in any card across `index.html` — replaced by direct title link + (where applicable) `.editors-cut` box |

### Spec B — backend-and-editorial-layer (`docs/specs/2026-05-17-backend-and-editorial-layer-spec.md`)

| Spec B feature | Where it appears in this mockup |
|---|---|
| Editor's Cut commentary on AIHOT cards (D3 clarified to AIHOT-only) | `index.html` Models card 1 has `.editors-cut` box; non-AIHOT cards do not |
| Favourite star buttons on every card | `index.html` every `<article class="card">` + `.writing-item` + `.builder-item` has a `.fav-star` button |
| /favourites/ page (Cloudflare-live state) | [`favourites.html`](favourites.html) |
| Sync-favourites magic-link flow (4 states) | [`favourites-sync-flow.html`](favourites-sync-flow.html) |
| /account/ page (linked-active state) | [`account.html`](account.html) |
| /account/ all 6 variant states | [`account-states.html`](account-states.html) |
| Subscribe form (5 lifecycle states) | [`subscribe-states.html`](subscribe-states.html); banner is on `index.html` in idle state |
| Translation pages for CN sources | [`article.html`](article.html) |
| Daily email template — EN body | [`email-en.html`](email-en.html) |
| Daily email template — ZH body | [`email-zh.html`](email-zh.html) |
| Atom feed at /feed.xml | Footer link on `index.html` |
| SEO bundle (canonical, hreflang, alternate feed) | Documented as HTML comments at top of `article.html` `<head>` |

---

## Design decisions baked into this mockup

### Subscribe-form variant — currently Variant A (banner)

Variant choice is **still open**. This mockup defaults to **Variant A** —
the full-width `surface-2` banner with `border-top` divider, between
`</main>` and `<footer>`. This matches the existing
[`00-home-page-integrated-A-banner.html`](../00-home-page-integrated-A-banner.html)
in the parent folder.

The three variants are co-resident in the parent folder and remain valid
alternates the user can pick from:

- [`00-home-page-integrated-A-banner.html`](../00-home-page-integrated-A-banner.html) — full-width banner with `border-top` divider (default in this mockup)
- [`00-home-page-integrated-B-inline-card.html`](../00-home-page-integrated-B-inline-card.html) — inline centered card inside `<main>`
- [`00-home-page-integrated-C-hero-gradient.html`](../00-home-page-integrated-C-hero-gradient.html) — full-width banner with hero-gradient background

Swapping variants is a single-style-block edit. The form markup is
identical across variants.

### Editor's Cut scope — AIHOT-only

Per recent D3 clarification: Editor's Cut commentary boxes render on
**AIHOT cards only**, not on lab posts, Simon Willison, GitHub trending,
HuggingFace, r/LocalLLaMA, or Builder voices. `index.html` shows one cut
AIHOT card with a `.editors-cut` box (Models section, card 1) and one
non-cut AIHOT card without the box (Models section, card 2).

This supersedes the earlier interpretation in
[`../00-LAYOUT.md`](../00-LAYOUT.md) "Decision rationale: Editor's Cut
renders on ALL section types", which was written before D3 was tightened
to AIHOT-only.

### Site-nav label is "★ Favourites" (not "★ Saved")

Per Spec B §B4 L355 — verbatim "★ Favourites". All three site-nav
strips in the mockup pages use this label.

### Subscribe banner placement — between `</main>` and `<footer>`

Per [`../00-LAYOUT.md`](../00-LAYOUT.md) decision rationale. The header is
already dense; the conversion action belongs after the user has consumed
the page value, not before.

### Mockup-only nav strip at the top of each page

The sticky nav strip with "End-state mockup · Home · Favourites · …" is
**mockup chrome only** — it exists to make this mini-site navigable in
isolation. Production deploys do not ship this strip. The production
site-nav is the pill row inside `<header class="hero">` ("Daily digest /
★ Favourites / Account").

---

## Sample content lifted from

- **`docs/index.html`** (current shipping render) — section ordering,
  card shapes, source-status footer, builder-voices layout
- **Per-state mockups 01–22, 27–30** — exact copy lifted for each
  per-state subscribe form, sync prompt, account row, modal body, toast,
  email body
- **[`../_shared.css`](../_shared.css)** — all design tokens (colours,
  spacing, radii, typography) used verbatim via `<link rel="stylesheet">`

No tokens or copy invented. Two pieces of mockup-specific UI:

1. The mockup-nav strip at the top of each page (purely navigation chrome
   for browsing this folder).
2. The state-grid layout on `subscribe-states.html`,
   `favourites-sync-flow.html`, and `account-states.html` — used to lay
   multiple per-state forms next to each other on a single page so the
   user can compare states without page-switching. The per-state content
   inside each grid cell is lifted verbatim from the corresponding
   numbered per-state mockup.

---

## Open questions surfaced by this integration

### Q1 — Subscribe-form variant choice

Variant A is the default in this mockup. User has not chosen between A
(banner), B (inline card), and C (hero-gradient banner). Pick one before
implementation.

### Q2 — GH Pages dormant build vs Cloudflare-live build

This mockup represents the **Cloudflare-live** build (`BACKEND_LIVE=true`):
- `/favourites` is the Cloudflare-live state with sync prompt
- `/account` exists
- Subscribe form posts to the live magic-link endpoint
- Daily-email server-render is live

The **GH Pages dormant** build (`BACKEND_LIVE=false`) is NOT shown as a
separate page-set in this folder — the per-state mockups
`09-favourites-ghpages-empty-no-saves.html` and
`10-favourites-ghpages-populated.html` cover that mode. If the user wants
an integrated dormant-build mockup as well, that would be a follow-up.

### Q3 — Multi-state pages use side-by-side grid, not iframe-based pages

The 5/4/6 state pages render all states on a single scrollable page in a
2-column grid. Alternative shapes considered:
- Tabbed interface (one state visible at a time) — rejected because the
  user explicitly asked for "laid out side-by-side on one page"
- Iframe grid of the original per-state mockups — rejected because the
  per-state mockups include the full header/hero, which would clutter
  the comparison view

The current shape distils each state to its essential component
fragment, making side-by-side comparison clean.

### Q4 — Modal states (account-states 5 + 6) render modal inline rather than as a viewport overlay

In the live UX, the delete-confirm modal is a full-viewport overlay dimming
the page underneath. On `account-states.html` state 5, the modal is
rendered inline inside its state-card so that siblings remain readable.
The full-viewport overlay is preserved at
[`../21-account-delete-confirm-modal-open.html`](../21-account-delete-confirm-modal-open.html).

---

## How to view

From the repo root with a local static server:

```bash
cd docs && python -m http.server 8000
# then open:
# http://localhost:8000/designs/backend-and-editorial-layer/integrated-mockup/index.html
```

Or just open `index.html` directly in a browser — the mockup uses
relative paths and no JS, so file:// works.
