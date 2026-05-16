# Pre-Landing Review — backend-and-editorial-layer

- **Branch:** `feat/backend-and-editorial-layer`
- **Base:** `origin/main` (a81f7eb...41f6e23)
- **Commits ahead:** 35
- **Diff size:** 95 files, +15,943 / -10
- **Spec:** `docs/specs/2026-05-17-backend-and-editorial-layer-spec.md`
- **Plan:** `docs/plans/2026-05-17-backend-and-editorial-layer-plan.md`
- **Step 4 status:** 22 of 23 plan tasks implemented, 204/204 tests passing, no E2E (deferred)

## Scope check

- **Status:** CLEAN
- **Intent:** Land the backend + editorial layer (Cloudflare Worker API, D1 schema, magic-link auth, favourites sync, account page, Editor's Cut commentary, bilingual email, SEO surfaces) behind a `BACKEND_LIVE` feature flag — site stays static on GH Pages until the migration spec flips it.
- **Delivered:** Worker entry + 6 routes (subscribe, auth-verify, favourites, account, sync-favourites, webhooks), D1 migration, HMAC session helper, magic-link token helper, Resend/Beehiiv stubs, editorial cut renderer, bilingual email template, translation pages, sitemap/news-sitemap/robots/Atom feed, account+favourites page shells, GHA Beehiiv POST step (gated on secrets), BACKEND_LIVE=false in Pages deploy.
- **Plan items:** 22 DONE, 1 DEFERRED (E2E suite — explicit follow-up).

No scope drift. Everything in the diff matches the spec.

## Verdict: FAIL

CRITICAL=2, HIGH=5 — must address before landing.

---

## CRITICAL findings

### C1 — Fail-open auth on missing `SESSION_SECRET` (forgeable sessions)

`worker/index.ts:27, 33, 36` passes `env.SESSION_SECRET ?? ''` into every session-using route. If `SESSION_SECRET` is unset, missing, or a deploy misconfiguration occurs, **HMAC is computed with an empty-string key**. Any attacker who computes `HMAC('', email|expiry)` can mint a valid session for any email — full account takeover, including triggering `POST /api/account/delete`.

- **Why this is critical:** Cloudflare Worker env var omission is a routine deploy-time hazard. The `?? ''` swallows it silently. There is no startup check.
- **Fix:** At entry, if `!env.SESSION_SECRET || env.SESSION_SECRET.length < 32`, return `500 server_misconfigured` for any route that uses it. Don't fall back to an empty key under any circumstance.
- **Confidence: 10/10** — verified by reading the three call sites and `worker/lib/auth.ts:14-33`.

### C2 — Non-constant-time HMAC compare in webhook signature verification

`worker/routes/webhooks.ts:30` returns `expected === signature` after computing the expected hex digest. **JavaScript string `===` is not timing-safe**. An attacker with network access can mount a byte-by-byte timing oracle to forge a valid `X-Beehiiv-Signature` and, once forged, push arbitrary `subscriber.unsubscribed` events to nuke any subscriber's status.

- **Why this is critical:** The webhook endpoint is the trust boundary between Beehiiv and our D1. The session-cookie verifier (`worker/lib/auth.ts:57`) correctly uses `crypto.subtle.verify` — webhook should too.
- **Fix:** Replace the `expected === signature` line with `crypto.subtle.verify('HMAC', key, hexToBytes(signature), payloadBytes)`. Match the pattern already in `auth.ts`.
- **Confidence: 9/10** — verified by reading lines 17-34 of `worker/routes/webhooks.ts`.

---

## HIGH findings

### H1 — Webhook fails open when `BEEHIIV_WEBHOOK_SECRET` is unset

`worker/routes/webhooks.ts:44` only verifies the signature when `webhookSecret` is truthy. The comment claims this is for "local/test safety," but the same code runs in production. If the secret env var is missing or empty, **anyone on the internet can POST `{type:"subscriber.unsubscribed", data:{email:"victim@x.com"}}` and silently set `unsubscribed_at` on the victim's row** with no auth.

- **Why this is high:** Symmetric to C1 — silent fail-open is the failure mode that bites at deploy time. The "test environment" carve-out belongs in tests, not in the production code path.
- **Fix:** Take the secret as a required env var in `worker/types.ts`, fail-closed (401) on missing secret in the route, and have tests pass an explicit `webhookSecret` (they already do). The "secret absent = skip" test (`tests/worker/webhooks.test.ts:109-119`) is codifying the bug — it must be updated.
- **Confidence: 10/10** — verified at `worker/routes/webhooks.ts:42-53` and `tests/worker/webhooks.test.ts:117`.

### H2 — Distinct error codes leak magic-link token state

`worker/routes/auth-verify.ts:30-41` returns three distinct responses: `404 token_not_found`, `400 token_consumed`, `400 token_expired`. An attacker iterating through guessed tokens can distinguish unknown vs consumed-or-expired and confirm token existence. While the token is 64 hex chars (256 bits — unguessable in practice), the leak is still an unnecessary side channel and a common audit finding.

- **Why this is high:** Spec § D1/D2 names magic-link tokens as the only auth credential. Leaking existence vs consumed-vs-expired narrows the search space and supports user-enumeration when paired with the unrate-limited subscribe endpoint (see H4).
- **Fix:** Collapse all three failure responses to a single `400 token_invalid` with the same body. Log the differentiation internally for ops.
- **Confidence: 8/10** — verified at `worker/routes/auth-verify.ts:30-41`.

### H3 — `POST /api/account/delete` has no CSRF protection

`worker/routes/account.ts:74-83` triggers full GDPR delete on session-cookie auth alone. The cookie is `SameSite=Lax`, which **still permits top-level POST navigations** from a malicious site (e.g. `<form action="https://api.../api/account/delete" method="POST"><input type="submit"></form>` autosubmitted). Result: silent destruction of a logged-in user's data with one click on a malicious page.

- **Why this is high:** This is the most destructive operation in the system. The spec (line 417) describes it as "Full GDPR-grade wipe" — exactly what we don't want triggered by a CSRF.
- **Fix:** Require a confirmation token in the request body (issued via GET to a same-origin endpoint, double-submit-cookie pattern), OR require a custom `X-Requested-With` header (forces preflight, blocks form-based CSRF), OR switch the cookie to `SameSite=Strict` for delete-class routes. Spec D8 implies a confirm modal exists in the UI; the API should enforce the same expectation.
- **Confidence: 9/10** — confirmed `Set-Cookie` uses `SameSite=Lax` at `worker/routes/auth-verify.ts:49`, and the delete route has no CSRF token check.

### H4 — No rate limiting on `POST /api/subscribe`, `/api/sync-favourites`, `/api/account/delete`

None of the routes apply rate limits. `POST /api/subscribe` accepts any email and sends a Resend email. Resend free-tier cap is 100/day (spec line 94). **An attacker can burn the entire daily quota in seconds by posting random emails, blocking all real users from receiving magic links.** Same shape for `/api/sync-favourites`. Also enables email-bombing real users — anyone can spam `me@victim.com` with magic-link emails.

- **Why this is high:** Spec doesn't name rate limiting but the math is unforgiving: 100 emails/day is a single attacker's curl loop. Cloudflare's free Worker tier does include some abuse protection at the edge, but app-level rate limits are still needed (e.g., max 3 subscribe attempts per email per hour, max 10 from any IP per hour).
- **Fix:** Add a `rate_limits` table keyed on `(email_hash | ip_hash, route, window)`, or use Cloudflare's built-in Rate Limiting binding. Track in TODOS.md if deferred.
- **Confidence: 9/10** — confirmed no rate-limit checks anywhere in `worker/routes/`.

### H5 — `upsertSubscriber` lets unauthenticated callers mutate any subscriber's language

`worker/lib/db.ts:30-43` — `INSERT ... ON CONFLICT(email) DO UPDATE SET language = excluded.language` runs on every `POST /api/subscribe`. There is no auth on subscribe (correct — public form). But **a third party who posts `{email: "victim@x.com", language: "zh"}` will silently flip the victim's email-language preference**, even when victim is already verified and unsubscribed. Next daily email goes out in the wrong language; the victim has no idea why.

- **Why this is high:** Spec line 61 names `subscribers.language` as the only persistent language preference. Allowing anonymous mutation of an authenticated user's stored preference violates the trust boundary.
- **Fix:** On conflict, only update `language` when the existing row has `verified_at IS NULL` (still-pending state — the resubscribe legitimately updates). Verified subscribers can update language only through `PUT /api/account/language`, which already requires a session.
- **Confidence: 9/10** — verified at `worker/lib/db.ts:36-42` and confirmed call site at `worker/routes/subscribe.ts:44`.

---

## MEDIUM findings

### M1 — Stale magic links remain valid until natural expiry

`worker/routes/subscribe.ts:46-49` and `sync-favourites.ts:46-49` insert a new magic link without invalidating prior unconsumed links for the same email. Spamming subscribe yields many concurrently-valid 30-minute links. Each is one-time-use (consumed flag), so risk is low, but if any one is intercepted via email logs / proxy / shared inbox, it remains live longer than necessary. Fix: `UPDATE magic_links SET consumed_at = datetime('now') WHERE email = ? AND consumed_at IS NULL` before inserting the new one.

### M2 — `INSERT OR IGNORE` already handles dedup; pre-check in favourites is N+1

`worker/routes/favourites.ts:77-83` performs a full `getFavourites(email)` SELECT just to check `.includes(articleId)` before insert. The DB schema's `PRIMARY KEY (email, article_id)` plus `INSERT OR IGNORE` already provides idempotent semantics; check `result.meta.changes` to distinguish 201-new vs 200-duplicate. Current code scans the whole favourites list on every POST.

### M3 — Re-subscribe doesn't clear `unsubscribed_at`

Once a subscriber has `unsubscribed_at` set, hitting `POST /api/subscribe` re-issues a magic link but leaves the unsubscribed flag set. After magic-link verify, `setVerified()` runs but the unsubscribed flag stays. Result: a re-subscribed user shows as "unsubscribed" on `/account`. Spec D5 implies re-subscribe should fully re-activate. Fix: on `setVerified()`, also `UPDATE ... SET unsubscribed_at = NULL`.

### M4 — Email regex is too permissive

`worker/routes/subscribe.ts:11` — `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` accepts `a@b.c`, `..@..`, etc. Not security-critical (Resend will refuse undeliverable ones) but the friendly-validation contract in spec implies tighter checking. Acceptable as MVP; flag for review when adding rate limits anyway.

### M5 — `RESEND_API_KEY === 'test'` magic-string skips emails in production

`worker/lib/email.ts:11` — if someone copy-pastes `RESEND_API_KEY=test` into prod env, all magic-link emails silently log to console instead of being sent. Failure mode: nobody can subscribe, no error surfaces. Fix: gate the stub on `env.ENVIRONMENT === 'test'` or an explicit `RESEND_STUB=true` flag — never on the value of a secret.

### M6 — `webhooks.ts` "test safety" no-op test codifies a fail-open production bug

`tests/worker/webhooks.test.ts:109-119` — "no-ops signature check when secret is absent" — this test pins the fail-open behavior flagged in H1. The test will need updating when H1 is fixed (test should assert 500/401 when secret absent, not 200). Per `discipline-test-assertions` Rule 1, assert spec requirements, not implementation behavior.

### M7 — Beehiiv list-lookup failures silently swallowed

`worker/lib/beehiiv.ts:44, 73` — `if (!listRes.ok) return;` returns successfully on Beehiiv API failure, so a Beehiiv outage during unsubscribe leaves D1 updated but Beehiiv state stale. Log + raise (or at least record an audit row) to avoid silent split-brain.

---

## LOW findings

### L1 — Typo `hasTranlation`

`scripts/lib/translations.mjs:85` — should be `hasTranslation`. Functions correctly but ages poorly.

### L2 — Canonical URL under GH Pages may not match deployed path

`scripts/lib/favourites-page.mjs:82, account-page.mjs` — canonical/links assume `SITE_ORIGIN` ends without trailing slash and that `/favourites` is the live path. Under GH Pages the project deploys to `https://rowland-dot.github.io/ai-daily-digest/` and the favourites page is at `/ai-daily-digest/favourites/`. Worth confirming canonical tags emit the deployed URL exactly. Verification checklist already exists in `docs/specs/2026-05-17-backend-and-editorial-layer-verification-checklist.md` — spot-check post-deploy.

### L3 — Magic-link email HTML doesn't escape `siteOrigin`

`worker/routes/subscribe.ts:53` — `siteOrigin` is interpolated raw into the anchor's href. Env-controlled, low risk. If hardening later, route through an `escapeAttr()` helper.

---

## Plan completion summary

22/23 DONE, 1 DEFERRED (E2E test suite — explicitly tracked as follow-up). No silent gaps.

| Item | Status |
|---|---|
| D1 schema + migration | DONE |
| HMAC session helper | DONE |
| Magic-link token generator | DONE |
| POST /api/subscribe | DONE |
| GET /api/auth/verify | DONE |
| POST /api/sync-favourites | DONE |
| GET/POST/DELETE /api/favourites | DONE |
| Account routes (unsubscribe, language, delete) | DONE |
| POST /api/webhooks/beehiiv | DONE |
| Editorial cut renderer | DONE |
| Bilingual email template | DONE |
| Beehiiv POST API step in GHA | DONE |
| Translation pages | DONE |
| SEO surfaces (sitemap, news-sitemap, robots, Atom, JSON-LD, OG, canonical) | DONE |
| /favourites + /account pages with feature flag | DONE |
| Vitest harness for Worker tests | DONE |
| Article-ID helper + summaries-schema normaliser | DONE |
| `BACKEND_LIVE=false` in GH Pages deploy step | DONE |
| Per-state mockup tagging | DONE |
| 204 tests, all green | DONE |
| E2E suite | DEFERRED (tracked) |

## Spec/mockup grounding

The diff implements what the spec describes. No invented content surfaced in spec or mockup files during review. The Editor's Cut fallback semantics (mockup 25) match the renderer's `commentary_zh_fallback` flag.

## Documentation staleness

No `README.md` / `ARCHITECTURE.md` / `CLAUDE.md` updates in this branch. The CLAUDE.md changes look needed (GitNexus-only content currently) — likely a follow-up post-deploy task, not a landing blocker.

## Notes

- Tests assert observable behavior in most cases (good); a handful (M6) codify implementation choices that mask bugs.
- The feature-flag discipline is well-applied — `BACKEND_LIVE=false` in deploy, account page returns `null` when flag is off, favourites page silently swaps sync-prompt visibility. Backend code is shipped dark — exactly the spec intent.
- No SQL injection risk found — all queries parameterized via `.bind()`. Article-id format validation closes the only obvious source-of-user-input-into-SQL gap.
- No prompt-injection / LLM trust-boundary surface in the diff — editorial data is read from `data/claude-summaries.json` (build-time artifact), and the renderer HTML-escapes commentary fields.

## Recommendation

Block the merge on C1 + C2 + H1 + H3 + H5. H2 + H4 + the MEDIUM set can land as follow-up tracked TODOs if the user explicitly accepts the residual risk, but C1/C2/H1/H3/H5 are landing blockers because they're either silent fail-open auth (C1/H1/H5) or destructive-without-confirmation (H3) or trivial-timing-attack (C2). The fix surface for all five is small (~50 lines total) and TDD-friendly — each has an obvious red fixture.
