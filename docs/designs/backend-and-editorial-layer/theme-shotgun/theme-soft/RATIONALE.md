# Soft contemporary / Notion-ish theme

## Aesthetic stance

Modern, friendly, system-font, calm. Not Notion exactly — Notion is too
chrome-heavy and grey. Closer to Linear's blog, Vercel's docs, the
landing pages of well-designed indie SaaS in 2026. Off-white background
with warm undertone, sage-green accent (instead of the obligatory blue),
soft hero gradient that drifts through cream-sage-blue without ever
shouting.

The point: approachable, contemporary, sole accent picks a lane that
isn't the SaaS-blue default. Sage reads as considered.

References: Linear's marketing pages, Vercel docs, the landing pages
of well-designed indie SaaS, Stripe's content surfaces, Substack reader
UI, Things 3.

## Design language

- **System fonts only.** SF Pro / Segoe UI / Inter. Zero web-font load.
  First paint is instant. Body at 16px, generous line-height (1.6).
- **Sage accent, not blue.** `#3d7a5f` in light, `#7fc8a1` in dark.
  Picking sage instead of the default blue is the single biggest move
  that prevents this from looking like every other modern web product.
- **Soft three-colour hero gradient.** Cream → muted sage → muted blue,
  135-degree diagonal. Hints at the colour story without committing to
  a wall of one hue. Hero in dark mode mirrors the same gradient at
  near-black with the same hues — recognisably the same brand.
- **Rounded but not balloon-y.** `--radius: 12px` for cards, `18px` for
  the hero subscribe block. Distinguished from the "everything is a
  pill" school by keeping section heads, link pills, and the toc all in
  a different radius family from cards.
- **Soft shadows, never glow.** `0 8px 24px rgba(31,31,29,0.06)` —
  shallow enough that cards feel like paper on paper, not glassmorphism
  panes floating in space.
- **Pill toc.** Navigation as soft pills, current-section pill solid.
  Reads as friendly, not buttoned-up.
- **Editor's Cut as a tinted card.** Same border radius as the parent
  card, soft accent-tinted background, leading sparkle (`✦`). The cut
  is part of the article visually — embedded, not bolted on. This is
  the most "contemporary" of the four theme treatments for Editor's
  Cut.
- **Hover = micro-lift.** Cards translate up 1px on hover and the shadow
  deepens slightly. Subtle. Tactile.

## Modes

Both committed. Light is the canonical mode (the brand-defining one).
Dark uses warmer neutrals (`#18181a`) than the linear-dark theme, with
the same sage accent shifted toward mint for legibility. The hero
gradient mirrors in dark with greens-to-blues at near-black values.

## Who it's for

- Readers who want their AI news to look like a 2026 web product, not
  a newspaper or a terminal.
- The audience that landed via Twitter, Substack recommendation, or a
  YouTube creator's link in description.
- PMs, designers, founders, and "AI-curious" technical readers — a
  slightly broader audience than the cyber theme.
- Anyone who would describe their preferred reading environment as
  "cosy".

## What it sacrifices

- **Distinctness.** This is the most "of the moment" theme of the four,
  which means it's also the one most likely to look dated in 2-3 years.
  Editorial and cyber are bets on long-running aesthetic lineages;
  brutalist is a deliberately current bet; soft is a "fits in" bet.
- **Density.** Bigger type, generous padding, micro-shadows. A power
  reader who wants 30 cards in a viewport will find it spacious to
  the point of slow.
- **Editorial weight.** The Editor's Cut here is the gentlest of the
  four treatments. It works visually but it doesn't shout "this is the
  product's point of view". If the editorial voice is the product's
  moat, brutalist or editorial themes give it more visual real estate.
- **Brand specificity.** Sage-green-on-cream is distinctive enough not
  to be generic, but a careful audit would note that 5+ AI-adjacent
  products shipped in 2026 with similar palettes. The brand is in the
  hero gradient (not the accent), so the gradient has to be guarded.

## Implementation notes

- All system fonts. No web-font load needed. Zero first-paint cost.
- Token names match `scripts/render-site.mjs` PAGE_CSS. `--mono-font`
  is defined but barely used in this theme (only the Atom-feed link
  hint in the footer, if added).
- `data-theme="soft-light"` and `data-theme="soft-dark"` both committed.
- The hero gradient and the subscribe-block gradient are the two
  places this theme spends design budget. Both are pure CSS, no
  images, no SVG. They are the brand surface — guard them when
  evolving the theme.
- `prefers-reduced-motion`: the hover-lift on cards should be disabled
  in production for that media query — micro but adds up over a long
  session of scanning.
