---
smart-rerun-applied:
  - 2026-05-17-rerun-1
  - 2026-05-17-rerun-2
---

# Patch Brief — backend-and-editorial-layer

**Branch:** `feat/backend-and-editorial-layer`
**Date:** 2026-05-17 (rerun-2: 2026-05-30)
**Pipeline outcome:** PASS (394/394 vitest tests + 13 E2E passing, 23/23 plan tasks, 80 commits ahead of `origin/main`)
**Ship-readiness:** Outstanding decisions resolved (see Smart Rerun results below). Branch is deferred-merge pending cloudflare-migration spec — do not merge PR #2 yet.

## Smart Rerun results — 2026-05-30-rerun-2

After rerun-1 closed 25 of 28 prior findings, the user surfaced two real UX gaps in manual preview that the static design-review missed:
- Missing nav links to `/favourites/` and `/account/` from the home page (fixed by `09b94d8` — site-nav header strip)
- Subscribe form gating logic was correct but a non-BACKEND_LIVE render had overwritten the preview output (root cause: Playwright `webServer` config didn't pass `BACKEND_LIVE=true`)

Rerun-2 Phase A classified 4 residuals:
- 1 HIGH `e2e-1` (editors-cut commentary doesn't respect language tab — B7b violation) → FIXED `0d97c5a`
- 1 LOW `a11y-1` (site-nav uses `data-current` not `aria-current="page"`) → FIXED `2fa7b22`
- 1 LOW `atom-1` (Atom feed item/source counts hardcoded `null` — falls back to "? ? ?") → DEFERRED, tracked
- 1 LOW `d1-1` (D1 test shim returns raw better-sqlite3 result without `meta` wrapping) → DEFERRED until a worker helper needs `meta.changes`

Test counts after rerun-2: 352 → 394 vitest passing (+42 across the B7b + a11y assertions). Playwright E2E: prior flake reclassified as real bug, now PASS — 13/13.

Heuristic for next rerun: site-nav-style integration gaps (UI that ships but isn't reachable) are systematically missed by static design-review. Future runs should include a "reachability sweep" — `find docs -name index.html | xargs grep -l 'href=' → check every page is reachable from every other via grep`.

## Recommended next steps (unchanged from rerun-1)

1. **Do NOT merge PR #2 yet.** Defer until cloudflare-migration is ready (your explicit verdict).
2. Author the **cloudflare-migration-and-vendor-onboarding spec**. T7/T8/T9 in current spec are its prereqs.
3. When ready to ship: `/ship` from this branch after cloudflare-migration merges to main.

---

## What was built

This branch adds the editorial layer, CN translation pages, SEO bundle, Atom feed, and a complete Cloudflare Worker backend — all behind a feature flag so the live GitHub Pages site continues uninterrupted while the backend code waits for the cloudflare-migration spec to flip the switch.

Key deliverables:

- **Editor's Cut commentary** — 🏅 commentary boxes on cut-article cards, bilingual (EN/中文), switching with the language tab; budget-recovery fallback handled.
- **CN-article translation pages** — `/articles/<slug>/` pages with EN excerpts, SEO canonical + hreflang, `NewsArticle` JSON-LD.
- **SEO bundle** — `sitemap.xml`, `news-sitemap.xml`, `robots.txt`, `ItemList` JSON-LD on digest pages, OpenGraph + Twitter Card meta on every page.
- **Atom 1.0 feed** at `/feed.xml` — 30-entry cap, stable URN IDs, autodiscovery `<link>` in every HTML page's `<head>`.
- **Cloudflare Worker + D1 backend** — 9 API routes (subscribe, magic-link verify, favourites CRUD, account management, Beehiiv webhook), HMAC session cookie, D1 schema migration, Resend/Beehiiv callers.
- **`/favourites` + `/account` page shells** — GH Pages states using localStorage only; Cloudflare states dormant.
- **Bilingual daily email templates** — `email_en.html` / `email_zh.html` matching mockups 27/28 with Beehiiv Post API step in GHA (no-op until secrets are set).
- **Security hardened** — 7 CRITICAL+HIGH issues fixed in the review self-loop (SESSION_SECRET startup guard, constant-time HMAC, fail-closed webhook, opaque magic-link errors, CSRF header on delete, per-IP rate limiting, auth-only language mutation).
- **`BACKEND_LIVE=false`** in the GH Pages deploy step — backend-dependent UI (subscribe form, sync prompt, `/account`) is omitted from the live build by construction.

---

## Automation coverage

**352 of 352 vitest tests passing** across 24 test files + **10 E2E tests passing** (17 skipped, 0 failed).

| Layer | Coverage |
|---|---|
| Worker integration (via `@cloudflare/vitest-pool-workers` + better-sqlite3 D1 shim) | All 9 API routes; auth, session, rate-limit, webhook signature |
| Renderer unit tests | Editorial commentary, translation pages, SEO helpers, Atom feed, email templates, article-id helper |
| Render integration tests | Editor's Cut on cards, translation page shape, SEO pages (sitemap/feed/robots), favourites page (both flag states), account page (flag-gated), feature-flag guard |
| Security paths | SESSION_SECRET guard, constant-time HMAC, rate limits, CSRF header, article-id format validation |
| Fav-star JS unit tests | localStorage toggle, `aria-pressed` state, add/remove idempotency (+13 new assertions via Smart Rerun) |
| E2E (Playwright) | `@playwright/test` + `playwright.config.mjs` + `npm run e2e`; 22 real tests + 9 cloudflare-deferred stubs; 10 passing + 17 skipped + 0 failed |
| Manual-only | Email cross-client rendering (mockups 27-28), Atom feed external validator |

---

## Manual verification checklist

> This is the mockup-derived checklist from `docs/specs/2026-05-17-backend-and-editorial-layer-verification-checklist.md`, inlined verbatim. Steps tagged `[GH-Pages-live]` can be checked now against local `node scripts/render-site.mjs` output. Steps tagged `[local-worker]` require `wrangler dev` running locally.

### P0 — Critical: test suite passes, core renderer works

- [ ] **P0.1** Run `npx vitest run` — all tests exit 0 with no failures. `[A1, all phases][unit]`
- [ ] **P0.2** Run `BACKEND_LIVE=false node scripts/render-site.mjs` — exits 0, no thrown errors, no "undefined" in console output. `[F3, L1][GH-Pages-live]`
- [ ] **P0.3** `docs/index.html` exists and is non-empty after render. `[F3][GH-Pages-live]`
- [ ] **P0.4** `docs/sitemap.xml` exists after render and contains `<urlset`. `[I2][GH-Pages-live]`
- [ ] **P0.5** `docs/feed.xml` exists after render and contains `xmlns="http://www.w3.org/2005/Atom"`. `[J2][GH-Pages-live]`
- [ ] **P0.6** `docs/robots.txt` exists and contains `User-agent: *` and a `Sitemap:` directive. `[I2][GH-Pages-live]`

### P1 — GH-Pages-live: editorial commentary (B7, B7b)

- [ ] **P1.1 [B7]** Load `docs/index.html` in a browser. Cards whose `article_id` appears in `editorial.cuts[]` contain an `<aside class="editors-cut">` element with text `🏅 Editor's Cut`. Cards not in the cut have no `<aside class="editors-cut">`. `[mockup: docs/designs/backend-and-editorial-layer/23-editors-cut-cut-with-en-commentary.html § editors-cut-cut-with-en-commentary]` `[mockup: docs/designs/backend-and-editorial-layer/26-editors-cut-not-cut-no-box.html § editors-cut-not-cut-no-box]`
- [ ] **P1.2 [B7]** The commentary box on a cut article shows `commentary_en` text when EN tab is active. `[mockup: docs/designs/backend-and-editorial-layer/23-editors-cut-cut-with-en-commentary.html]`
- [ ] **P1.3 [B7b]** Clicking the 中文 language tab swaps every `<aside class="editors-cut">` to show `commentary_zh` text. `[mockup: docs/designs/backend-and-editorial-layer/24-editors-cut-cut-with-zh-commentary.html]`
- [ ] **P1.4 [B7b]** On a budget-recovery day (only `commentary_en` present): clicking 中文 shows EN commentary with `(English only today)` fallback tag. Box is never blank. `[mockup: docs/designs/backend-and-editorial-layer/25-editors-cut-cut-zh-fallback-to-en.html]`

### P2 — GH-Pages-live: favourites star, `/favourites` page, language model (B1b, B2, B4)

- [ ] **P2.1 [B1b]** Load `docs/index.html` fresh (clear localStorage). EN tab is selected; no `lang` key written to localStorage.
- [ ] **P2.2 [B1b]** Click 中文 — cards swap to `summary_zh`. Reload — site returns to EN. No localStorage `lang` key persists.
- [ ] **P2.3 [B2]** Every article card has a ☆ star button (`data-testid="fav-star"`, `aria-pressed="false"`). `[mockup: docs/designs/backend-and-editorial-layer/06-favourite-star-empty.html]`
- [ ] **P2.4 [B2]** Click ☆ on any card — icon fills to ★ (`aria-pressed="true"`). DevTools → localStorage → `favourites_v1` contains the `article_id`. No network request fires. `[mockup: docs/designs/backend-and-editorial-layer/07-favourite-star-filled.html]`
- [ ] **P2.5 [B2]** Click ★ on a saved article — icon reverts to ☆ and `article_id` is removed from `localStorage.favourites_v1`.
- [ ] **P2.6 [B4]** Open `docs/favourites/index.html` with no saves in localStorage. Shows empty-state message ("No favourites yet"). No sync-prompt rendered (`BACKEND_LIVE=false`). `[mockup: docs/designs/backend-and-editorial-layer/09-favourites-ghpages-empty-no-saves.html]`
- [ ] **P2.7 [B4]** Save 2 articles via stars. Open `docs/favourites/index.html`. Both articles appear as cards with ★ stars, newest-first. No sync-prompt. `[mockup: docs/designs/backend-and-editorial-layer/10-favourites-ghpages-populated.html]`

### P3 — GH-Pages-live: CN translation pages (B8, B9)

- [ ] **P3.1 [B8]** After render, `docs/articles/<slug>/index.html` exists for each entry in `summaries.translations[]`.
- [ ] **P3.2 [B8]** Open a translation page. Contains `data-testid="translation-article"`, EN excerpt (~3 paragraphs), "Read original (中文) →" CTAs (top + bottom). `[mockup: docs/designs/backend-and-editorial-layer/29-article-translation-populated.html]`
- [ ] **P3.3 [B8]** View source of translation page. `<head>` contains: `<link rel="canonical" href="<CN-source-URL>">`, `<link rel="alternate" hreflang="zh" href="<CN-source-URL>">`, `<link rel="alternate" hreflang="en" href="<our-URL>">`, `<script type="application/ld+json">` with `"@type":"NewsArticle"` and `"isBasedOn"`. `[B13]`
- [ ] **P3.4 [B8]** CN-source card on home page with EN tab active — clicking card title navigates to `/articles/<slug>/`.
- [ ] **P3.5 [B9]** Switch to 中文 tab on same card — clicking card title opens original CN source URL.
- [ ] **P3.6** For a slug with null `excerpt_en` (budget recovery), `docs/articles/<slug>/index.html` shows `data-testid="translation-placeholder"` and "Translation pending" heading. `[mockup: docs/designs/backend-and-editorial-layer/30-article-translation-pending-placeholder.html]`

### P4 — GH-Pages-live: SEO bundle (B12–B15)

- [ ] **P4.1 [B12]** Open `docs/sitemap.xml`. Valid XML with `<urlset>`. Contains `<loc>` entries for `/`, `/digests/YYYY-MM-DD.html` (all digest dates), `/articles/<slug>/`, `/favourites`, `/feed.xml`.
- [ ] **P4.2 [B12]** `docs/robots.txt` contains `Sitemap: <absolute-URL-to-sitemap.xml>`.
- [ ] **P4.3 [B14]** Open `docs/feed.xml`. Valid Atom 1.0: `<feed xmlns="http://www.w3.org/2005/Atom">`, 1–30 `<entry>` elements each with stable `<id>urn:ai-daily-digest:YYYY-MM-DD</id>` and `<link rel="alternate" type="text/html">` to the archive page.
- [ ] **P4.4 [B14]** `docs/feed.xml` does NOT contain text from `editorial.overall_en`, `editorial.overall_zh`, or any `commentary_*` field.
- [ ] **P4.5 [B14]** Feed entry count is ≤ 30.
- [ ] **P4.6 [B15]** View source of `docs/index.html`. `<head>` contains exactly one `<link rel="alternate" type="application/atom+xml" title="AI Daily Digest" href="/feed.xml">`.
- [ ] **P4.7 [B15]** Same autodiscovery `<link>` appears once in `docs/digests/index.html`.
- [ ] **P4.8 [B15]** Same autodiscovery `<link>` appears once in `docs/articles/<slug>/index.html`.
- [ ] **P4.9 [B15]** Same autodiscovery `<link>` appears once in `docs/favourites/index.html`.
- [ ] **P4.10** View source of `docs/index.html`. `<head>` contains `og:title`, `og:description`, `og:type`, `og:image`, and `twitter:card="summary_large_image"`.
- [ ] **P4.11** View source of a digest archive page. `<head>` contains `<script type="application/ld+json">` with `"@type":"ItemList"`.
- [ ] **P4.12 [B13]** Translation page `<head>` has Atom autodiscovery `<link>` AND canonical + hreflang links. No duplicate `<link rel="canonical">`.

### P5 — Local-worker: backend API routes (B1, B3, B5, B6, B6b, B10, B11)

> All steps require `npx wrangler dev` running and D1 initialised via `npx wrangler d1 migrations apply ai-daily-digest-dev --local`.

- [ ] **P5.1 [B1]** POST `http://localhost:8787/api/subscribe` with `{ "email": "test@example.com", "language": "en" }`. Response: 200. D1 `subscribers` row appears with `verified_at=null`, `language=en`. `magic_links` row with `purpose=subscribe`.
- [ ] **P5.1b [B1]** POST `/api/subscribe` with `{ "email": "not-an-email" }`. Response: 400.
- [ ] **P5.2 [B1]** GET `/api/auth/verify?token=<valid-token>`. Response: 302 → `/account?welcome=1`. `Set-Cookie` present (HttpOnly, Secure, SameSite=Lax). D1: `verified_at` set, `consumed_at` set.
- [ ] **P5.3 [B1]** Repeat GET with same (consumed) token. Response: 400.
- [ ] **P5.4 [B3]** With session cookie, GET `/api/favourites`. Response: 200 `{ "article_ids": [] }`.
- [ ] **P5.5 [B3]** POST `/api/favourites` `{ "article_id": "aihot-a3f12b8c" }`. Response: 201. GET `/api/favourites` returns the id.
- [ ] **P5.6 [B3]** POST same `article_id` again. Response: 200 (idempotent). One row in D1.
- [ ] **P5.7 [B3]** DELETE `/api/favourites/aihot-a3f12b8c`. Response: 200. GET returns empty list.
- [ ] **P5.8 [B5]** POST `/api/sync-favourites` `{ "email": "test@example.com" }`. Response: 200. `magic_links` row with `purpose=restore-favourites`. GET verify token → 302 → `/favourites?welcome=1`.
- [ ] **P5.9 [B6b]** PUT `/api/account/language` `{ "language": "zh" }`. Response: 200. D1: `subscribers.language = zh`.
- [ ] **P5.10 [B10]** POST `/api/account/unsubscribe`. Response: 200. D1: `unsubscribed_at` set. Favourites rows still present.
- [ ] **P5.11 [B11]** POST `/api/account/delete`. Response: 200. D1: all `favourites`, `magic_links`, `subscribers` rows for that email gone. Session cookie cleared.
- [ ] **P5.12** POST `/api/account/unsubscribe` with no cookie. Response: 401.
- [ ] **P5.13** POST `/api/webhooks/beehiiv` with valid Beehiiv HMAC payload for `test@example.com`. Response: 200. D1: `unsubscribed_at` set.
- [ ] **P5.14** POST `/api/webhooks/beehiiv` with missing/invalid signature. Response: 401.

### Feature-flag gate

- [ ] **FLAG.1** Render with `BACKEND_LIVE=false`. `docs/index.html` does NOT contain `data-testid="subscribe-form"`.
- [ ] **FLAG.2** Render with `BACKEND_LIVE=false`. `docs/favourites/index.html` does NOT contain `data-testid="sync-prompt"`.
- [ ] **FLAG.3** `.github/workflows/*.yml` contains `BACKEND_LIVE=false` in the GH Pages deploy step env.
- [ ] **FLAG.4** Render with `BACKEND_LIVE=true`. `docs/index.html` DOES contain `data-testid="subscribe-form"` and `docs/account/index.html` exists with `data-testid="account-page"`.

### Email render

- [ ] **EMAIL.1** Run `node scripts/post-to-beehiiv.mjs en` with `BEEHIIV_API_KEY` unset. Script exits 0 (no-op, no exception).
- [ ] **EMAIL.2** Call `renderEmailEn(summaries, 'https://example.com')` with the editorial fixture. Returned HTML contains `data-testid="email-body"`, EN narrative, cut article list with border-left styling, `{{ beehiiv_unsubscribe_url }}` placeholder. `[manual-only: visual-polish]` — also open `docs/designs/backend-and-editorial-layer/27-email-en.html` in Gmail + Apple Mail + Outlook iOS to verify cross-client rendering.
- [ ] **EMAIL.3** Call `renderEmailZh(...)`. Subject contains "AI 每日精选", body contains `editorial.overall_zh` and Chinese teases. `[manual-only: visual-polish]` — open `docs/designs/backend-and-editorial-layer/28-email-zh.html` in email clients.
- [ ] **EMAIL.4** EN email does NOT contain `editorial.overall_zh`. ZH email does NOT contain `editorial.overall_en`.

### External validator

- [ ] **FEED.1** Once deployed (or served locally via any static HTTP server): submit `docs/feed.xml` URL to `validator.w3.org/feed/`. Expect a clean validation pass. `[manual-only: visual-polish]`

---

## Mockup coverage

Mockup states: 30 total across 30 mockup files.

- **Live-rendered now (GH-Pages-live):** 12 states — Editor's Cut (23–26), translation pages (29–30), fav-star (06–07), favourites GH Pages (09–10), plus the tile-entry states that are layout-only (13, 14, 15, 16 are all in the DOM via client-JS; 11-12 are Cloudflare-live only).
- **Dormant this slice (BACKEND_LIVE=false):** 18 states — subscribe form (01–05), favourites Cloudflare states (11–12), sync-favourites flow (13–16 client-interactive states), account page (17–22), email bodies (27–28).

Live `/mockup-parity --all-states` is deferred to the cloudflare-migration spec, where `wrangler dev` with provisioned secrets is available and `BACKEND_LIVE=true`. The CANNOT_WALK result from Phase 3 is expected and documented.

---

## Coverage map

Checklist items mapped to test automation. Functional items with no E2E test are flagged as coverage gaps awaiting the Playwright follow-up branch.

| Section | # | Checklist item | Status | Test / category |
|---|---|---|---|---|
| P0 | 1 | All tests pass (vitest run) | ✓ automated | `npx vitest run` — 352/352 |
| P0 | 2 | Renderer exits 0 | ✓ automated | `tests/render/feature-flag.test.mjs` |
| P0 | 3–6 | sitemap/feed/robots exist | ✓ automated | `tests/render/seo-pages.test.mjs` |
| P1 | 1–4 | Editor's Cut commentary (EN + ZH + fallback) | ✓ automated | `tests/render/editors-cut.test.mjs`, `tests/lib/editorial.test.mjs` |
| P2 | 1–2 | Language tab + no localStorage write | ✓ automated | `tests/render/feature-flag.test.mjs` + A-L3 gap closed by Smart Rerun |
| P2 | 3–5 | Fav-star toggle + localStorage | ✓ automated | `tests/lib/fav-star-script.test.mjs` (unit) + `tests/e2e/fav-star.spec.mjs` (E2E) |
| P2 | 6–7 | /favourites GH-Pages states | ✓ automated | `tests/render/favourites-page.test.mjs` |
| P3 | 1–3 | Translation pages + SEO head | ✓ automated | `tests/render/translation-pages.test.mjs`, `tests/lib/translations.test.mjs` |
| P3 | 4–5 | Card title links EN vs 中文 tab | ✓ automated | `tests/e2e/language-tab.spec.mjs` |
| P3 | 6 | Budget-recovery placeholder | ✓ automated | `tests/render/translation-pages.test.mjs` |
| P4 | 1–12 | SEO bundle (sitemap/feed/robots/OG/JSON-LD/autodiscovery) | ✓ automated | `tests/render/seo-pages.test.mjs`, `tests/lib/seo.test.mjs` |
| P5 | 1–14 | Worker API routes (all 9) | ✓ automated | `tests/worker/*.test.ts` |
| FLAG | 1–4 | Feature-flag gate | ✓ automated | `tests/render/feature-flag.test.mjs`, `tests/render/account-page.test.mjs` |
| EMAIL | 1–4 | Email template unit correctness | ✓ automated | `tests/lib/email-template.test.mjs` |
| EMAIL | 2–3 | Cross-client email rendering | ✗ manual-only: visual-polish | Not automatable in this harness |
| FEED | 1 | Atom feed external validator | ✗ manual-only: visual-polish | External validator (validator.w3.org) |

---

## Known gaps and deferred items

### Carry-forward findings — post Smart Rerun

- 0 CRITICAL, 0 HIGH (unchanged from Step 5 fixes)
- 25 of 28 prior MEDIUM/LOW findings: **RESOLVED** by Smart Rerun Package A (commits `bb1bebb` through `87302d0`)
- 3 remaining items, all surfaced or refined during the fix pass:
  - LOW: Atom feed `itemCount/sourceCount` falls back to "? ? ?" when manifest data is absent — acceptable in tests, real renders populate via manifest
  - LOW: test D1 shim across multiple test files returns raw better-sqlite3 result without meta wrapping — not currently a bug but worth noting for future db.ts helpers that need `meta.changes`
  - INFO: account-page.mjs had no canonical link before Smart Rerun — now added; double-check on first real render
- **NEW DISCOVERY (Smart Rerun):** fav-star buttons rendered without their localStorage click handler (Stage B authored markup, not JS). Fixed via `scripts/lib/fav-star-script.mjs` + render-site wiring. 13 new vitest assertions; 4 prior-RED E2E tests now passing.

### Infrastructure gaps

- **No live dev server** — mockup-parity walk and full Playwright E2E (Cloudflare-live surfaces) both require a running HTTP server with `wrangler dev`. Neither is wired into CI today.
- **`BACKEND_LIVE=true` surfaces untestable against live GH Pages** — subscribe form, sync-prompt, `/account` page, and all Cloudflare-live mockup states (11–22) are dormant until the cloudflare-migration spec.

### Deferred to cloudflare-migration spec

- Production Cloudflare Pages/Worker/D1 provisioning.
- Beehiiv + Resend account creation and segment setup.
- `BACKEND_LIVE=true` flip in GHA deploy step.
- Custom domain + DNS migration.
- Google Search Console + Bing Webmaster submission.
- Live `/mockup-parity --all-states` walk against `wrangler dev`.

### TODOs recorded in spec

T1: Site logo + brand mark (blocks OG image strategy lock-in). T2: Revisit OG image strategy after logo lands. T3: EN→CN translation (when CN subscriber demand surfaces). T4: Beehiiv Max upgrade if Post API on Launch tier proves unreliable. T5: Google News inclusion verification (~30 days post-launch). T6: Per-recipient email personalisation. T7: Beehiiv Post API spike required before cloudflare-migration starts (confirm Launch tier supports scheduled-post creation via API). T8: Domain choice required before authoring cloudflare-migration spec (drives DNS, Cloudflare Pages project name, Resend sending domain, feed `<link rel="self">` URL). T9: Logo + OG image strategy (placeholder OG ships now; finalise post-cloudflare-migration).

---

## Outstanding decisions

> All 6 decisions resolved by Smart Rerun — see Smart Rerun results section below.

1. **Ship now vs defer** — RESOLVED: **Defer** the merge of PR #2 until the cloudflare-migration spec is ready. Single observable moment instead of dormant ship.
2. **Carry-forward findings here vs follow-up** — RESOLVED: **Apply all 25 in this branch.** Smart Rerun Package A landed 17 atomic commits addressing R-M1..R-M7, R-L1..R-L3, D-M1..D-M5, D-L1..D-L4, A-M1..A-M5, A-L1.
3. **Playwright E2E timing** — RESOLVED: **Add Playwright now in this branch.** Smart Rerun Package B landed `@playwright/test`, `playwright.config.mjs`, `npm run e2e` script, and 22 real + 9 cloudflare-deferred tests under `tests/e2e/`. The harness immediately surfaced a real bug (fav-star click handler missing) that was fixed in a follow-up commit.
4. **Beehiiv Post API spike** — MOVED TO SPEC TODO: spec T7 records the spike as required before cloudflare-migration starts.
5. **Domain + logo + OG image** — MOVED TO SPEC TODO: spec T8 (domain) + T9 (logo, OG strategy).
6. **PR strategy single vs phased** — RESOLVED: **Single PR** (PR #2 already open at https://github.com/rowland-dot/ai-daily-digest/pull/2).

---

## Smart Rerun results — 2026-05-17-rerun-1

Phase A — classified 6 outstanding decisions + 28 carry-forward findings into 5 buckets:
  - pre-approvable-fix: 25
  - automation-eligible: 1
  - human-decision: 4
  - feature-gap: 0
  - outside-scope: 2

Phase B — gathered 4 user verdicts via single batched AskUserQuestion.

Phase D landed three work packages:
  - Package A: 17 atomic commits resolving 25 of 28 prior MEDIUM/LOW findings.
  - Package B: Playwright harness + 22 real E2E tests + 9 cloudflare-deferred stubs.
  - Package C: spec TODOs T7/T8/T9 for Beehiiv spike + domain + logo.

Bug surfaced + fixed during rerun: fav-star buttons rendered without
their localStorage click handler (Stage B authored markup, not JS).
Fixed via `scripts/lib/fav-star-script.mjs` + render-site wiring.
13 new vitest assertions; 4 prior-RED E2E tests now passing.

Test counts: 339 vitest passing → 352 vitest passing (+13 fav-star JS);
E2E: 10 passing + 17 skipped (sample-data gating or cloudflare-deferred) + 0 failed.

---

## Recommended next steps

1. **Do NOT merge PR #2 yet.** The branch ships dormant-backend code
   for cloudflare-migration to absorb. Land + verify cloudflare-migration
   before this merges so users see backend-live UI as a single launch
   event.
2. Author the **cloudflare-migration-and-vendor-onboarding spec**
   (see spec § Implementation phasing). T7 (Beehiiv spike), T8 (domain),
   and T9 (logo + OG) are its prereqs.
3. When ready to ship: `/ship` from this branch (after cloudflare-migration
   merges to main). The Step 8 brief deliberately stops short of `/ship`.

---

<!-- pipeline:json
{
  "schema_version": 1,
  "skill": "patch-brief",
  "step": 8,
  "smart_rerun_applied": "2026-05-17-rerun-1",
  "outstanding_decisions_count": 0,
  "medium_findings_carried": 0,
  "low_findings_carried": 3,
  "info_findings_carried": 1,
  "human_test_brief_items": 38,
  "vitest_passing": 352,
  "e2e_passing": 10,
  "e2e_skipped": 17,
  "e2e_failed": 0,
  "completeness": 10,
  "confidence": 9
}
-->
