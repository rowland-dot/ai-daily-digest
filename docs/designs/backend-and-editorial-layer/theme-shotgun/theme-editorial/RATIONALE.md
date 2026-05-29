# Editorial / Magazine theme

## Aesthetic stance

Old-money newspaper meets premium Substack. The reader is here to **read**,
not to scroll a feed. Visual debt is paid up front in the masthead — kicker,
volume/issue line, large serif title, italic tagline — and then the layout
gets out of the way.

References: NYT Wirecutter feature pages, The Browser, Stratechery, Substack
premium publications, The New Yorker web.

## Design language

- **Type pairing.** Serif display (Charter / Iowan / Source Serif) for
  headlines, system sans for body, monospace for metadata (kickers,
  timestamps, section counts). The metadata-in-mono trick is what makes
  it read "edited", not "blogged".
- **One accent only.** Oxblood (#7a1f1f). Used for the kicker, the source
  label on each card, the Editor's Cut rail, and the subscribe button.
  Nothing else gets colour. Restraint is the whole point.
- **Hierarchy through scale, not colour.** Section heads at 28px with a
  hairline under them. Card titles at 22px. Summaries at 16px muted.
  The eye walks down the page in three font sizes.
- **Editor's Cut as pull-quote.** Italic, left-rail, in a slightly tinted
  surface. Reads like the editor scribbled in the margin. This is the
  product's signature voice — it deserves a typographic treatment.
- **Square corners.** `--radius: 4px`. Modern newspapers don't have
  rounded photos. Neither does this.
- **Two-line masthead border.** Heavy rule above and below the masthead;
  hairlines between cards. Newspaper convention, used deliberately.

## Modes

Both light and dark are committed. Light is paper-white (`#fbfaf7`) with
warm undertones — closer to off-white book paper than screen white. Dark
is a low-key night-read in warm dark browns (`#14110d`) with a desaturated
accent (`#c9837a`) so the oxblood still reads as oxblood, not neon. No pure
black, no pure white. Same fonts, same hierarchy, same rules.

## Who it's for

Readers who already subscribe to one or two paid newsletters and treat
reading as a daily ritual. They are not skimming. They will read the
Editor's Cut before deciding whether to click the headline. They want the
product to look like it was edited by a human, because it is.

## What it sacrifices

- **Density.** This is a low-density layout. A reader who wants 40 headlines
  in one viewport will hate it. (Mitigation: section counts in the head let
  power readers jump between sections via the toc.)
- **Modernity signal.** It will not read as a "vibe-coded AI product".
  It will read as something an editor at a magazine made. That is a feature
  for the target audience and a bug for the audience that wants their AI news
  to look AI-shaped.
- **Colour expressiveness.** No second accent, no semantic colour beyond
  danger/success in forms. If the product later wants to differentiate
  China-AI cards from US-AI cards visually, it would have to do it with
  typography or the source kicker — not with hue.
- **Hero variety.** The masthead is the same masthead every day. There is
  no daily art direction. If editorial wants a "today's cover image" later,
  this theme has to grow a hero-image slot.

## Implementation notes

- Token names match `scripts/render-site.mjs` PAGE_CSS so the renderer
  can swap themes by swapping the tokens file. The only additions are
  `--mono-font` (used for kickers/metadata) — the renderer will need
  to pick this up, or the body font can be used as the fallback.
- `data-theme="editorial-light"` and `data-theme="editorial-dark"` are
  both committed. The theme switch in the page header would gain an
  Editorial option alongside Linear and Claude.
- Font fallbacks favour pre-installed serifs (Charter on macOS, Source Serif
  Pro on most modern systems, Georgia universal). No web font load needed
  for first paint.
