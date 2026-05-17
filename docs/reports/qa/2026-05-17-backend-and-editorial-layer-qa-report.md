# QA Report — backend-and-editorial-layer

**Date:** 2026-05-17
**Branch:** `feat/backend-and-editorial-layer`
**Verdict:** CANNOT_WALK
**Reason:** No Playwright, no dev server in this project shape.

## Coverage already in place (non-QA-walk)

- **Unit + integration tests:** 305 of 305 passing across 24 test files
  (`tests/lib/`, `tests/render/`, `tests/worker/`).
- **Worker route logic:** every route (POST /api/subscribe, GET
  /api/auth/verify, POST /api/sync-favourites, /api/favourites CRUD,
  /api/account/* update/unsubscribe/delete, POST
  /api/webhooks/beehiiv) has integration coverage via the
  better-sqlite3 D1 shim.
- **Renderer:** mockup-shape assertions on rendered HTML for every
  live-rendered surface (Editor's Cut, fav-star, translation page,
  SEO bundle, Atom feed, subscribe form gating, sync-prompt all four
  states, favourites page GH-Pages + Cloudflare states).
- **Security:** all 7 CRITICAL+HIGH findings from `/review` Phase 1
  resolved + re-reviewed (constant-time HMAC, SESSION_SECRET
  enforced, webhook fail-closed, magic-link state-leak collapsed,
  CSRF header on delete, per-IP rate limiting, unauth language
  mutation closed).
- **Design integration:** all 4 CRITICAL+HIGH findings from
  `/design-review` Phase 2 resolved + re-reviewed (mockup CSS merged
  into PAGE_CSS, email template matches mockups 27/28, subscribe form
  rendered + gated, sync-prompt all four states + client JS).

## Manual human verification needed (handed off to Step 8 brief)

These items the Test Plan Artifact tagged as needing a human walk and
the orchestrator's Playwright/dev-server-based QA flow cannot run:

### Live-rendered surfaces (GH-Pages, BACKEND_LIVE=false)

1. Open `docs/index.html` directly in a browser after running
   `node scripts/render-site.mjs`. Confirm:
   - Editor's Cut commentary boxes appear under cut cards in both
     EN and 中文 tabs (mockups 23–26)
   - Fav-star buttons appear on each card; clicking persists to
     localStorage; star toggles empty/filled (mockups 06–07)
   - Language toggle (EN/中文) swaps card text + audio track for the
     session only; reload returns to EN (D1b)
   - Theme toggle (Anthropic / Linear) works as on master
2. Navigate to `docs/articles/<slug>/index.html` for a CN-source
   article. Confirm:
   - English 3-paragraph excerpt renders above the source-link CTA
   - SEO `<link rel="canonical">` points to CN source per D6
   - SEO `<link rel="alternate" hreflang="zh">` points to source
     (mockups 29–30)
3. Confirm `docs/sitemap.xml`, `docs/news-sitemap.xml`,
   `docs/robots.txt`, and `docs/feed.xml` validate against
   `validator.w3.org/feed/` (manual external validator check —
   tagged `[manual-only: visual-polish]` per Test Plan Artifact for
   B14).
4. Open mockups 27/28 (`docs/designs/.../27-email-en.html`,
   `28-email-zh.html`) in Gmail / Apple Mail / Outlook on iOS+desktop
   via paste-render-to-test-account. Confirm mobile legibility, color
   rendering, and link clickability — tagged `[manual-only:
   visual-polish]` per B6 because cross-client HTML rendering is not
   automatable in this harness.

### Dormant surfaces (BACKEND_LIVE=false; deferred to cloudflare-migration spec)

5. Subscribe form, `/favourites` Cloudflare-live states, sync-favourites
   flow, `/account` page — these surfaces ship dormant on GH Pages.
   Live verification is deferred to the
   `cloudflare-migration-and-vendor-onboarding` spec when the worker
   is deployed and BACKEND_LIVE flipped to `true`.

## Recommendation

Add a Playwright E2E harness in a follow-up branch
(`feat/playwright-e2e-harness`) to cover the 11 `needs-automation`
rows from the Test Plan Artifact. The current absence of Playwright
is the single largest QA gap in the live-rendered surfaces — not a
code defect, but a tooling gap that the brief surfaces explicitly.

## JSON tail

<!-- pipeline:json
{
  "schema_version": 1,
  "skill": "qa",
  "step": 6,
  "severity": {"critical": 0, "high": 0, "medium": 0, "low": 0},
  "completeness": 0,
  "confidence": 9,
  "verdict": "cannot_walk",
  "reason": "no Playwright + no dev server in this slice; Test Plan Artifact already tags 11 needs-automation rows for the follow-up E2E harness branch; 305/305 unit+integration tests passing covers route + renderer logic"
}
-->
