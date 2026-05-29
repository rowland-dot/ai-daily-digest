# Brutalist / no-bullshit theme

## Aesthetic stance

Raw HTML energy. The page does not flatter you. It tells you what shipped,
who shipped it, and when. Sharp corners, hard black borders, hazard-yellow
masthead, signal orange accent, monospace metadata everywhere. The visual
language signals: this is a tool, not entertainment.

References: Linear's marketing site, Ben Holliday's blog, brutalist web
canon, Berkshire Hathaway's website, Hacker News structurally (but not
aesthetically), Things magazine, Are.na's earlier years.

## Design language

- **Zero border radius. Everywhere.** `--radius: 0px`. There are no rounded
  things in this theme. Photo of a chip in the hero? Square corners. Button?
  Square corners. Input field? Square corners.
- **Two-pixel hard borders.** No 1px hairlines. Borders are loud. The grid
  is held together by visible scaffolding, not implied by spacing.
- **Hard-offset shadows.** `4px 4px 0 #0a0a0a`. No blur. Cards look stuck to
  the page with stationery glue.
- **Mono for metadata, geometric sans for body, mono display.** The display
  font is JetBrains Mono. The body is Inter. Everything chrome (timestamps,
  source labels, section numbers, the nav strip, the subscribe form, the
  footer) is monospace and uppercase with positive tracking. This is the
  primary signal that the site means business.
- **Hazard yellow masthead.** `#ffff00` background, black text, orange
  accent stripe at the title. This bar is the same in light and dark mode.
  It is the brand.
- **Grid of two equal cards, no responsive tier in the middle.** Two columns
  on desktop, one column on mobile. No 3-up no 4-up. The reader gets a
  predictable rhythm.
- **Editor's Cut is a taped-on label.** Highlighter-green surface with a
  hard black border and a `// EDITOR'S CUT` mono header. It looks like a
  sticky note. That is the joke. The voice is irreverent; the treatment
  should match.

## Modes

Both light and dark committed. Light is paper-white (`#f4f4f0`) with black
borders. Dark is near-black (`#0a0a0a`) with bone-white borders — the entire
border layer inverts. The hazard-yellow masthead is the same in both modes.
The accent shifts from `#ff3d00` to `#ff6b35` for legibility in dark.

## Who it's for

- The reader who has Hacker News open in another tab.
- The builder who reads `r/LocalLLaMA` at 11pm.
- The terminal native who appreciates that the page weighs almost nothing.
- The person who hates "AI vibes" UI — soft gradients, glassmorphism, big
  rounded everything, splashy gradient buttons.

## What it sacrifices

- **Warmth.** Nobody is going to call this site "cosy". The bilingual EN+中文
  voice will read as harder-edged here than in editorial. If the product
  wants to feel like it cares about the reader as a person, this theme
  fights that.
- **Forgiveness on small mistakes.** Hard borders amplify alignment errors.
  A 3px misalignment in cards is invisible in soft contemporary; in
  brutalist it screams. Higher bar on CSS hygiene.
- **Image-friendly.** No rounded thumbnails, no soft drop shadows. If the
  product later wants to surface OG images from articles, they'll sit hard
  inside black borders, which is either great or terrible depending on the
  source image.
- **Density vs editorial weight.** Brutalist reads as dense. The Editor's
  Cut box, which is the product's voice, is squeezed inside the same hard
  grid. In editorial the cut is the centrepiece; here it is a sticky note
  on a card. Different positioning of the same content.

## Implementation notes

- Token names match `scripts/render-site.mjs` PAGE_CSS plus `--mono-font`
  (used as the display font — both `--display-font` and `--mono-font`
  resolve to JetBrains Mono in this theme).
- `data-theme="brutalist-light"` and `data-theme="brutalist-dark"` both
  committed. Theme switch would gain a Brutalist option.
- Fonts: JetBrains Mono and Inter are commonly Google-Fonts-loaded; for
  the renderer's no-flash strategy, prefer either system fallback chain
  (works fine — IBM Plex / SF Mono / Menlo) or a synchronous web-font
  preload. Avoid render-blocking @import.
- Hazard yellow `#ffff00` is intentional — not a softer mustard. If the
  user wants this softened in production, that's a one-token change.
