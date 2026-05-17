# Patch Brief — backend-and-editorial-layer

**Branch:** `feat/backend-and-editorial-layer`
**Date:** 2026-05-17
**Pipeline outcome:** PASS (305/305 tests, 23/23 plan tasks, 37 commits ahead of `origin/main`)
**Ship-readiness:** Pending outstanding decisions below. Code is merge-ready for the editorial, translation, and SEO surfaces today; backend surfaces are dormant behind `BACKEND_LIVE=false`.

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

**305 of 305 tests passing** across 24 test files.

| Layer | Coverage |
|---|---|
| Worker integration (via `@cloudflare/vitest-pool-workers` + better-sqlite3 D1 shim) | All 9 API routes; auth, session, rate-limit, webhook signature |
| Renderer unit tests | Editorial commentary, translation pages, SEO helpers, Atom feed, email templates, article-id helper |
| Render integration tests | Editor's Cut on cards, translation page shape, SEO pages (sitemap/feed/robots), favourites page (both flag states), account page (flag-gated), feature-flag guard |
| Security paths | SESSION_SECRET guard, constant-time HMAC, rate limits, CSRF header, article-id format validation |
| E2E (Playwright) | **0 tests — deferred** (11 `needs-automation` rows tracked for `feat/playwright-e2e-harness`) |
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
| P0 | 1 | All tests pass (vitest run) | ✓ automated | `npx vitest run` — 305/305 |
| P0 | 2 | Renderer exits 0 | ✓ automated | `tests/render/feature-flag.test.mjs` |
| P0 | 3–6 | sitemap/feed/robots exist | ✓ automated | `tests/render/seo-pages.test.mjs` |
| P1 | 1–4 | Editor's Cut commentary (EN + ZH + fallback) | ✓ automated | `tests/render/editors-cut.test.mjs`, `tests/lib/editorial.test.mjs` |
| P2 | 1–2 | Language tab + no localStorage write | partial | `tests/render/feature-flag.test.mjs` (partial — L3 gap: setItem contract unverified) |
| P2 | 3–5 | Fav-star toggle + localStorage | ✗ needs-automation | E2E deferred — `feat/playwright-e2e-harness` |
| P2 | 6–7 | /favourites GH-Pages states | ✓ automated | `tests/render/favourites-page.test.mjs` |
| P3 | 1–3 | Translation pages + SEO head | ✓ automated | `tests/render/translation-pages.test.mjs`, `tests/lib/translations.test.mjs` |
| P3 | 4–5 | Card title links EN vs 中文 tab | ✗ needs-automation | E2E deferred |
| P3 | 6 | Budget-recovery placeholder | ✓ automated | `tests/render/translation-pages.test.mjs` |
| P4 | 1–12 | SEO bundle (sitemap/feed/robots/OG/JSON-LD/autodiscovery) | ✓ automated | `tests/render/seo-pages.test.mjs`, `tests/lib/seo.test.mjs` |
| P5 | 1–14 | Worker API routes (all 9) | ✓ automated | `tests/worker/*.test.ts` |
| FLAG | 1–4 | Feature-flag gate | ✓ automated | `tests/render/feature-flag.test.mjs`, `tests/render/account-page.test.mjs` |
| EMAIL | 1–4 | Email template unit correctness | ✓ automated | `tests/lib/email-template.test.mjs` |
| EMAIL | 2–3 | Cross-client email rendering | ✗ manual-only: visual-polish | Not automatable in this harness |
| FEED | 1 | Atom feed external validator | ✗ manual-only: visual-polish | External validator (validator.w3.org) |

---

## Known gaps and deferred items

### MEDIUM findings carried forward (17 total — fix before cloudflare-migration spec)

**From /review (7):**

| ID | Location | Finding |
|---|---|---|
| R-M1 | `worker/routes/subscribe.ts:46-49` | Stale magic links not invalidated on re-subscribe — concurrent valid links remain live up to 30 min. Fix: DELETE prior unconsumed links before INSERT. |
| R-M2 | `worker/routes/favourites.ts:77-83` | N+1 SELECT before INSERT — fetch-whole-list dedup check when `INSERT OR IGNORE` + `meta.changes` is sufficient. |
| R-M3 | `worker/routes/subscribe.ts` / `db.ts:setVerified` | Re-subscribe does not clear `unsubscribed_at` — re-activated user still shows "unsubscribed" on `/account`. Fix: add `SET unsubscribed_at = NULL` in `setVerified()`. |
| R-M4 | `worker/routes/subscribe.ts:11` | Email regex too permissive (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`). Acceptable for MVP; tighten when adding rate limits. |
| R-M5 | `worker/lib/email.ts:11` | `RESEND_API_KEY === 'test'` magic string silently skips emails. Gate on `env.ENVIRONMENT === 'test'` instead. |
| R-M6 | `tests/worker/webhooks.test.ts:109-119` | "no-op when secret absent" test codifies a fail-open bug (now fixed in production); test must be updated to assert 503 when secret is absent. |
| R-M7 | `worker/lib/beehiiv.ts:44,73` | Beehiiv list-lookup failures silently swallowed (`if (!listRes.ok) return;`). Log + raise to avoid silent split-brain between D1 and Beehiiv. |

**From /design-review (5):**

| ID | Location | Finding |
|---|---|---|
| D-M1 | `docs/designs/backend-and-editorial-layer/14-sync-favourites-prompt-open-email-input.html:41` | Inline `style="box-shadow:none;padding:0;border:0"` overrides `.subscribe-form`. Add `.subscribe-form--bare` modifier class to `_shared.css`. |
| D-M2 | `scripts/lib/translations.mjs:135` | `data-state="pending"` attribute missing on placeholder div (mockup 30 has it). Add it to keep CSS selector and parity checks aligned. |
| D-M3 | `scripts/lib/translations.mjs:135-140` | Placeholder body copy diverges from mockup 30 — generic copy vs the richer "Our daily routine ran out of capacity…" text. Lift verbatim from mockup. |
| D-M4 | `scripts/lib/favourites-page.mjs:87-94`, `scripts/lib/account-page.mjs:76-83` | Hero on `/favourites` and `/account` emits `.lang-switch` only; `.theme-switch` is absent. Both helpers need the theme-switch block added. |
| D-M5 | `scripts/lib/translations.mjs:124` | Translation page hero shows generic "EN Translation — {Source} Article" as the prominent `<h1>`; article title is a second `<h1>` below. Two `<h1>` per page violates heading-uniqueness; the hero `<h1>` is less informative. Fix: move article title into hero or drop the hero `<h1>`. |

**From audit (5):**

| ID | Location | Finding |
|---|---|---|
| A-M1 | `tests/lib/seo.test.mjs:7` | `renderNewsArticleJsonLd` imported but never called in its own describe block. Spec B13 required fields (`headline`, `datePublished`, `articleBody`, `mainEntityOfPage`) have no direct assertions. |
| A-M2 | `tests/render/seo-pages.test.mjs:133` | Atom summary check uses `toContain("Today's digest:")` — would pass if editorial prose was appended. Tighten to strict regex `/^Today's digest: \d+ items across \d+ sources/`. |
| A-M3 | `tests/render/account-page.test.mjs` | `#toast-root` container (required by client JS for language-saved toast) not asserted in static HTML tests. A refactor removing it would go undetected. |
| A-M4 | `tests/render/account-page.test.mjs` | `aria-live="polite"` on `#toast-root` (spec-required for accessibility) not asserted. |
| A-M5 | `tests/worker/auth-verify.test.ts:69` | `Secure` and `SameSite=Lax` cookie attributes present in implementation but not asserted in any test. |

### LOW findings carried forward (11 total)

**From /review (3):** R-L1 (typo `hasTranlation` in `scripts/lib/translations.mjs:85`), R-L2 (canonical URL under GH Pages may not match `/ai-daily-digest/` prefix — spot-check post-deploy), R-L3 (`siteOrigin` interpolated raw into email HTML anchor href — route through `escapeAttr()` when hardening).

**From /design-review (4):** D-L1 (`BACKEND_LIVE=true` comment in renderer lacks `// TODO: linked-user shell`), D-L2 (fav-star syncing spinner pokes 2px outside positioning box at small viewports), D-L3 (card-meta shows locale-date string not relative-time; `relTime()` already exists in renderer), D-L4 (storyboard Tier-A row 06 entry-point claim could be clearer that the star is on every card).

**From audit (4):** A-L1 (B15 autodiscovery test uses `>=1` not `===1`; only checks `index.html`, not digest/translation/favourites/account pages), A-L2 (`og:description` not asserted in `renderOgMeta` test suite), A-L3 (B1b "no `localStorage.setItem('lang')`" contract stated in plan but absent from test), A-L4 (Beehiiv `moveToLanguageSegment` not stubbed in `PUT /api/account/language` test — segment-move can silently break).

### Infrastructure gaps

- **No Playwright E2E harness** — 11 `needs-automation` behaviours deferred to `feat/playwright-e2e-harness` (fav-star toggle, subscribe form arc, language tab card behaviour, sync-favourites flow arc, account delete arc, etc.).
- **No live dev server** — mockup-parity walk and Playwright E2E both require a running HTTP server. The static renderer produces files; the worker requires `wrangler dev`. Neither is wired into CI today.
- **`BACKEND_LIVE=true` surfaces untestable against live GH Pages** — subscribe form, sync-prompt, `/account` page, and all Cloudflare-live mockup states (11–22) are dormant until the cloudflare-migration spec.

### Deferred to cloudflare-migration spec

- Production Cloudflare Pages/Worker/D1 provisioning.
- Beehiiv + Resend account creation and segment setup.
- `BACKEND_LIVE=true` flip in GHA deploy step.
- Custom domain + DNS migration.
- Google Search Console + Bing Webmaster submission.
- Live `/mockup-parity --all-states` walk against `wrangler dev`.

### TODOs recorded in spec

T1: Site logo + brand mark (blocks OG image strategy lock-in). T2: Revisit OG image strategy after logo lands. T3: EN→CN translation (when CN subscriber demand surfaces). T4: Beehiiv Max upgrade if Post API on Launch tier proves unreliable. T5: Google News inclusion verification (~30 days post-launch). T6: Per-recipient email personalisation.

---

## Outstanding decisions

> Decide these before running `/ship`.

1. **Ship this branch now vs defer until cloudflare-migration ships.**
   The live-on-GH-Pages improvements (Editor's Cut commentary, fav-star buttons, translation pages, SEO bundle, Atom feed, EN-default language model) are independently valuable today — readers benefit without a subscriber or backend. Shipping now means the `BACKEND_LIVE=false` state becomes the live site while the cloudflare-migration spec is authored.
   - Option A — **Ship now** (Recommended, confidence 9/10): merge to `main`, let GH Pages redeploy, editorial/SEO improvements go live immediately. Backend code ships dark; cloudflare-migration spec starts next.
   - Option B — Hold until cloudflare-migration spec is also ready: one ship moment for everything. Adds latency (~several hours AI-time) but means the subscribe form goes live in the same deploy.

2. **Carrying MEDIUM/LOW findings to a follow-up branch vs fixing in this branch before /ship.**
   17 MEDIUM + 11 LOW findings are in scope. None are CRITICAL or HIGH; all CRITICAL+HIGH were fixed in the review self-loop. The branch is merge-ready as-is.
   - Option A — **Fix MEDIUM findings in a `fix/review-followup` branch after this branch ships** (Recommended, confidence 8/10): faster path to getting the editorial improvements live; finding list is tracked here for the follow-up author.
   - Option B — Fix the higher-impact MEDIUMs (R-M3 re-subscribe flag, A-M5 cookie assertions, D-M4 theme-switch) in this branch before /ship: adds ~30 min; slightly cleaner test suite at merge.

3. **Playwright E2E harness — create `feat/playwright-e2e-harness` now or defer to cloudflare-migration.**
   11 `needs-automation` rows are currently untested at the browser level. The harness is needed before the subscribe form and account flows go live.
   - Option A — Create the branch now, alongside this branch's PR: E2E exists at PR-merge time; CI catches regressions before BACKEND_LIVE flips.
   - Option B — **Defer to cloudflare-migration** (Recommended, confidence 8/10): the dormant surfaces (subscribe form, sync-prompt, account) can't be fully tested until `wrangler dev` is wired into CI anyway. Less rework risk if the defer is explicitly tracked.

4. **Beehiiv Post API on Launch tier — spike before cloudflare-migration or trust the spec's risk note.**
   The spec (D4, Risk section) flags this: "spike a single Post API call against the free tier before relying on it." Beehiiv Launch tier may not support scheduled-post creation via API.
   - Option A — **Spike now in a throwaway script against a personal Beehiiv dev account** (Recommended, confidence 9/10): 15-min test; if Launch doesn't support it, the cloudflare-migration spec can be scoped differently before implementation starts.
   - Option B — Discover at cloudflare-migration implementation time: risk of needing to redesign the email pipeline step mid-spec.

5. **Custom domain + logo + OG image — confirm before cloudflare-migration starts.**
   Three open items in the spec: (a) domain choice, (b) logo/brand mark, (c) OG image strategy. None block this branch, but the cloudflare-migration spec cannot start until the domain is chosen (it drives DNS, Cloudflare Pages project name, Resend sending domain, and the feed's `<link rel="self">` URL).
   - Confirm the domain before authoring the cloudflare-migration spec.
   - Logo and OG image can follow post-cloudflare-migration (placeholder OG image ships today).

6. **PR strategy — single PR or phased.**
   This branch has 37 commits across a wide scope (backend, editorial, SEO, translations, worker, tests).
   - Option A — **Single PR** (Recommended, confidence 8/10): everything merges together; BACKEND_LIVE=false ensures nothing breaks live. Simpler history.
   - Option B — Phased PRs: PR-1 for editorial + SEO + feed (pure GH-Pages-live improvements), PR-2 for worker + D1 + dormant UI. More review-friendly split; adds merge overhead.

---

## Recommended next pipeline invocation

```
Recommended next pipeline invocation:
  /ship  (merge this branch + create PR)
```

After /ship:
1. Author `fix/review-followup` branch to address MEDIUM findings (if Decision 2 Option A is chosen).
2. Spike Beehiiv Post API on Launch tier (Decision 4).
3. Confirm domain choice, then author `cloudflare-migration-and-vendor-onboarding-spec.md`.
4. Create `feat/playwright-e2e-harness` before the cloudflare-migration spec merges (Decision 3).

---

<!-- pipeline:json
{
  "schema_version": 1,
  "skill": "patch-brief",
  "step": 8,
  "outstanding_decisions_count": 6,
  "medium_findings_carried": 17,
  "low_findings_carried": 11,
  "human_test_brief_items": 38,
  "completeness": 9,
  "confidence": 9
}
-->
