# Mockup Parity — backend-and-editorial-layer

**Date:** 2026-05-17
**Branch:** `feat/backend-and-editorial-layer`
**Verdict:** CANNOT_WALK
**Coverage:** 0 of 30 states walked

## Why CANNOT_WALK

`/mockup-parity` Phase 3 was dispatched but the live-parity workflow is a
structural mismatch for this project's shape:

1. **No dev server.** This is a server-rendered static-site generator
   (`scripts/render-site.mjs`) plus a Cloudflare Worker that requires
   production secrets we don't have in this slice. There is no
   `npm run dev` and no protected dev URL.

2. **BACKEND_LIVE=false in this slice.** Per the spec's "Implementation
   phasing" section, the new identity / account / subscribe / sync UI
   surfaces ship dormant on GitHub Pages and only become live when the
   deferred `cloudflare-migration-and-vendor-onboarding` spec flips
   the feature flag. That means 18 of 30 mockup states have no live
   counterpart in this slice by design.

3. **Static parity validation already passed at Stage A.3.** The
   mockup files carry well-formed `data-mockup-state` attributes
   matching their per-state slugs (verified via
   `step-4-stage-a-run.sh --is-ui-branch true` → `A3_STATUS=ok`).

## What ships in this slice

Live-rendered surfaces shipping to GitHub Pages now (these would be
walkable with a dev server):

- Editor's Cut commentary boxes on card surfaces (mockups 23–26)
- Translation pages at `/articles/<slug>/` (mockups 29–30)
- Atom feed + SEO bundle (XML files, not subject to visual parity)
- Renderer changes for fav-star, EN/中文 toggle anonymous-default,
  Editor's Cut block

Dormant surfaces (BACKEND_LIVE=false):

- Subscribe form (mockups 01–05)
- `/favourites` page Cloudflare states (mockups 11–12)
- Sync-favourites flow (mockups 13–16)
- `/account` page (mockups 17–22)
- Daily email body templates (mockups 27–28) — not webpages

## Recommendation

Live `/mockup-parity --all-states` should be re-attempted in the
deferred `cloudflare-migration-and-vendor-onboarding` spec, after
`BACKEND_LIVE=true` and a real dev server is available
(`wrangler dev` with provisioned secrets).

For this slice's manual verification, the Step 8 brief enumerates the
12 live-rendered states a human can walk against `docs/index.html`
+ representative card / translation pages opened directly from the
filesystem.

## JSON tail

<!-- pipeline:json
{
  "schema_version": 1,
  "skill": "mockup-parity",
  "step": 5,
  "phase": 3,
  "severity": {"critical": 0, "high": 0, "medium": 0, "low": 0},
  "completeness": 0,
  "confidence": 9,
  "state_coverage": {"total": 30, "walked": 0, "cannot_determine": 30, "blocked": 0},
  "verdict": "cannot_walk",
  "reason": "no dev server + BACKEND_LIVE=false in this slice; live parity deferred to cloudflare-migration spec"
}
-->
