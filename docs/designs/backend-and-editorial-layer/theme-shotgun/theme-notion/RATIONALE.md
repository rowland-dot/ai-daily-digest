# Notion theme

## Aesthetic stance

The all-in-one workspace, applied to a daily AI newsletter. Confident,
purposeful, and warmly branded — the reader trusts that someone is
**curating** here, not just aggregating. Visual debt is paid in the
hero band: deep brand-navy block with white display type and the
signature purple primary CTA, then the page calms down into a warm
off-white canvas (`#ffffff` against a `#f6f5f4` surface) where the
real content lives. Pastel-tinted feature cards echo the colorful
database properties of the live Notion product without ever feeling
like a redesign of Notion itself.

References: notion.so home, Notion AI launch page, the Enterprise
hero band, Notion's pricing comparison surfaces. Pulled directly
from `DESIGN.md` at the repo root (Notion-design-analysis, alpha).

## Design language

- **Type pairing.** Inter (Notion Sans surrogate) for every UI
  surface — display, body, and UI. JetBrains Mono only for kicker
  metadata, timestamps, and section counts. Notion uses a single
  custom sans across the entire product, so the theme commits to
  that discipline and pays the cost in mono micro-text instead of
  switching display families.
- **Brand-navy hero band.** `#0a1530 → #070f24` gradient, white
  display type, purple `#5645d4` primary CTA. This is Notion's
  signature treatment — the way you instantly recognise a Notion
  page. The home page and the article page both lead with it; the
  email lead masthead replicates it inline.
- **Pastel-tinted cards.** One feature card per section gets a
  Notion card-tint background (lavender, peach, mint, sky) — echoes
  the colored database properties in the live product without
  shouting. The other cards stay on plain `--surface` so the tint
  reads as **deliberate emphasis**, not decoration.
- **Purple primary, link-blue secondary.** `#5645d4` for "do this
  thing" CTAs; `#0075de` for in-body links. Notion is rare in
  separating CTA purple from link blue — most products collapse
  the two. The separation gives the page a layer of confidence:
  the CTA is **always** the purple pill, never the link.
- **Moderate rounding.** `--radius: 6px`, `--radius-lg: 10px`.
  Less round than Soft, more round than Brutalist or Editorial. The
  rounded-pill primary button is the only fully-pilled element.
- **Editor's Cut as tinted lavender card.** Lavender (`#e6e0f5`)
  background with a deeper purple left rule. Reads as a "callout
  block" — the same vocabulary Notion uses for in-document
  highlights. Native Notion vocabulary applied to editorial voice.

## Modes

Both light and dark are committed. Light is the default and the
"correct" Notion register: canvas white with a brand-navy hero band.
Dark inverts via the brand-navy spectrum — the **page** becomes
brand-navy, surfaces lift to `brand-navy-mid` (`#1a2a52`), and the
accent brightens to `#7b3ff2` (`brand-purple`) so the purple still
reads as confident purple rather than receding into the dark.

Card pastel tints are desaturated for dark mode (the lavender becomes
a deep aubergine; the mint becomes a deep forest) — they still
identify themselves as the same tint family, but contrast against
white type holds.

## Who it's for

Anyone who already lives in productivity tools — Notion, Linear,
Granola, Cron. The visual register tells them "this is a tool you
can rely on", not "this is a magazine you can curl up with". The
trade-off is conscious: less premium-publication warmth than
Editorial, more functional confidence than Soft.

## What it sacrifices vs the other themes

- **Less premium-publication feel than Editorial.** Editorial uses
  oxblood + serif headlines + paper-white canvas to read like a
  Substack premium pub. Notion uses sans + brand-navy + purple to
  read like a productivity tool. Different room.
- **More opinionated than Soft.** Soft is calmer, beige-ier, and
  intentionally invisible. Notion is louder — the brand-navy hero
  band insists on a brand presence the moment the page loads.
- **More accessible than Cyber.** Cyber commits to a future-shock
  aesthetic. Notion's brand-navy hero is the only "loud" moment;
  everything below it is comfortable.
- **Less brutal than Brutalist.** The 10px corners, the soft
  drop-shadows, and the lavender card tints all soften the edges
  Brutalist deliberately keeps sharp.

## Derivations from DESIGN.md

DESIGN.md fully documents the light side. For the dark side, I
derived:

- `--bg: #0a1530` — uses `brand-navy` (DESIGN.md documents this
  as the "deep navy hero band" colour; in dark mode it becomes the
  page surface itself).
- `--surface: #1a2a52` — uses `brand-navy-mid` (DESIGN.md documents
  this as an existing brand-navy spectrum colour).
- `--surface-2: #213262` and `--surface-3: #2a3a72` — interpolated
  between `brand-navy-mid` and a derived next-step lighter blue.
  DESIGN.md does not document these directly.
- `--accent: #7b3ff2` — uses `brand-purple` (DESIGN.md documents
  this as the "brighter purple variant"; on dark backgrounds the
  primary `#5645d4` would lose chroma so the brighter brand-purple
  reads better).
- Pastel-tint dark-mode equivalents — derived by darkening each
  light-mode tint toward the `brand-navy-deep` axis until contrast
  with white text held. Not documented in DESIGN.md.

## Implementation notes

- Token names match `scripts/render-site.mjs` PAGE_CSS so the
  renderer can swap themes by swapping the tokens file. The only
  additions are `--mono-font` (used for kickers/metadata) and the
  `--tint-*` series for card pastel backgrounds — the renderer will
  need to pick these up, or the body font and surface can be used
  as fallbacks.
- `data-theme="notion-light"` and `data-theme="notion-dark"` are
  both committed. The theme switch in the page header would gain a
  Notion option alongside Linear and Claude.
- Inter and JetBrains Mono are loaded from Google Fonts at the top
  of `tokens.css` (`@import`). On systems without Inter the
  fallback chain reaches Apple system, then Segoe UI, then any
  system sans. First paint is still acceptable on a cold cache.
