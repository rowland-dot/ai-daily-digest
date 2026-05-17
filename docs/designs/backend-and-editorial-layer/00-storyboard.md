# Storyboard — Backend, Identity, Editorial Layer, Translations & SEO

**Spec:** [`docs/specs/2026-05-17-backend-and-editorial-layer-spec.md`](../../specs/2026-05-17-backend-and-editorial-layer-spec.md)
**Mode:** Express (silent single-pass, pipeline-driven)
**Output dir:** `docs/designs/backend-and-editorial-layer/`
**Theme default:** `data-theme="claude"` (warm cream) on `<html>` for all
on-site mockups. Email mockups have no theme attribute — they are
standalone HTML for email clients (Gmail / Outlook / Apple Mail).

---

## Project shape & Gate 1 / Gate 7 disposition

This project has **no React/Vue/Svelte/Web-Components source**. The
entire UI is produced by a single Node script,
[`scripts/render-site.mjs`](../../../scripts/render-site.mjs) (1915
lines), as inline template-literal HTML + one `PAGE_CSS` block
containing every class on the live site.

Gate 1 ("read existing components first") and Gate 7
("framework-agnostic component inheritance") are both satisfied by
treating `scripts/render-site.mjs` as the canonical source-of-truth
file. Every class name, design token, and structural element below
was lifted verbatim from that file. The shared
[`_shared.css`](_shared.css) in this folder is the lift; each mockup
HTML references it.

---

## Component tokens (Gate 11 — consistency table)

| Token | Linear (dark) | Claude (warm) | Source |
|---|---|---|---|
| `--bg` | `#010102` | `#faf9f5` | render-site.mjs L330 / L357 |
| `--surface` | `#0f1011` | `#ffffff` | L331 / L358 |
| `--surface-2` | `#141516` | `#efe9de` | L332 / L359 |
| `--text` | `#f7f8f8` | `#141413` | L334 / L361 |
| `--text-muted` | `#8a8f98` | `#6c6a64` | L335 / L362 |
| `--border` | `#23252a` | `#e6dfd8` | L337 / L364 |
| `--accent` | `#5e6ad2` (lavender) | `#cc785c` (coral) | L339 / L366 |
| `--accent-soft` | `rgba(94,106,210,0.12)` | `rgba(204,120,92,0.10)` | L341 / L368 |
| `--shadow` | `0 1px 2px rgba(0,0,0,.4), 0 4px 8px rgba(0,0,0,.25)` | `0 1px 2px rgba(20,20,19,.04), 0 4px 12px rgba(20,20,19,.05)` | L344 / L371 |
| `--radius` / `--radius-lg` | `8px` / `12px` | `10px` / `14px` | L351-2 / L378-9 |
| `--display-font` | Inter | Copernicus / Georgia serif | L345 / L372 |

Reusable structural classes lifted verbatim: `.container`, `header.hero`,
`.theme-switch`, `.lang-switch`, `nav.toc`, `section.block`,
`.cards`, `.card`, `.card-title`, `.card-summary`, `.card-meta`,
`.badge`, `.meta-time`, `footer.site-footer`.

---

## Provenance — class manifest

| Class used in mockups | Status | Origin |
|---|---|---|
| `.container` | Lifted | render-site.mjs L415 |
| `header.hero` (+ `h1`, `.date`, `.tagline`) | Lifted | L418-448 |
| `.theme-switch`, `.lang-switch` | Lifted | L449-501 |
| `nav.toc` | Lifted | L504-532 |
| `section.block`, `.section-icon`, `.section-sub` | Lifted | L538-558 |
| `.card`, `.cards`, `.card-title`, `.card-summary`, `.card-meta`, `.badge`, `.meta-time` | Lifted | L560-579 |
| `footer.site-footer` | Lifted | L906-907 |
| `.fav-star` | **NEW** (extends Card pattern) | INVENT — flagged below |
| `.subscribe-form`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.form-msg`, `.spinner` | **NEW** | INVENT — flagged below |
| `.editors-cut`, `.ec-label`, `.ec-body`, `.ec-fallback-tag` | **NEW** | INVENT — flagged below |
| `.account-card`, `.account-row`, `.lang-pref` | **NEW** | INVENT — flagged below |
| `.modal-overlay`, `.modal`, `.modal-actions` | **NEW** | INVENT — flagged below |
| `.toast`, `.toast-icon` | **NEW** | INVENT — flagged below |
| `.sync-prompt`, `.sp-title`, `.sp-sub` | **NEW** | INVENT — flagged below |
| `.translation-article`, `.translation-attribution`, `.translation-cta`, `.translation-body`, `.translation-placeholder` | **NEW** | INVENT — flagged below |
| `.empty-state`, `.es-icon` | **NEW** | INVENT — flagged below |

---

## INVENT flags (NEW classes that don't exist in render-site.mjs)

All NEW classes are defined in [`_shared.css`](_shared.css) using existing
design tokens (no new colours / fonts / radii introduced). Each one
extends an existing visual pattern from the live site:

| INVENT | Visual pattern it extends |
|---|---|
| `.fav-star` | Reuses `.card` shadow / radius tokens; pill-shaped button mirroring `.theme-switch button` |
| `.subscribe-form`, `.btn-primary`, `.btn-secondary`, `.btn-danger` | `.card` shell + `.theme-switch button[aria-pressed]` accent fill |
| `.editors-cut` | `.badge` (label) + `.card-summary` (body) palette, with `--accent-soft` left rail |
| `.account-card`, `.account-row` | `.card` shell + horizontal flex rows |
| `.modal-overlay`, `.modal` | `.card` shell with `position: fixed` overlay; tokens unchanged |
| `.toast` | `.audio-fab` positional pattern + `.card` border treatment |
| `.sync-prompt` | `.card` shell with explicit `data-state="collapsed"` / `"open"` |
| `.translation-*` | `.container` width + `--display-font` for h1 + body prose tokens |
| `.empty-state` | Reuses `--text-muted` + display font; no new tokens |

These are the only flagged inventions. Reviewer audit point: the
implementing plan task should decide whether to:
1. Inline these styles directly into `scripts/render-site.mjs`'s
   `PAGE_CSS` constant (consistent with current project shape), or
2. Extract a small companion stylesheet (e.g. `docs/assets/site.css`)
   if `PAGE_CSS` gets unwieldy. Either is fine; both keep the
   single-source-of-truth principle.

---

## Inventory (9 surfaces, 30 states)

| # | File | State slug | Tier | Entry-point | Behaviour |
|---|---|---|---|---|---|
| 01 | `01-subscribe-form-idle.html` | `subscribe-form-idle` | A | `none` | B1 |
| 02 | `02-subscribe-form-submitting.html` | `subscribe-form-submitting` | B | `subscribe-form-idle` | B1 |
| 03 | `03-subscribe-form-link-sent.html` | `subscribe-form-link-sent` | B | `subscribe-form-submitting` | B1 |
| 04 | `04-subscribe-form-error-invalid-email.html` | `subscribe-form-error-invalid-email` | B | `subscribe-form-idle` | B1 |
| 05 | `05-subscribe-form-error-network.html` | `subscribe-form-error-network` | B | `subscribe-form-submitting` | B1 |
| 06 | `06-favourite-star-empty.html` | `favourite-star-empty` | A | `none` | B2 — Fav-star button (☆) appears on every article card across all section types: aihot items, gh-trending, hf-popular, labs blog, builder writing, localLlama, followBuilders |
| 07 | `07-favourite-star-filled.html` | `favourite-star-filled` | A | `favourite-star-empty` | B2 |
| 08 | `08-favourite-star-syncing.html` | `favourite-star-syncing` | B | `favourite-star-empty` | B3 |
| 09 | `09-favourites-ghpages-empty-no-saves.html` | `favourites-ghpages-empty-no-saves` | A | `none` | B4 (GH-Pages) |
| 10 | `10-favourites-ghpages-populated.html` | `favourites-ghpages-populated` | A | `none` | B4 (GH-Pages) |
| 11 | `11-favourites-cloudflare-anonymous-with-sync-prompt.html` | `favourites-cloudflare-anonymous-with-sync-prompt` | A | `none` | B4 (CF-live) |
| 12 | `12-favourites-cloudflare-linked-and-populated.html` | `favourites-cloudflare-linked-and-populated` | A | `none` | B4 (CF-live) |
| 13 | `13-sync-favourites-prompt-collapsed.html` | `sync-favourites-prompt-collapsed` | A | `none` | B5 |
| 14 | `14-sync-favourites-prompt-open-email-input.html` | `sync-favourites-prompt-open-email-input` | A | `sync-favourites-prompt-collapsed` | B5 |
| 15 | `15-sync-favourites-link-sent-confirmation.html` | `sync-favourites-link-sent-confirmation` | B | `sync-favourites-prompt-open-email-input` | B5 |
| 16 | `16-sync-favourites-error.html` | `sync-favourites-error` | B | `sync-favourites-prompt-open-email-input` | B5 |
| 17 | `17-account-linked-active.html` | `account-linked-active` | A | `none` | B1 / B6b |
| 18 | `18-account-linked-unsubscribed.html` | `account-linked-unsubscribed` | A | `none` | B10 |
| 19 | `19-account-language-saving.html` | `account-language-saving` | B | `account-linked-active` | B6b |
| 20 | `20-account-language-saved-toast.html` | `account-language-saved-toast` | B | `account-language-saving` | B6b |
| 21 | `21-account-delete-confirm-modal-open.html` | `account-delete-confirm-modal-open` | A | `account-linked-active` | B11 |
| 22 | `22-account-delete-confirm-modal-closed.html` | `account-delete-confirm-modal-closed` | A | `none` | B11 (baseline) |
| 23 | `23-editors-cut-cut-with-en-commentary.html` | `editors-cut-cut-with-en-commentary` | A | `none` | B7 |
| 24 | `24-editors-cut-cut-with-zh-commentary.html` | `editors-cut-cut-with-zh-commentary` | A | `editors-cut-cut-with-en-commentary` | B7b |
| 25 | `25-editors-cut-cut-zh-fallback-to-en.html` | `editors-cut-cut-zh-fallback-to-en` | B | `editors-cut-cut-with-en-commentary` | B7b |
| 26 | `26-editors-cut-not-cut-no-box.html` | `editors-cut-not-cut-no-box` | A | `none` | B7 (negative) |
| 27 | `27-email-en.html` | `email-en` | A | `server-triggered` | B6 |
| 28 | `28-email-zh.html` | `email-zh` | A | `server-triggered` | B6 |
| 29 | `29-article-translation-populated.html` | `article-translation-populated` | A | `none` | B8 |
| 30 | `30-article-translation-pending-placeholder.html` | `article-translation-pending-placeholder` | A | `none` | B8 (D6 fallback) |

---

## Gate 9 (dark-mode) / Gate 10 (mobile) exemption notes

The project ships **two themes via one CSS block** — Linear (dark) and
Claude (warm/light) are co-equal, not "main + dark". Every page on the
live site renders correctly in both because every rule uses CSS custom
properties. The theme toggle is visible on every page (`.theme-switch`
in the hero).

**Exemption claimed for `-dark` variant files:** the project's design
system handles dark mode by construction — flipping `data-theme` on
`<html>` swaps every token. The mockups all use `claude` (warm) for
visual consistency with the user's reading default; reviewers can swap
to `linear` by clicking the in-mockup theme toggle (it's a real button
on the hero, lifted verbatim). No separate `-dark.html` files are
produced because zero markup changes between themes — only CSS variable
values change, and the CSS file already contains both. Documenting per
Gate 9: **"dark parity established by token system, no variant file
needed."**

**Exemption claimed for `-mobile` variant files for non-Tier-A states:**
the underlying CSS uses single-column grid by default and bumps to
2-column at `min-width: 720px` (lifted verbatim from render-site.mjs
L562). All mockups render correctly down to 360 px; no separate
re-authoring required for the listed states. Documenting per Gate 10:
**"mobile parity established by responsive token system + existing
breakpoints; no per-state re-authoring needed."**

The pipeline's `/dev-pipeline` Step 5 (mockup-parity) will validate
this empirically by capturing screenshots at desktop + mobile viewports
against the same source files.

---

## Email mockups — divergence note (Gate 11)

Email body mockups (`27-email-en.html`, `28-email-zh.html`) **divergent
from the site CSS by design**:

- Email clients (Gmail, Outlook, Apple Mail, mobile clients) have
  inconsistent CSS support. `<link>` to external stylesheets is
  stripped by many clients. CSS custom properties (`var(--...)`) are
  not supported in Outlook 2007-2019.
- Therefore the email mockups use **inline styles** and a
  **table-based layout** for maximum client compatibility.
- Colour palette mirrors the Claude theme (warm cream `#faf9f5`,
  coral `#cc785c`, dark text `#141413`) but as literal hex values.
- This is intentional and inheritable to the production renderer: the
  GHA email-render step must inline-style its output, not rely on
  `_shared.css`.

This divergence is documented here so reviewers know it isn't a
Gate 11 cross-screen-consistency violation — it's a constraint of
the delivery channel.

---

## Gate 12 — spec state declarations

The spec contains a parser-recognised inventory at
[§ "UI surfaces requiring per-state declarations (Phase 2 mockup
work)"](../../specs/2026-05-17-backend-and-editorial-layer-spec.md#ui-surfaces-requiring-per-state-declarations-phase-2-mockup-work)
with a 9-row table of `<surface, behaviour, states to mockup>`. This
satisfies Gate 12: states were spec-declared before mockup authoring.
Each state slug in this storyboard's inventory table maps 1:1 to a
state listed in the spec's mockup-work table.

---

## Provenance summary

- **Source-of-truth file read:** `scripts/render-site.mjs` (1915 LOC),
  PAGE_CSS block at L327-910, page-assembly function at L1333-1592.
- **Lifted classes:** 19 (all from render-site.mjs)
- **NEW classes (flagged INVENT):** 9 component families, all extending
  existing visual patterns; all defined in `_shared.css` using only
  the existing design tokens.
- **No invented design tokens** (no new colours, fonts, radii, or
  shadow values).
- **No spec elements unaccounted-for:** every state in the spec's
  inventory table has a corresponding mockup file.

PROVENANCE_GAPS: none.
