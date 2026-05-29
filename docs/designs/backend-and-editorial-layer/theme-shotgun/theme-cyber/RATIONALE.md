# Cyber / terminal-inspired theme

## Aesthetic stance

A code editor that reads news. The entire page is monospace. Source labels
look like function calls. Timestamps look like comments. The masthead is a
shell prompt with a blinking cursor. The Editor's Cut is a `/* */` comment
block. This is for readers whose other tabs are GitHub, the API console,
and a terminal.

References: vim + tmux config screenshots, Dracula theme, Ghostty, Soundcloud's
neon era, Hacker News structurally, Ben Awad's old blog, kagi.com's
information density, terminal-themed personal sites of OSS maintainers.

## Design language

- **One font, everywhere.** JetBrains Mono / Fira Code / SF Mono fallback.
  Body, headings, metadata, buttons — all mono. Tracking is zero (mono
  fonts don't need tightening). This is the strongest single signal.
- **Syntax-highlight palette.** Source labels rendered as if they were
  function calls: `anthropic("opus-4.7")` with green-function-name,
  yellow-string-arg. Metadata uses comment grey. Numbers use purple. This
  is the second-strongest signal, and the one that takes most discipline
  to keep coherent.
- **Dracula-derived dark palette.** Not a 1:1 copy. Background goes cooler
  near-black (`#07080a`), foreground is the canonical Dracula warm grey
  (`#d4d4d4`) so it doesn't blast retinas. Accent is dracula green
  (`#50fa7b`), link is dracula cyan (`#8be9fd`).
- **Hover = highlight.** Card hover changes the border to the green accent
  and lifts the surface — same shape as a code editor's selected-line
  highlight. Subtle motion.
- **Blinking cursor in the title.** One small bit of animated joy.
  `▌` blinking on a 1.05s steps timer. It will read as cliché to some, as
  perfect to others. The target audience is the latter.
- **Almost-zero radius.** `--radius: 2px`. Terminal UIs sometimes have a
  trace of softening; pure 0 reads as brutalist (which is its own theme).
  2px reads as "rendered, not stamped".
- **Density.** Smaller base font (14px), tighter card padding, more cards
  per viewport than editorial. Information-first.

## Modes

Dark is the canonical mode and the one the user will spend most time in.
Light is committed as a "paper terminal" — same fonts, same syntax-palette
shape, but with calmer hues (deeper green for legibility, slate-blue links,
muted highlight yellows). Both modes share the prompt header structure.

## Who it's for

- Technical readers. The product's stated audience.
- `r/LocalLLaMA` denizens.
- Builders running models locally.
- The Hacker News crowd.
- Anyone whose first reaction to a UI is "is there an Atom feed?"

The product literally lists `r/LocalLLaMA` and `gh-trending` as sources;
this theme is the closest visual match to what those readers already
spend their day inside.

## What it sacrifices

- **Bilingual elegance.** 中文 in JetBrains Mono will fall back to the
  system CJK font, which will break the visual uniformity. The mono-only
  bet is strongest in EN; in 中文 mode the body would need a paired CJK
  font (Noto Sans CJK, PingFang) and the typographic argument weakens.
- **Wide-audience signal.** A non-technical reader landing on this page
  will assume they're in the wrong place. If the product later wants to
  broaden audience (PMs, designers, executives), this theme is a brand
  pivot away from that.
- **Print-friendliness.** A page composed entirely of mono will print
  long. The editorial theme prints beautifully; cyber prints fine but
  reads as "log output".
- **Image affordance.** No design language here for OG images, hero
  photography, or video embeds. The theme would either ignore those, or
  show them inside a terminal-window-frame chrome — which is a separate
  design decision.

## Implementation notes

- `--display-font`, `--body-font`, and `--mono-font` are all the same.
  The renderer doesn't need to do anything special; it just won't get
  font variation.
- Token names match `scripts/render-site.mjs` PAGE_CSS. Syntax-highlight
  tokens (`--syn-string`, `--syn-keyword`, etc.) are theme-specific
  additions used in the source-label and metadata rendering. The
  renderer would need a small `renderCardMeta(item)` helper that
  expresses source as `name("arg")` — straightforward and the same
  helper works across all themes (other themes just resolve the syntax
  tokens to plain text colours).
- `data-theme="cyber-dark"` and `data-theme="cyber-light"` both committed.
- The blinking-cursor animation is one CSS keyframe block. Trivially
  disabled via `@media (prefers-reduced-motion: reduce)` — should be added
  in production.
- JetBrains Mono is the recommended primary font. Falls back cleanly to
  Fira Code, SF Mono, Menlo, Consolas. No web-font load is required for
  acceptable rendering.
