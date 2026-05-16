# Backend, Identity, Editorial Layer, Translations & SEO

**Date:** 2026-05-17
**Filename:** `2026-05-17-backend-and-editorial-layer-spec.md`
**Status:** Reviewed — pipeline-mode auto-approved 2026-05-17 (Step 1 Phase 1)
**Depends on:** [`2026-05-16-card-refinements-spec.md`](2026-05-16-card-refinements-spec.md) (the card-refinements spec) — both can ship in parallel but the card-refinements spec merges first.
**Splits with:** the **cloudflare-migration-and-vendor-onboarding spec** (deferred, to be authored as `YYYY-MM-DD-cloudflare-migration-and-vendor-onboarding-spec.md`). This spec writes and tests all the code; that spec deploys it. See *Implementation phasing* below.
**Followed by:** the **monetisation spec** (drafted after this ships and we can see traffic).

---

## Implementation phasing

This work is split into two ship moments to reduce risk at the production flip:

**This spec (the backend-and-editorial-layer spec)** — code-complete state, live site still on GitHub Pages:
- All renderer / routine / audio / editorial / translation / SEO changes go live on GH Pages.
- Backend code (Cloudflare Worker, D1 schema, API routes, magic-link flow, account page, daily email render, Beehiiv POST step) is written in the repo and tested locally via `wrangler dev` + miniflare.
- The backend is **not deployed to a live Cloudflare account**. It runs locally only during this spec.
- The live GH Pages build feature-flags off any UI that depends on the backend (subscribe form, `/account` page, "Sync favourites" prompt). The user-visible site looks like today + the editorial/translation/SEO improvements + a localStorage-only `/favourites` page. No subscribe button is visible.
- No vendor accounts (Beehiiv, Resend) are created during this spec beyond what's needed for local testing — and that testing happens against personal dev accounts or stubs.

**The cloudflare-migration-and-vendor-onboarding spec** (deferred, separate file) — production deploy:
- Buy custom domain, register with Cloudflare DNS.
- Create production Cloudflare Pages project, Worker, D1 database. Apply schema migrations.
- Create production Beehiiv (Launch tier) and Resend accounts. Verify sending domains.
- Add API keys as GHA + Worker secrets.
- Flip the feature flag from `false` → `true` in the production build.
- Switch the GHA deploy target from GH Pages to Cloudflare Pages.
- Submit sitemap.xml / news-sitemap.xml to Google Search Console + Bing Webmaster Tools.

Until the cloudflare-migration-and-vendor-onboarding spec ships, the live site is on GitHub Pages with the feature flag off. This spec is verifiable end-to-end via local dev + the static parts on live GH Pages.

**Why this split:** the backend code is the hardest, riskiest, most reviewable part of the work. Writing and testing it carefully — without coupling it to vendor onboarding and DNS migration — means the cloudflare-migration spec becomes mostly mechanical (provision + flip a flag + point DNS). Same end state; smaller risk per ship.

---

## Motivation

Today the site is purely a static aggregator. To move it from "daily reader" toward "subscribable property with editorial voice," we need to grow:

1. **Identity surface** — so readers' favourites and email preferences persist across devices.
2. **Editorial layer** — Editor's Cut narrative in a daily email, plus per-article commentary on the site for the articles that make the cut.
3. **Translation surface** — Chinese-source articles get a real EN translation excerpt hosted on our domain, so EN readers don't bounce out to a CN page they can't read.
4. **SEO** — the discoverable, share-friendly surface that a real subscription product needs.
5. **A different stack** — the static-only GitHub Pages model can't host any of the above. We migrate to Cloudflare's free tier (Pages + Workers + D1) plus Beehiiv (newsletter) and Resend (transactional email).

The architectural choice is constrained by two principles:

- **Free at our current scale, paid only when monetisation justifies it.** Total ongoing cost stays $0 until ~2,500 newsletter subscribers, at which point Beehiiv Scale ($43/mo flat to 100k subs) becomes the only line item.
- **No vendor lock-in that blocks monetisation.** Vercel hobby tier (prohibits commercial use) is explicitly excluded. Cloudflare and Beehiiv free tiers have no such restriction.

---

## Decisions

### D1 — Identity model: subscription-email-as-recovery

A visitor never sees "create an account." The only sign-up flow is email subscription. The same email silently doubles as the recovery key for favourites: on a new device, the user clicks **"Sync my saved articles"** on the `/favourites` page → enters their email → magic link arrives → clicking it pulls their favourites onto that browser.

Server data model: one `subscribers` row per email, optionally linked to `favourites` rows. There is no separate "user" entity. The `subscribers.language` column (`'en'` or `'zh'`) is the **only** place a language preference is persistently stored — anonymous users have no per-user language state at all (see D1b).

### D1b — Language model: anonymous defaults to EN, subscribers persist their choice

The language switch (EN / 中文) behaves differently for the two audiences:

- **Anonymous (non-subscriber) visitors:**
  - The site **always** loads in EN on first paint. No localStorage persistence.
  - The language toggle is visible in the header and works for the current session — clicking 中文 swaps card text, audio track, and per-article commentary on the current page.
  - The next page load (new tab, refresh, return visit) resets to EN.
  - This is the *only* spec-level place where the card-refinements spec's localStorage `lang` key is overridden — the key is no longer written by the renderer's frontend JS for anonymous users.

- **Subscribers (logged-in via session cookie):**
  - Their stored `language` preference is read from D1 via the API at page load and applied as the active language tab.
  - Switching the tab while logged in fires `PUT /api/account/language` to persist the new preference.
  - The pref carries over to: site rendering, audio track default, and the daily subscriber email (see D4).

Rationale: anonymous EN default removes a localStorage write that creates a soft "shadow account," reducing privacy surface for non-subscribers and giving the language preference a single canonical home (the `subscribers` table). It also makes EN the unambiguous "front door" experience.

### D2 — Stack lock-in

The architecture splits along two principles: **GitHub Actions is the build tool, Cloudflare is the runtime.** GHA produces daily artefacts (fetched data, rendered HTML, MP3s, JSON); Cloudflare hosts the result, runs the dynamic API surface, and stores subscriber data. This is a hybrid by deliberate choice — Cloudflare Workers can't run Python, ffmpeg, or long-form shell scripts, so the daily build (which needs all three for `edge-tts` audio + multi-source HTTP fetches + Jina-Reader passes) stays where it already works.

**Phasing note:** during this spec the live deploy target stays on **GitHub Pages** (unchanged from today). All the Cloudflare-side code (Worker, D1, Pages config) is written in the repo and tested via local `wrangler dev` + miniflare, but no production Cloudflare account exists yet. The vendor rows below describe the **end state** after the cloudflare-migration spec ships, not this spec's day-one infrastructure.

| Layer | Vendor | Why |
|---|---|---|
| Daily build runner (fetch + audio + Beehiiv send trigger) | **GitHub Actions** | Free 2,000 min/mo; Linux runner with Python + Node + ffmpeg; cron primitive; already wired |
| Static site hosting | **Cloudflare Pages** | Free, unlimited bandwidth, commercial-use OK, co-locates with API; auto-deploys on git push |
| API runtime (`/api/*`) | **Cloudflare Workers** | 100k req/day free; lives in the same project as Pages |
| Database (subscribers, favourites, magic-links) | **Cloudflare D1** (SQLite at edge) | 5 GB / 5M reads / 100k writes daily free; no idle-pause |
| Source-of-truth git repo | **GitHub** | Unchanged — GHA runs from this; Cloudflare Pages pulls from this |
| Newsletter delivery | **Beehiiv (Launch tier)** | Free to 2,500 subscribers, unlimited send volume, custom domain, 0% take rate on paid subs at Scale tier ($43/mo flat to 100k subs) |
| Transactional email (magic-link) | **Resend (free tier)** | 3k/mo, 100/day — orders of magnitude more than magic-link volume ever needs |
| Custom domain | **TBD by user** (e.g. aidailydigest.com) | $10–15/yr; DNS hosted on Cloudflare for one-click setup |

**Division of labour at a glance:**

- **GHA does the work that needs Python / ffmpeg / shell:** daily cron, source fetching, Jina-Reader bodies, `generate-audio.py`, committing data files, POSTing to Beehiiv's Post API.
- **Cloudflare Pages does CDN-style hosting:** auto-deploys whatever GHA pushes to `main`, serves it from edge nodes.
- **Cloudflare Workers does anything dynamic:** `/api/subscribe`, `/api/favourites`, `/api/auth/verify`, etc. Never invoked from the daily build — only from user requests.
- **Cloudflare D1 stores per-user state:** subscribers, favourites, magic-link tokens.

The current `github.io` URL is preserved as a 301 redirect to the new domain so existing bookmarks and the Atom feed (introduced in this spec, D11 below) keep working.

### D3 — Editor's Cut: one editorial pass, two outputs, different surfaces

The daily Claude routine is extended to produce, in a single pass:

- **Overall Editor's Cut narrative** — 200–300 words, **bilingual (EN + 中文)**, **email-only**. Two native versions written by the routine in the same pass, not machine-translated. The narrative serves the subscriber email body and never appears on the website.
- **Per-article commentary** — 30–50 words each, **bilingual (EN + 中文)** for the 8–15 articles that make the cut. This is a website feature, embedded directly on each cut article's card.

Two outputs, two distinct surfaces:

- **The daily subscriber email** — Editor's Cut overall narrative as the lead, followed by a curated list of the cut articles with one-line teases linking back to the site. The narrative does NOT appear on the website. The email is sent in the recipient's stored language (see D4).
- **The website** — cut articles get an inline 🏅 commentary box (replacing the space where the card-refinements spec deleted "Read original" and "Translate EN"). The commentary text follows the active language tab — EN tab shows `commentary_en`, 中文 tab shows `commentary_zh`. Non-cut cards are unchanged.

### D4 — Daily email pipeline (bilingual, segmented send)

The GHA fast-path workflow gains a new step that produces **two** scheduled Beehiiv posts each day — one in English, one in Chinese — using Beehiiv's audience segmentation. Each subscriber receives exactly one of them based on their `language` field.

Concretely:

1. GHA renders two HTML email bodies from the routine output:
   - `email_en.html` — uses `editorial.overall_en` + `commentary_en` from the cut article list + an EN-language site link
   - `email_zh.html` — uses `editorial.overall_zh` + `commentary_zh` + a 中文-language site link
2. GHA POSTs both to Beehiiv's Post API as two separate scheduled posts, each targeting a Beehiiv segment based on a custom subscriber field `language=en` vs `language=zh`.
3. Both are scheduled for 07:00 Sydney (21:00 UTC), 30 min after the routine commit.
4. Beehiiv delivers each post to its targeted segment, handles unsubscribes and bounces, and reports stats back via webhook.

GHA, not Cloudflare, is the right place for these calls — the email bodies are rendered from the same JSON data that the renderer uses, and we already have the build environment + secrets there.

**Beehiiv segmentation setup:** subscribers in Beehiiv carry a custom field `language` (`en` or `zh`), populated at subscribe-time by our `/api/subscribe` Worker via Beehiiv's Subscribe API. Two static segments are defined in the Beehiiv UI once: `lang_en` and `lang_zh`. Each scheduled post targets one segment.

**Per-recipient personalisation is NOT used.** Both segment-emails are static HTML — every EN subscriber gets the identical EN email, every CN subscriber gets the identical CN email. This keeps us inside Beehiiv Launch (free) tier capabilities (the Send API for true 1:1 mail-merge is Enterprise-only).

Beehiiv Launch (free) tier supports the Post API + audience segments per the public docs, but this remains an open risk — see *Risks & open questions* for the verification spike that needs to happen before implementation commits.

### D5 — Favourites

- **Icon:** ★ (filled when saved) / ☆ (empty). Sits in the top-right corner of every article card.
- **Anonymous storage:** localStorage, keyed by canonical `article_id` (URL hash).
- **Linked storage:** the same `article_id`s stored server-side in D1's `favourites` table, keyed by `subscribers.email`.
- **Surface:** dedicated `/favourites` page. No "show favourites only" toggle on the main feed.
- **Sync prompt:** lives only on the `/favourites` page header for anonymous users with at least one saved article. No main-feed banner, no toasts, no popups. The page header shows an inline email form: "Save these across devices →".

### D6 — Internal CN-translated articles (item 8)

For each CN-source article (currently AIHOT and any r/LocalLLaMA CN cross-posts), the routine **always** produces a **~3-paragraph EN translation excerpt** of the article body. The excerpt is hosted at `/articles/<slug>/` on our domain. EN→CN translation is explicitly out of scope.

This is a mandatory output, not budget-conditional. If the routine cannot produce excerpts for *all* in-scope CN articles in a single run, it must complete as many as possible from highest-signal first (matching the Editor's Cut selection where overlap exists) and emit empty placeholders for the rest — never silently skip without a placeholder.

Card behaviour:
- **EN language tab selected:** the card title links to **our** `/articles/<slug>/` page.
- **中文 language tab selected:** the card title links to the **original CN source** (current behaviour).

The `/articles/<slug>/` page contains:
- Excerpt translation (first ~3 paragraphs)
- Prominent **"Read original (中文) →"** link to the source as the primary CTA
- Attribution: source name, original publish date
- `<link rel="canonical" href="<original-CN-url>">` in head (tells Google the source is canonical — protects against duplicate-content penalty and weakens our ranking against the original, which is the legally safer posture)
- `<link rel="alternate" hreflang="zh" href="<original-CN-url>">` and `<link rel="alternate" hreflang="en" href="<our-page>">`

Slug shape: `<source-prefix>-<title-kebab>-<8-char-hash>` (e.g. `aihot-claude-4-7-launch-a3f12b8c`). Stable across rebuilds.

### D7 — SEO bundle

| Component | Scope | Output |
|---|---|---|
| `sitemap.xml` | All pages | `/`, `/digests/YYYY-MM-DD.html`, `/articles/<slug>/`, `/favourites`, `/account`, `/feed.xml` |
| `robots.txt` | Root | Allow all crawlers; reference sitemap |
| JSON-LD `ItemList` | Daily digest pages | Lists the articles on that day |
| JSON-LD `NewsArticle` | Per-article `/articles/<slug>/` pages | Schema with author, datePublished, headline, articleBody, mainEntityOfPage, isBasedOn |
| OpenGraph + Twitter Cards | Every page | `og:title`, `og:description`, `og:type`, `og:image` (placeholder until logo TODO), `twitter:card="summary_large_image"` |
| Canonical URL | Every page | `<link rel="canonical">` to the page's own URL (or to the CN source for translation pages — see D6) |
| `hreflang` | Translation pages | Cross-link EN translation ↔ CN original |
| Google News sitemap | Submit `/articles/` subset | News-namespace sitemap at `/news-sitemap.xml`, submit via Google Search Console |

### D8 — Unsubscribe & data deletion

Two distinct flows, both reachable from the `/account` page and from every email footer:

| Flow | Effect | Backend |
|---|---|---|
| **Unsubscribe from emails** | Stop newsletter. Keep favourites + recovery key. | Set `subscribers.unsubscribed_at`. Webhook to Beehiiv to remove from sending list. |
| **Delete my data** | Full GDPR-grade wipe. | Delete from Beehiiv list. Delete all `favourites` rows. Delete all `magic_links` rows. Delete `subscribers` row. |

Every Beehiiv-sent email automatically includes Beehiiv's standard unsubscribe link (one-click CAN-SPAM compliance). Our `/account` page exists for the deeper "delete my data" flow and for direct list management.

### D9 — OG image strategy: deferred

The OG image surface needs a real logo first. Until the logo + branding work lands, every page emits `og:image="<placeholder-or-fixed-logo.png>"` so social shares don't appear broken. A TODO is recorded for: (a) author site logo / brand mark, (b) revisit OG image strategy (fixed vs per-digest vs per-article).

### D10 — Feature flag isolates backend-dependent UI from the live build

The renderer reads an environment variable `BACKEND_LIVE` (or equivalent config flag) and conditionally emits backend-dependent UI:

- `BACKEND_LIVE=false` (GH Pages build, the state at the end of this spec) — subscribe form, `/account` page, "Sync favourites" prompt on `/favourites`, and any other backend-coupled affordance are omitted from the rendered HTML. `/favourites` still works using localStorage only.
- `BACKEND_LIVE=true` (Cloudflare Pages build, the state after the cloudflare-migration spec ships) — the same code paths render every backend-dependent affordance.

The flag is set per-build in the GHA workflow: `BACKEND_LIVE=false` for the current GH Pages deploy step, `BACKEND_LIVE=true` once the cloudflare-migration spec ships and the deploy target moves to Cloudflare Pages.

The flag is **build-time**, not runtime. The shipped HTML never contains a hidden subscribe button waiting to be activated by JS — when the flag is off, the markup simply doesn't include those elements. This eliminates the "half-working button" risk.

### D11 — Single Atom 1.0 syndication feed at `/feed.xml`

The renderer emits one Atom 1.0 feed at `docs/feed.xml`, one entry per daily digest, linking to that day's archive page (`/digests/YYYY-MM-DD.html`). This is the only syndication surface the project ships; it co-locates with the rest of the SEO/discovery bundle (sitemap.xml, JSON-LD, OG/Twitter Cards, canonical URLs) introduced in D7.

**Why not dual Atom + RSS?** Modern readers consume both equally; Google News and Bing News no longer prefer RSS for ingestion (they crawl HTML + sitemap.xml). One feed is enough.

**Why Atom over RSS?** Cleaner spec, better date semantics, proper `<summary>` vs `<content>` distinction, supports multiple authors correctly. RSS 2.0 offers nothing functionally that Atom does not.

**Why daily-digest granularity, not per-article?** This spec introduces `/articles/<slug>/` permalink pages (D6) — those could in principle become individual feed entries. We deliberately keep the feed at daily-digest granularity because it matches the editorial cadence the email pipeline uses (D4) and avoids flooding readers' inboxes with 20–80 entries per day. Subscribers who want per-article granularity can use the daily email, which is the project's intended high-touch surface.

**Editor's Cut content is feed-excluded.** Per D3, the Editor's Cut narrative (`editorial.overall_en` / `editorial.overall_zh`) and per-article commentary (`editorial.cuts[*].commentary_en` / `commentary_zh`) never appear in the Atom feed — the feed entry summary is the same generic count-line ("Today's digest: N items across M sources.") whether or not the routine ran an editorial pass that day. The editorial layer is email-only and on-site only; it does not leak into syndication.

**Feed entry shape:**

- `<title>` — "AI Daily Digest — YYYY-MM-DD"
- `<id>` — stable URN `urn:ai-daily-digest:YYYY-MM-DD`
- `<link rel="alternate" type="text/html" href="…/digests/YYYY-MM-DD.html">`
- `<updated>` — that digest's publish timestamp
- `<summary>` — short EN one-liner ("Today's digest: N items across M sources.")
- `<author>` — name "AI Daily Digest", uri = site root

**Cap:** newest 30 daily digests in the feed (~one month of history; older days remain reachable via `/digests/index.html`).

**Autodiscovery:** every HTML page (main, archive index, per-day archive, per-article translation page) gets exactly one `<link rel="alternate" type="application/atom+xml" title="AI Daily Digest" href="/feed.xml">` in `<head>`.

**Atom XML shape (reference):**

```xml
<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>AI Daily Digest</title>
  <id>urn:ai-daily-digest:feed</id>
  <link rel="self" href="https://<domain>/feed.xml"/>
  <link rel="alternate" type="text/html" href="https://<domain>/"/>
  <updated>2026-05-16T20:30:00Z</updated>
  <author><name>AI Daily Digest</name><uri>https://<domain>/</uri></author>
  <entry>
    <title>AI Daily Digest — 2026-05-16</title>
    <id>urn:ai-daily-digest:2026-05-16</id>
    <link rel="alternate" type="text/html"
          href="https://<domain>/digests/2026-05-16.html"/>
    <updated>2026-05-16T20:30:00Z</updated>
    <summary>Today's digest: 87 items across 10 sources.</summary>
  </entry>
  <!-- … up to 30 entries … -->
</feed>
```

The feed is unaffected by the `BACKEND_LIVE` flag — it's a static artefact produced by every build, regardless of which deploy target is active.

---

## Data model

```sql
CREATE TABLE subscribers (
  email TEXT PRIMARY KEY,
  verified_at TEXT,                              -- ISO timestamp, NULL until magic-link confirmed
  created_at TEXT DEFAULT (datetime('now')),
  language TEXT DEFAULT 'en',                    -- 'en' or 'zh'
  unsubscribed_at TEXT,                          -- ISO timestamp; non-null = no longer receiving emails
  beehiiv_subscriber_id TEXT                     -- set after Beehiiv sync
);

CREATE TABLE favourites (
  email TEXT NOT NULL REFERENCES subscribers(email) ON DELETE CASCADE,
  article_id TEXT NOT NULL,                      -- canonical ID = source-prefix + URL hash
  faved_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (email, article_id)
);

CREATE TABLE magic_links (
  token TEXT PRIMARY KEY,                        -- random 32-byte hex
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,                         -- 'subscribe' | 'restore-favourites' | 'manage-account'
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX idx_favourites_email ON favourites(email);
CREATE INDEX idx_magic_links_email ON magic_links(email, purpose);
CREATE INDEX idx_magic_links_expires ON magic_links(expires_at);
```

`article_id` shape: `<source-prefix>-<8-char-url-hash>` (e.g. `aihot-a3f12b8c`, `simon-7c3e9d1a`). Computed identically on the client (when storing in localStorage) and the server (when persisting from API call). Stable across re-runs of the renderer.

---

## API surface (Cloudflare Worker)

All routes mounted at `https://<custom-domain>/api/`. CORS allows the site's own origin only.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/subscribe` | Body: `{ email, language }`. Sends magic-link via Resend. | None |
| `POST` | `/api/sync-favourites` | Body: `{ email, article_ids: [...] }`. Sends magic-link via Resend with `purpose=restore-favourites`. | None |
| `GET` | `/api/auth/verify?token=...` | Consume magic-link; sets HttpOnly cookie `session=<email-signed>`. Redirects per `purpose`. | Magic-link token |
| `GET` | `/api/favourites` | Returns `{ article_ids: [...] }` for the logged-in email. | Session cookie |
| `POST` | `/api/favourites` | Body: `{ article_id }`. Adds to user's favourites. | Session cookie |
| `DELETE` | `/api/favourites/<article_id>` | Removes from user's favourites. | Session cookie |
| `POST` | `/api/account/unsubscribe` | Stops newsletter, keeps favourites. | Session cookie |
| `POST` | `/api/account/delete` | Full data deletion (GDPR). | Session cookie |
| `PUT` | `/api/account/language` | Body: `{ language: "en" \| "zh" }`. Updates `subscribers.language` and syncs the new value to Beehiiv (moves the subscriber between `lang_en` / `lang_zh` segments). | Session cookie |
| `POST` | `/api/webhooks/beehiiv` | Webhook from Beehiiv for unsubscribe events. | Beehiiv-signed |

Session cookie: HMAC-signed `email|expires_at`, 30-day expiry, HttpOnly, Secure, SameSite=Lax.

---

## User-visible behaviours (testable contracts)

Each behaviour is tagged for the ship moment it becomes user-visible:

- **[GH-Pages-live]** = visible on the live site at the end of this spec (still on GitHub Pages, `BACKEND_LIVE=false`).
- **[Cloudflare-live]** = visible on the live site only after the cloudflare-migration spec flips the feature flag and migrates to Cloudflare.

Both are testable in this spec — `GH-Pages-live` against the live GH Pages build, `Cloudflare-live` against `wrangler dev` + miniflare locally.

### B1 — Subscribe via email [Cloudflare-live]

- **Entry point:** any page; subscribe form in header or footer.
- **User action:** enters email, clicks Subscribe.
- **Expected result:** within 60s, a magic-link email arrives from Resend ("Confirm your subscription to AI Daily Digest"). Clicking the link → lands on `/account?welcome=1` → status shows "Subscribed to daily digest." Cookie set; subsequent page loads show the linked-account state. The subscriber's `language` is set to the language tab active at subscribe-time (EN by default since anonymous always loads in EN — but if they switched to 中文 in the same session before subscribing, that switch is captured as their stored preference). Beehiiv subscriber created with custom field `language={en|zh}` aligned to the same value.

### B1b — Anonymous user sees EN-only on first paint, can toggle for the session [GH-Pages-live]

- **Entry point:** any page, fresh visit, no session cookie.
- **User action:** loads the page.
- **Expected result:** site renders in EN. The language tab shows EN as selected. The user can click 中文 to switch the current session (cards re-render with `summary_zh`, commentary swaps to `commentary_zh`, audio track swaps to ZH). No localStorage write occurs. On the next visit, the site is back in EN.

### B1c — Subscriber language preference auto-applies on login [Cloudflare-live]

- **Entry point:** logged-in user on any page (session cookie present).
- **User action:** loads the page.
- **Expected result:** before first paint, the renderer's frontend JS reads `subscribers.language` via `GET /api/account` (or from a cookie-embedded claim) and selects that language tab. If the user toggles the tab, the new value is persisted via `PUT /api/account/language` and synced to Beehiiv to move the subscriber between segments.

### B2 — Save an article (anonymous) [GH-Pages-live]

- **Entry point:** any article card on the home page, any digest page, or any `/articles/<slug>/` page.
- **User action:** clicks the ☆ star icon.
- **Expected result:** icon fills to ★. The `article_id` is added to `localStorage.favourites_v1` (a JSON array). No server request. No toast. No banner.

### B3 — Save an article (linked, server-synced) [Cloudflare-live]

- **Entry point:** any card, while logged in (session cookie present).
- **User action:** clicks ☆.
- **Expected result:** icon fills to ★. A `POST /api/favourites` request fires in the background; the `article_id` is added to `localStorage.favourites_v1` AND inserted into the `favourites` table for that email. If the POST fails, the localStorage write still succeeds and a retry queue persists the change until next online.

### B4 — View saved articles [GH-Pages-live with caveats, full version Cloudflare-live]

- **Entry point:** click "★ Favourites" in the header, OR navigate to `/favourites`.
- **User action:** loads the page.
- **Expected result:** shows every card the user has saved, in saved-at-DESC order. Each card has a ★ icon (filled); clicking unsaves.
- **GH Pages build (BACKEND_LIVE=false):** all favourites come from localStorage. No "Save these across devices" prompt is rendered (feature-flagged off). Page works as a pure localStorage viewer.
- **Cloudflare Pages build (BACKEND_LIVE=true):** as above, plus — for anonymous users with ≥1 save — the page header shows: "Save these across devices →" with an email input form.

### B5 — Sync favourites to a new device (recovery flow) [Cloudflare-live]

- **Entry point:** new device with localStorage empty; navigate to `/favourites`.
- **User action:** clicks "Sync my saved articles" → enters email → clicks "Send link."
- **Expected result:** within 60s, magic-link email arrives. Clicking the link → `/favourites?welcome=1`. The page now shows the user's previously-saved articles pulled from the server. localStorage is populated to match. Cookie set.

### B6 — Daily subscriber email lands in the recipient's stored language [Cloudflare-live]

- **Entry point:** subscriber's inbox.
- **User action:** at 07:00 Sydney, receives an email.
- **Expected result:** sender = "AI Daily Digest <noreply@<domain>>" via Beehiiv. The version received depends on `subscribers.language`:
  - **EN subscribers** receive `email_en.html`: subject "AI Daily Digest — <date>", body leads with the EN Editor's Cut narrative (`editorial.overall_en`), followed by the 8-15 cut articles with EN one-line teases.
  - **中文 subscribers** receive `email_zh.html`: subject "AI 每日精选 — <date>", body leads with the CN Editor's Cut narrative (`editorial.overall_zh`), followed by the cut articles with CN one-line teases.

  Every subscriber receives exactly one of the two — Beehiiv's audience segments (`lang_en` / `lang_zh`) handle the routing. The Editor's Cut narrative (either language) never appears outside the email (not on the site, not in the Atom feed). Footer has a Beehiiv-standard unsubscribe link in the subscriber's language. Mobile-rendered HTML is legible in both languages.

### B6b — Subscriber language preference can be changed via /account [Cloudflare-live]

- **Entry point:** logged-in user on `/account`.
- **User action:** switches the language preference from EN to 中文 (or vice-versa) and saves.
- **Expected result:** `PUT /api/account/language` fires; `subscribers.language` is updated; the Beehiiv subscriber is moved from the current segment to the new one (so tomorrow's email arrives in the new language). The current site session immediately re-renders in the new language. A confirmation toast appears.

### B7 — Editor's Cut per-article commentary on site cards (bilingual) [GH-Pages-live]

- **Entry point:** home page or daily digest page, with EN language tab selected.
- **User action:** visual scan.
- **Expected result:** cards that made the cut show a small 🏅 box beneath the card body labelled "Editor's Cut" with the 30-50 word EN commentary in italics. Cards that didn't make the cut are unchanged.

### B7b — Editor's Cut commentary respects language tab [GH-Pages-live]

- **Entry point:** same daily digest page, with 中文 tab selected.
- **User action:** switches the language tab to 中文.
- **Expected result:** every 🏅 commentary box swaps to its `commentary_zh` text in the same position. Both languages have their commentary text generated by the routine in the same pass — no machine-translation step, no "translation pending" placeholder. If a budget-recovery day produced only `commentary_en`, the 中文 tab shows the EN commentary with a small "(English only today)" tag — never a blank box.

### B8 — CN article → EN translation page (item 8) [GH-Pages-live]

- **Entry point:** any AIHOT card on the home page, with EN language tab selected.
- **User action:** clicks the card title.
- **Expected result:** lands on `/articles/<slug>/` on our domain. Page shows: title (EN), excerpt translation (~3 paragraphs), prominent "Read original (中文) →" link, attribution to source, publish date. the card-refinements spec's title-link behaviour for CN sources is overridden in EN mode for AIHOT + similar CN sources.

### B9 — Same card with 中文 tab selected [GH-Pages-live]

- **Entry point:** same card, 中文 tab selected.
- **User action:** clicks card title.
- **Expected result:** new tab opens at the original CN source URL (unchanged from the card-refinements spec behaviour).

### B10 — Unsubscribe from emails (keep favourites) [Cloudflare-live]

- **Entry point:** any daily email, click footer "Unsubscribe."
- **User action:** clicks unsubscribe.
- **Expected result:** Beehiiv flow runs (one-click); a webhook to our Worker sets `subscribers.unsubscribed_at`. The next time the user visits the site and is logged in, the `/account` page shows "Newsletter: unsubscribed (re-subscribe →)." Favourites are intact.

### B11 — Delete account / data [Cloudflare-live]

- **Entry point:** `/account` page, logged in.
- **User action:** clicks "Delete my data" → confirms in modal.
- **Expected result:** within 5s: Beehiiv list entry removed, all `favourites` rows for that email deleted, all `magic_links` rows for that email deleted, `subscribers` row deleted, session cookie cleared. User is redirected to `/?deleted=1` with a confirmation banner. Subsequent magic-link attempts to that email get a fresh subscriber row (no historical state).

### B12 — Search engines discover the site [GH-Pages-live]

- **Entry point:** `https://<domain>/sitemap.xml`.
- **User action:** request the URL.
- **Expected result:** valid XML sitemap listing every page on the site. Cross-referenced from `<link rel="sitemap">` in HTML heads and from `Sitemap:` directive in `/robots.txt`.

### B13 — Translation pages are recognised by Google as multilingual [GH-Pages-live]

- **Entry point:** any `/articles/<slug>/` page.
- **User action:** view source.
- **Expected result:** `<head>` contains:
  - `<link rel="canonical" href="<CN-source-URL>">`
  - `<link rel="alternate" hreflang="zh" href="<CN-source-URL>">`
  - `<link rel="alternate" hreflang="en" href="<our-URL>">`
  - `<script type="application/ld+json">` block with `NewsArticle` schema + `isBasedOn` pointing to the source

### B14 — Atom feed is reachable and valid [GH-Pages-live]

- **Entry point:** `https://<domain>/feed.xml`.
- **User action:** opens URL.
- **Expected result:** valid Atom 1.0 XML (passes `validator.w3.org/feed/`). Contains 1–30 `<entry>` elements, one per daily digest, newest first. Each entry's `<link rel="alternate">` points to the corresponding `/digests/YYYY-MM-DD.html` page. No Editor's Cut content (overall narrative or per-article commentary) appears in the feed.

### B15 — Feed autodiscovery from any HTML page [GH-Pages-live]

- **Entry point:** any HTML page on the site (`/`, `/digests/YYYY-MM-DD.html`, `/digests/index.html`, `/articles/<slug>/`, `/favourites`, `/account`).
- **User action:** view source.
- **Expected result:** `<head>` contains exactly one `<link rel="alternate" type="application/atom+xml" title="AI Daily Digest" href="/feed.xml">`.

---

## UI surfaces requiring per-state declarations (Phase 2 mockup work)

The behaviours above describe entry + action + expected-result contracts at the **functional** level. The following UI surfaces have multiple discrete visual states that will require `## State: <slug>` declarations (or `## Mockup: <basename>` blocks with nested `### State:` headings) when mockups are authored in Phase 2. They are listed here so `/mockup-parity --write` (Step 4) knows the inventory:

| Surface | Behaviour | States to mockup |
|---|---|---|
| Subscribe form | B1 | `idle` / `submitting` / `link-sent` / `error-invalid-email` / `error-network` |
| Favourite star icon | B2, B3 | `empty` (☆) / `filled` (★) / `syncing` (background POST in flight) |
| `/favourites` page (anonymous, GH-Pages) | B4 | `empty-no-saves` / `populated` |
| `/favourites` page (Cloudflare-live) | B4 | `anonymous-with-sync-prompt` / `linked-and-populated` |
| Sync-favourites flow on `/favourites` | B5 | `prompt-collapsed` / `prompt-open-email-input` / `link-sent-confirmation` / `error` |
| `/account` page | B1, B6b, B10, B11 | `linked-active` / `linked-unsubscribed` / `language-saving` / `language-saved-toast` / `delete-confirm-modal-open` / `delete-confirm-modal-closed` |
| Editor's Cut commentary box on cards | B7, B7b | `cut-with-en-commentary` / `cut-with-zh-commentary` / `cut-zh-fallback-to-en` / `not-cut-no-box` |
| Daily email body | B6 | `email-en` / `email-zh` (each is a single static template — two mockups, not multiple per-state) |
| `/articles/<slug>/` translation page | B8 | `populated` / `translation-pending-placeholder` (per D6 fallback) |

These are not authored as `## State:` headings in this spec because no mockups exist yet — Phase 2 produces the mockups and `/mockup-parity --write` then derives the state declarations from them per project convention. If Phase 2 is skipped for a given surface, the implementing plan task must author the state declarations inline before implementation begins.

---

## Routine prompt extension

The existing routine prompt (per `2026-05-14-claude-summary-engine-spec.md`) is extended with three new output sections, all produced in one pass:

1. **`editorial.overall_en`** + **`editorial.overall_zh`** — each 200–300 words, written natively (not machine-translated). The day's narrative: what these stories add up to. Not an article-by-article recap. Voice: knowledgeable but human, no hype. Both versions are email-only — never rendered to the website. The two narratives may differ subtly in framing where audience expectations diverge between English and Chinese readers, but cover the same source material.
2. **`editorial.cuts`** — array of `{ article_id, commentary_en, commentary_zh }`. The 8–15 articles that made the cut, each with a 30–50-word *why this matters* note in **both** English and Chinese (no machine-translation step — the routine writes both natively in the same pass). Selection criteria (in the prompt): preference for genuine signal (model releases, real research, unusual deals) over noise (rumours, opinion pieces, hardware unboxings). The commentary serves the daily digest page, where it switches with the language tab.
3. **`translations`** — for each CN-source article that has a body in `article-bodies.json`: `{ article_id, slug, excerpt_en, paragraphs: N }` where `excerpt_en` is the first 3 paragraphs translated, names verbatim (no romanisation of Chinese terms unless that's how they're written in English elsewhere). Mandatory — see D6.

Token-budget guard: the routine's existing decide-and-summarise pass is roughly 30,000 tokens output. Adding translations at ~150-300 words × ~10 CN articles ≈ ~3,000-6,000 tokens. Bilingual Editor's Cut overall (EN + ZH × ~200-300 words) ≈ ~1,000-1,500 tokens. Bilingual cut commentary (8-15 × ~60-100 words EN+ZH combined) ≈ ~1,500-2,500 tokens. Total addition: ~5,500-10,000 tokens. Within a Pro Max routine run but tighter than the original spec.

If the routine's daily run runs out of budget mid-output, drop in this order:
1. `editorial.cuts[*].commentary_zh` — fall back to showing `commentary_en` on the 中文 tab for that day (clearly marked).
2. `editorial.overall_zh` — fall back to sending the English-language email to 中文-segment subscribers for that day, with a small prefix note ("Today's edition in English while we recover translation capacity").
3. `editorial.overall_en` and `editorial.cuts[*].commentary_en` are never dropped — they are the day's editorial signal for the dominant audience.

`translations[*].excerpt_en` is also never dropped (it's the mandatory D6 output) — but if there are too many CN articles to translate in one run, the routine omits the lowest-signal ones and the renderer emits a "Translation pending — read CN original →" placeholder page for those slugs so the site still has the per-article URL.

---

## Workflow changes

### Existing pipeline (today)

- GHA cron at 20:30 UTC: fetch sources → render → deploy to GH Pages → POST routine fire endpoint.
- Routine writes `data/claude-summaries.json` to `main`.
- GHA fast-path on summaries commit: re-render → regen audio → redeploy.

### Pipeline at the end of this spec (live on GH Pages)

The two-mode GHA workflow (full + fast) stays. What changes:

1. **The deploy target.** GH Pages → Cloudflare Pages. The deploy step in the workflow becomes a `wrangler pages deploy` call (or, simpler: just `git push`, and CF Pages auto-deploys on every push to `main`). The `actions/deploy-pages@v4` step is removed.
2. **Routine output is extended** (see *Routine prompt extension* above) — same `data/claude-summaries.json` file path, larger schema with `editorial.*` and `translations[]`.
3. **Renderer extensions** (in `scripts/render-site.mjs`):
   - Produces `/articles/<slug>/` pages for each CN-translated article
   - Produces `sitemap.xml`, `news-sitemap.xml`, `robots.txt`
   - Embeds JSON-LD (`NewsArticle` on per-article pages, `ItemList` on digest pages)
   - Emits `og:image` placeholder, OpenGraph + Twitter Card meta on every page
   - Emits 🏅 commentary boxes on cut articles, swapping with the language tab
   - **Emits the Atom 1.0 syndication feed at `docs/feed.xml`** (see D11) and adds `<link rel="alternate" type="application/atom+xml">` autodiscovery to every HTML page's `<head>`
4. **New GHA step in the fast-path workflow:** after the renderer runs, render TWO email HTML bodies — `email_en.html` and `email_zh.html` — from the bilingual Editor's Cut + cut article list, and POST each to Beehiiv's Post API as a scheduled post targeting the `lang_en` and `lang_zh` segments respectively. Beehiiv API key lives as a GHA secret.
5. **No new responsibilities for Cloudflare Workers in this pipeline.** Workers are user-request-driven only — `/api/subscribe`, `/api/favourites`, `/api/auth/verify`, etc. They never participate in the daily build.

### What GHA does vs what Cloudflare does — explicit boundary

| Trigger | Runner | Job |
|---|---|---|
| Daily cron 20:30 UTC | GHA (Linux + Python + ffmpeg) | Full build: fetch sources, build article-bodies.json, generate audio, commit, push, POST routine fire |
| Claude routine commit lands on `main` | GHA fast-path | Re-render, regen audio if data hash changed, render email body, POST to Beehiiv Post API |
| Any push to `main` | Cloudflare Pages | Auto-rebuild + redeploy the static site (just runs `node scripts/render-site.mjs`; no Python or ffmpeg needed in the CF Pages build) |
| User hits `/api/*` | Cloudflare Worker | Handle the API request (auth, favourites, account, webhook) — reads/writes D1 |
| Beehiiv unsubscribe webhook | Cloudflare Worker (`/api/webhooks/beehiiv`) | Sync `subscribers.unsubscribed_at` |

Two thinking shortcuts that fall out:

- *Anything Python or ffmpeg or longer than 30s of CPU* lives in GHA.
- *Anything user-triggered or stateful* lives in Cloudflare.

### One-time migration

The migration splits across this spec (code work, no production vendor accounts) and the cloudflare-migration spec (production flip).

**Migration steps within this spec** (code work, no production vendor accounts):

| Step | Action |
|---|---|
| B1 | Author all renderer/routine/audio/SEO/translation changes. Live on GH Pages with `BACKEND_LIVE=false`. |
| B2 | Author Worker code under `worker/` directory in the repo. `wrangler.toml` configured for a `dev` environment only (no `prod` binding yet). |
| B3 | Author D1 schema migration files. Locally apply via `wrangler d1 migrations apply --local`. |
| B4 | Write GHA CI job that runs `wrangler dev` + integration tests against the local D1 + stubbed Beehiiv/Resend. Passes green before merge. |
| B5 | Add the `BACKEND_LIVE=false` env var to the existing GH Pages deploy step. Live site continues to deploy to GH Pages, now with the new editorial/translation/SEO content but no backend UI. |

**the cloudflare-migration spec migration steps** (deferred, separate spec):

| Step | Action |
|---|---|
| P1 | Buy custom domain. Set Cloudflare as DNS host. |
| P2 | Create Cloudflare Pages project pointed at the GitHub repo. Set custom domain. Configure build to run `node scripts/render-site.mjs` with `BACKEND_LIVE=true` on every push. |
| P3 | Create production D1 database. Apply migrations via `wrangler d1 migrations apply` (no `--local`). |
| P4 | Add `wrangler.toml` `prod` environment binding (D1 binding, route, secrets). Deploy the Worker. |
| P5 | Sign up for Beehiiv (Launch tier). Verify sending domain via DNS records. Add custom subscriber field `language` (values `en` / `zh`). Create two static segments `lang_en` and `lang_zh`. |
| P6 | Sign up for Resend (free tier). Verify sending domain (same domain as Beehiiv). |
| P7 | Add **Beehiiv + Resend API keys** as GHA secrets and Worker secrets. |
| P8 | Update GHA workflow: change the deploy target from GH Pages to Cloudflare Pages. Flip `BACKEND_LIVE` to `true`. |
| P9 | Handle the redirect from `rowland-dot.github.io/ai-daily-digest/*` to `<new-domain>/*`. GitHub Pages doesn't support custom redirects directly — either (a) leave the old site serving stale content with a meta-refresh in `index.html`, or (b) keep GH Pages disabled and let the URL 404, or (c) point the old domain at Cloudflare via Worker for a real 301. Recommended: (a) for the first few weeks, then (c) if traffic patterns warrant. |
| P10 | Submit `sitemap.xml` and `news-sitemap.xml` to Google Search Console + Bing Webmaster Tools. |
| P11 | Smoke-test: subscribe with a test email, verify magic-link arrives, click through, verify session cookie + redirect, save an article, change language pref, unsubscribe, delete account. Each flow tested end-to-end against production infra before announcing. |

The full migration is one-time. Rollback path during this spec is trivial (the live site never changed materially). Rollback during the cloudflare-migration spec depends on how far the flip has progressed — pre-DNS-flip is fully reversible; post-flip with subscribers requires moving the Beehiiv list to a new vendor (slow but not blocked).

**GHA is NOT migrated away in either spec — it stays as the build runner.** Only the deploy target moves from GH Pages (this spec) to Cloudflare Pages (the cloudflare-migration spec).

---

## Risks & open questions

### Risk: copyright on translation pages

Hosting EN excerpts of CN-source articles is a derivative-work issue. Mitigations baked into D6:
- Excerpt-only (≤3 paragraphs), not full body
- Canonical link to original source
- Prominent "Read original" CTA
- Attribution + source publish date

This is **defensible**, not **safe**. If any source explicitly asks us to stop translating their content, the spec assumes we comply immediately. The slug stays in the sitemap as a 410 Gone for ~30 days to flush from search indexes, then is removed.

### Risk: routine token budget

The token estimates above are conservative best-guesses. If a busy news day produces 15+ Editor's Cut commentaries + 20+ CN translations, the routine may run out of budget. Mitigation: routine prompt orders sections by priority (Editor's Cut overall > commentaries > translations); the routine drops the lowest-priority section first.

### Risk: Beehiiv Post API rate limits / behaviour on Launch tier

The free Launch tier *includes* API webhooks but the docs are ambiguous on whether scheduled-post creation via API is on Launch or only Scale. **Open question for implementation:** spike a single Post API call against the free tier before relying on it. If Launch doesn't support it, fallback: render the email body to a `data/daily-email.html` file in the repo and rely on Beehiiv's RSS-to-send (Max tier, $96/mo) — defer that decision to the monetisation spec / monetisation conversation.

### Open: domain choice

User has not yet chosen a custom domain. Spec assumes the choice is made before implementation begins. Suggestions: `aidailydigest.com`, `aidaily.report`, `ai-pulse.daily`, etc.

### Open: logo + branding

OG image strategy is deferred until a logo exists. Tracked as a TODO. Pages emit `og:image` pointing to a placeholder asset until the logo lands.

### Open: EN→CN translation of internal articles

Out of scope for this spec by user direction. Recorded as TODO: future support for ENtoCN translation of our own editorial or any EN-source articles that warrant it.

---

## Out of scope

- **Monetisation primitives** (paid tiers, ad slots, sponsorships) — the monetisation spec
- **EN→CN translation of articles** — TODO, post-spec
- **Native logo / brand mark design** — TODO, blocks final OG image strategy
- **Per-page or per-article OG image generation** — TODO, post-logo
- **Push notifications / mobile app** — not planned
- **User comments / discussion** — not planned

---

## TODOs (recorded for later)

| # | Item | Trigger |
|---|---|---|
| T1 | Author site logo + brand mark | Before OG image strategy lock-in |
| T2 | Revisit OG image strategy (fixed vs per-digest vs per-article) | After T1 lands |
| T3 | EN→CN translation of internal/EN-source articles | When CN subscriber demand surfaces |
| T4 | Beehiiv Max tier upgrade for RSS-to-send | If Post API on Launch tier proves unreliable |
| T5 | Google News inclusion verification | After 30 days post-launch (Google News approval timeline) |
| T6 | Per-recipient daily email personalisation (e.g. "your saved articles") | If subscriber engagement metrics warrant it |

---

## Cross-spec pointers

- **the card-refinements spec** ships first; this spec assumes the card-refinements spec's renderer changes (no Mix track, title-as-link) are already live. The Atom syndication feed and its `<link rel="alternate">` autodiscovery moved out of that spec and are introduced here (see D11 and B14/B15).
- **the monetisation spec** starts brainstorming once this spec's behaviours are in production for ~30 days and we have real subscriber + traffic data.
