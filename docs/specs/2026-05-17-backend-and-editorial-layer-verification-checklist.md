# Backend, Editorial Layer, Translations & SEO — Verification Checklist

**Spec:** `docs/specs/2026-05-17-backend-and-editorial-layer-spec.md`
**Plan:** `docs/plans/2026-05-17-backend-and-editorial-layer-plan.md`
**Date:** 2026-05-17

Each step is a single testable action with a named user-visible expected outcome. Steps are tagged with the spec behaviour they verify (`[Bx]`), the plan task that implements them (`[Ax]`), and where applicable the mockup file that is the structural source of truth (`[mockup: path § state]`).

Legend:
- **[GH-Pages-live]** — verifiable against the live GH Pages site (or local `node scripts/render-site.mjs` output)
- **[local-worker]** — verifiable against `wrangler dev` + local D1 only (backend not live on GH Pages)
- **[unit]** — verifiable by running `npx vitest run`

---

## P0 — Critical: test suite passes, core renderer works

- [ ] **P0.1** Run `npx vitest run` — all tests exit 0 with no failures. `[A1, all phases][unit]`
- [ ] **P0.2** Run `BACKEND_LIVE=false node scripts/render-site.mjs` — exits 0, no thrown errors, no "undefined" in console output. `[F3, L1][GH-Pages-live]`
- [ ] **P0.3** `docs/index.html` exists and is non-empty after render. `[F3][GH-Pages-live]`
- [ ] **P0.4** `docs/sitemap.xml` exists after render and contains `<urlset`. `[I2][GH-Pages-live]` `[mockup: n/a]`
- [ ] **P0.5** `docs/feed.xml` exists after render and contains `xmlns="http://www.w3.org/2005/Atom"`. `[J2][GH-Pages-live]`
- [ ] **P0.6** `docs/robots.txt` exists and contains `User-agent: *` and a `Sitemap:` directive. `[I2][GH-Pages-live]`

---

## P1 — GH-Pages-live: editorial commentary (B7, B7b)

- [ ] **P1.1 [B7]** Load `docs/index.html` in a browser (or parse rendered HTML). Cards whose `article_id` appears in `editorial.cuts[]` contain an `<aside class="editors-cut">` element with text `🏅 Editor's Cut`. Cards not in the cut have no `<aside class="editors-cut">`. `[F3][GH-Pages-live]` `[mockup: docs/designs/backend-and-editorial-layer/23-editors-cut-cut-with-en-commentary.html § editors-cut-cut-with-en-commentary]` `[mockup: docs/designs/backend-and-editorial-layer/26-editors-cut-not-cut-no-box.html § editors-cut-not-cut-no-box]`

- [ ] **P1.2 [B7]** The commentary box on a cut article shows the `commentary_en` text when the EN language tab is active. `[F3][GH-Pages-live]` `[mockup: docs/designs/backend-and-editorial-layer/23-editors-cut-cut-with-en-commentary.html § editors-cut-cut-with-en-commentary]`

- [ ] **P1.3 [B7b]** Clicking the 中文 language tab on a page with cut articles swaps every `<aside class="editors-cut">` to show `commentary_zh` text (the `data-commentary-source` attribute changes from `commentary_en` to `commentary_zh`). `[F3][GH-Pages-live]` `[mockup: docs/designs/backend-and-editorial-layer/24-editors-cut-cut-with-zh-commentary.html § editors-cut-cut-with-zh-commentary]`

- [ ] **P1.4 [B7b]** On a budget-recovery day (only `commentary_en` present, `commentary_zh` absent): clicking 中文 shows the EN commentary text with an `(English only today)` fallback tag. The commentary box is never blank. `[F3][GH-Pages-live]` `[mockup: docs/designs/backend-and-editorial-layer/25-editors-cut-cut-zh-fallback-to-en.html § editors-cut-cut-zh-fallback-to-en]`

---

## P2 — GH-Pages-live: favourites star, `/favourites` page, language model (B1b, B2, B4)

- [ ] **P2.1 [B1b]** Load `docs/index.html` fresh with no `localStorage` data. The EN language tab is selected (no `lang` key written to localStorage on this load). `[F3][GH-Pages-live]`

- [ ] **P2.2 [B1b]** Click 中文 on the home page. Cards swap to `summary_zh` / commentary swaps to `commentary_zh`. Reload the page — site returns to EN. No localStorage `lang` key persists. `[F3][GH-Pages-live]`

- [ ] **P2.3 [B2]** Every article card has a ☆ star button (`data-testid="fav-star"`, `aria-pressed="false"`). `[F3][GH-Pages-live]` `[mockup: docs/designs/backend-and-editorial-layer/06-favourite-star-empty.html § favourite-star-empty]`

- [ ] **P2.4 [B2]** Click ☆ on any article card. The icon changes to ★ (`aria-pressed="true"`). Open DevTools → Application → localStorage — `favourites_v1` contains the article's `article_id`. No network request fires. `[F3][GH-Pages-live]` `[mockup: docs/designs/backend-and-editorial-layer/07-favourite-star-filled.html § favourite-star-filled]`

- [ ] **P2.5 [B2]** Click ★ on a saved article. Icon reverts to ☆ and the `article_id` is removed from `localStorage.favourites_v1`. `[F3][GH-Pages-live]`

- [ ] **P2.6 [B4 GH-Pages]** Open `docs/favourites/index.html` with no saves in localStorage. Page shows `data-testid="favourites-page"` and an empty-state message ("No favourites yet"). No sync-prompt is rendered (BACKEND_LIVE=false). `[G1][GH-Pages-live]` `[mockup: docs/designs/backend-and-editorial-layer/09-favourites-ghpages-empty-no-saves.html § favourites-ghpages-empty-no-saves]`

- [ ] **P2.7 [B4 GH-Pages]** Save 2 articles via ☆ stars. Open `docs/favourites/index.html`. Both saved articles appear as cards with ★ stars, newest-save-first order. No sync-prompt present. `[G1][GH-Pages-live]` `[mockup: docs/designs/backend-and-editorial-layer/10-favourites-ghpages-populated.html § favourites-ghpages-populated]`

---

## P3 — GH-Pages-live: CN translation pages, card link behaviour (B8, B9)

- [ ] **P3.1 [B8]** After render, `docs/articles/<slug>/index.html` exists for each entry in `summaries.translations[]`. `[H2][GH-Pages-live]`

- [ ] **P3.2 [B8]** Open a translation page (`docs/articles/<slug>/index.html`) in a browser. Page contains `data-testid="translation-article"`, the EN excerpt text (~3 paragraphs), and two "Read original (中文) →" CTAs (top and bottom). `[H1][GH-Pages-live]` `[mockup: docs/designs/backend-and-editorial-layer/29-article-translation-populated.html § article-translation-populated]`

- [ ] **P3.3 [B8]** View source of the translation page. `<head>` contains: `<link rel="canonical" href="<CN-source-URL>">`, `<link rel="alternate" hreflang="zh" href="<CN-source-URL>">`, `<link rel="alternate" hreflang="en" href="<our-URL>">`, a `<script type="application/ld+json">` block with `"@type":"NewsArticle"` and `"isBasedOn"` property. `[H1][GH-Pages-live]` `[B13]`

- [ ] **P3.4 [B8]** For a CN-source card on the home page with EN tab active: clicking the card title navigates to `/articles/<slug>/` (our domain). `[H2][GH-Pages-live]`

- [ ] **P3.5 [B9]** Switch to 中文 tab on the same card. Clicking the card title opens the original CN source URL. `[H2][GH-Pages-live]`

- [ ] **P3.6** For a slug where `excerpt_en` is null (budget recovery), `docs/articles/<slug>/index.html` exists but shows the placeholder state with `data-testid="translation-placeholder"` and "Translation pending" heading. `[H1][GH-Pages-live]` `[mockup: docs/designs/backend-and-editorial-layer/30-article-translation-pending-placeholder.html § article-translation-pending-placeholder]`

---

## P4 — GH-Pages-live: SEO bundle (B12, B13, B14, B15)

- [ ] **P4.1 [B12]** Open `docs/sitemap.xml`. Valid XML with `<urlset>`. Contains `<loc>` entries for `/`, `/digests/YYYY-MM-DD.html` (all digest dates), `/articles/<slug>/` (all translation slugs), `/favourites`, `/feed.xml`. `[I2][GH-Pages-live]`

- [ ] **P4.2 [B12]** `docs/robots.txt` contains `Sitemap: <absolute-URL-to-sitemap.xml>`. `[I2][GH-Pages-live]`

- [ ] **P4.3 [B14]** Open `docs/feed.xml`. Valid Atom 1.0 XML: `<feed xmlns="http://www.w3.org/2005/Atom">`, 1–30 `<entry>` elements, each with `<title>AI Daily Digest — YYYY-MM-DD</title>`, stable `<id>urn:ai-daily-digest:YYYY-MM-DD</id>`, and `<link rel="alternate" type="text/html" href="…/digests/YYYY-MM-DD.html">`. `[J1, J2][GH-Pages-live]`

- [ ] **P4.4 [B14]** `docs/feed.xml` does NOT contain any text from `editorial.overall_en` or `editorial.overall_zh` or `commentary_en`/`commentary_zh` fields. `[J1][GH-Pages-live]`

- [ ] **P4.5 [B14]** Feed entry count is ≤ 30. `[J1][GH-Pages-live]`

- [ ] **P4.6 [B15]** View source of `docs/index.html`. `<head>` contains exactly one `<link rel="alternate" type="application/atom+xml" title="AI Daily Digest" href="/feed.xml">`. `[I2][GH-Pages-live]`

- [ ] **P4.7 [B15]** View source of `docs/digests/index.html`. Contains the Atom autodiscovery `<link>` once. `[I2][GH-Pages-live]`

- [ ] **P4.8 [B15]** View source of `docs/articles/<slug>/index.html`. Contains the Atom autodiscovery `<link>` once. `[H1][GH-Pages-live]`

- [ ] **P4.9 [B15]** View source of `docs/favourites/index.html`. Contains the Atom autodiscovery `<link>` once. `[G1][GH-Pages-live]`

- [ ] **P4.10** View source of `docs/index.html`. `<head>` contains `og:title`, `og:description`, `og:type`, `og:image`, and `twitter:card="summary_large_image"`. `[I2][GH-Pages-live]`

- [ ] **P4.11** View source of `docs/digests/YYYY-MM-DD.html`. `<head>` contains `<script type="application/ld+json">` with `"@type":"ItemList"`. `[I2][GH-Pages-live]`

- [ ] **P4.12 [B13]** Translation page `<head>` has a `<link rel="alternate" type="application/atom+xml">` (Atom autodiscovery) AND canonical + hreflang links. No duplicate `<link rel="canonical">`. `[H1][GH-Pages-live]`

---

## P5 — Local-worker: backend API routes (B1, B3, B5, B6, B6b, B10, B11)

> All steps in this section require `wrangler dev` running locally (`npx wrangler dev`) and the local D1 database initialised via `npx wrangler d1 migrations apply ai-daily-digest-dev --local`.

- [ ] **P5.1 [B1]** POST to `http://localhost:8787/api/subscribe` with `{ "email": "test@example.com", "language": "en" }`. Response: 200 JSON. A row appears in the local D1 `subscribers` table with `email=test@example.com`, `verified_at=null`, `language=en`. A row appears in `magic_links` with `purpose=subscribe`. `[C1][local-worker]`

- [ ] **P5.1b [B1]** POST to `/api/subscribe` with `{ "email": "not-an-email" }`. Response: 400. `[C1][local-worker]` `[mockup: docs/designs/backend-and-editorial-layer/04-subscribe-form-error-invalid-email.html § subscribe-form-error-invalid-email]`

- [ ] **P5.2 [B1]** GET `/api/auth/verify?token=<valid-token-from-magic_links>`. Response: 302 redirect to `/account?welcome=1`. `Set-Cookie` header present (`session=…; HttpOnly; Secure; SameSite=Lax`). D1: `subscribers.verified_at` is now set; `magic_links.consumed_at` is set. `[C2][local-worker]`

- [ ] **P5.3 [B1]** Repeat the GET with the same (now consumed) token. Response: 400. `[C2][local-worker]`

- [ ] **P5.4 [B3]** GET `/api/auth/verify` (after subscribing, session cookie present) then GET `/api/favourites`. Response: 200 `{ "article_ids": [] }`. `[D1][local-worker]`

- [ ] **P5.5 [B3]** POST `/api/favourites` `{ "article_id": "aihot-a3f12b8c" }` with session cookie. Response: 201. GET `/api/favourites` returns `{ "article_ids": ["aihot-a3f12b8c"] }`. `[D1][local-worker]` `[mockup: docs/designs/backend-and-editorial-layer/08-favourite-star-syncing.html § favourite-star-syncing]`

- [ ] **P5.6 [B3]** POST `/api/favourites` same `article_id` again. Response: 200 (idempotent). Only one row in D1. `[D1][local-worker]`

- [ ] **P5.7 [B3]** DELETE `/api/favourites/aihot-a3f12b8c` with session cookie. Response: 200. GET `/api/favourites` returns `{ "article_ids": [] }`. `[D1][local-worker]`

- [ ] **P5.8 [B5]** POST `/api/sync-favourites` `{ "email": "test@example.com" }` (from a subscriber with saved articles). Response: 200. A magic_link row appears with `purpose=restore-favourites`. GET `/api/auth/verify?token=<that-token>` → 302 redirect to `/favourites?welcome=1`. `[C3][local-worker]` `[mockup: docs/designs/backend-and-editorial-layer/15-sync-favourites-link-sent-confirmation.html § sync-favourites-link-sent-confirmation]`

- [ ] **P5.9 [B6b]** PUT `/api/account/language` `{ "language": "zh" }` with session cookie. Response: 200. D1: `subscribers.language` is now `zh`. `[D2][local-worker]` `[mockup: docs/designs/backend-and-editorial-layer/19-account-language-saving.html § account-language-saving]` `[mockup: docs/designs/backend-and-editorial-layer/20-account-language-saved-toast.html § account-language-saved-toast]`

- [ ] **P5.10 [B10]** POST `/api/account/unsubscribe` with session cookie. Response: 200. D1: `subscribers.unsubscribed_at` is set. Favourites rows still present. `[D2][local-worker]` `[mockup: docs/designs/backend-and-editorial-layer/18-account-linked-unsubscribed.html § account-linked-unsubscribed]`

- [ ] **P5.11 [B11]** POST `/api/account/delete` with session cookie. Response: 200. D1: all `favourites` rows for that email gone, all `magic_links` rows gone, `subscribers` row gone. Session cookie cleared in response. `[D2][local-worker]` `[mockup: docs/designs/backend-and-editorial-layer/21-account-delete-confirm-modal-open.html § account-delete-confirm-modal-open]`

- [ ] **P5.12** POST `/api/account/unsubscribe` with no cookie. Response: 401. `[D2][local-worker]`

- [ ] **P5.13** POST `/api/webhooks/beehiiv` with a Beehiiv-signed unsubscribe payload for `test@example.com` (with valid HMAC in header). Response: 200. D1: `subscribers.unsubscribed_at` set. `[D3][local-worker]`

- [ ] **P5.14** POST `/api/webhooks/beehiiv` with an invalid/missing signature. Response: 401. `[D3][local-worker]`

---

## Feature-flag gate (non-negotiable before merge)

- [ ] **FLAG.1** Render with `BACKEND_LIVE=false` (default GH Pages build). `docs/index.html` does NOT contain `data-testid="subscribe-form"`. `[F3, L1][GH-Pages-live]` `[mockup: docs/designs/backend-and-editorial-layer/01-subscribe-form-idle.html § subscribe-form-idle]`

- [ ] **FLAG.2** Render with `BACKEND_LIVE=false`. `docs/favourites/index.html` does NOT contain `data-testid="sync-prompt"`. `[G1, L1][GH-Pages-live]` `[mockup: docs/designs/backend-and-editorial-layer/13-sync-favourites-prompt-collapsed.html § sync-favourites-prompt-collapsed]`

- [ ] **FLAG.3** `.github/workflows/*.yml` contains `BACKEND_LIVE=false` in the GH Pages deploy step env. `[L1][unit]`

- [ ] **FLAG.4** Render with `BACKEND_LIVE=true`. `docs/index.html` DOES contain `data-testid="subscribe-form"` and `docs/account/index.html` exists with `data-testid="account-page"`. `[F3, G2][local-worker]` `[mockup: docs/designs/backend-and-editorial-layer/17-account-linked-active.html § account-linked-active]`

---

## Email render (E1, E2)

- [ ] **EMAIL.1** Run `node scripts/post-to-beehiiv.mjs en` with `BEEHIIV_API_KEY` unset. Script exits 0 (no-op, no exception). `[E2][GH-Pages-live]`

- [ ] **EMAIL.2** Call `renderEmailEn(summaries, 'https://example.com')` with the editorial fixture. Returned HTML contains `data-testid="email-body"`, Editor's Cut overall EN narrative, cut article list with border-left styling, `{{ beehiiv_unsubscribe_url }}` placeholder. `[E1][unit]` `[mockup: docs/designs/backend-and-editorial-layer/27-email-en.html § email-en]`

- [ ] **EMAIL.3** Call `renderEmailZh(summaries, 'https://example.com')`. Returned HTML subject contains "AI 每日精选", body contains `editorial.overall_zh` text, Chinese cut article teases. `[E1][unit]` `[mockup: docs/designs/backend-and-editorial-layer/28-email-zh.html § email-zh]`

- [ ] **EMAIL.4** EN email HTML does NOT contain `editorial.overall_zh` text. ZH email HTML does NOT contain `editorial.overall_en` text. `[E1][unit]`
