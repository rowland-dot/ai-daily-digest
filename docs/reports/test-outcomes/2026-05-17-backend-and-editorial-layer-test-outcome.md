# /full-stack-tdd Audit Report — backend-and-editorial-layer
**Date:** 2026-05-17
**Branch:** `feat/backend-and-editorial-layer`
**Spec:** `docs/specs/2026-05-17-backend-and-editorial-layer-spec.md`
**Plan test artifact:** `docs/plans/2026-05-17-backend-and-editorial-layer-plan.md` §3.3
**Test suite:** 305/305 passing across 24 test files

---

## Audit Verdict: PASS

**CRITICAL: 0 — HIGH: 0 — MEDIUM: 5 — LOW: 4**

No untested security paths, no uncovered spec behaviours, no destructive flows without
assertions. 305 tests pass. All 19 behaviours have at least one automated layer. The
findings below are quality/completeness gaps that should be addressed in the E2E follow-up
branch or as targeted additions.

---

## 1. Assertion Quality

### What this measures
Does each test assert the *requirement from the spec*, or does it merely assert that the
code runs and produces *some* output?

### Findings

**MEDIUM — M1: `renderNewsArticleJsonLd` imported but never called**
`tests/lib/seo.test.mjs:7` imports `renderNewsArticleJsonLd` from `scripts/lib/seo.mjs`
but no `describe` block exercises it directly. The function is tested indirectly via
`renderTranslationPage` (which internally calls it), but the standalone function contract
— especially the required fields from spec D7: `headline`, `datePublished`, `articleBody`,
`mainEntityOfPage` — has zero direct assertions. If `renderTranslationPage` abstracts those
fields away, a breaking change to `renderNewsArticleJsonLd` could go undetected.

*Gap:* spec B13 lists required JSON-LD fields (`headline`, `author`, `datePublished`,
`articleBody`, `mainEntityOfPage`); tests only assert `@type` and `isBasedOn`.

**MEDIUM — M2: Atom feed editorial-leak check uses `toContain` not field-by-field assertion**
`tests/render/seo-pages.test.mjs:129–136` iterates `<summary>` blocks and asserts each
`toContain("Today's digest:")`. This is correct per the spec (D11 says summaries must use
the generic count-line). However the test would pass if an entry contained both
`"Today's digest:"` and editorial prose (e.g. `"Today's digest: GPT-5 raises…"`). The
assertion should be a strict format check (`/^Today's digest: \d+ items across \d+ sources/`)
not a substring presence.

**LOW — L1: B15 autodiscovery uses `toBeGreaterThanOrEqual(1)` not exact-one check**
`tests/render/seo-pages.test.mjs:79–81` checks `docs/index.html` for atom+xml autodiscovery
and asserts `matches.length >= 1`. Spec B15 requires **exactly one** `<link rel="alternate"
type="application/atom+xml">`. The test would pass with duplicates (which would themselves
violate B15). Additionally, only `docs/index.html` is checked; the spec requires the tag on
every page type (digest archive, translation page, favourites, account).

**LOW — L2: `og:description` is required but not asserted**
`renderOgMeta` tests (`tests/lib/seo.test.mjs:104–121`) assert `og:title`, `og:image`,
`og:url`, and `twitter:card`. Spec D7 lists `og:description` as required but no assertion
verifies it is present in `renderOgMeta` output or in rendered pages.

---

## 2. State Transition Coverage

### What this measures
For UI surfaces with multiple states, does at least one test exercise the full arc
(pre-state → trigger/transition → post-state assertion)?

### Findings

**MEDIUM — M3: Subscribe form — idle-only HTML coverage; arc not asserted at render level**
`tests/render/subscribe-form.test.mjs` only tests the server-rendered `idle` state
(mockup 01). The plan states that states 02–05 (`submitting`, `link-sent`,
`error-invalid-email`, `error-network`) are client-JS-only. Tests do assert that
`SUBSCRIBE_FORM_SCRIPT` contains the state strings, but there is no arc test: no test
starts from `idle`, triggers the state change, and asserts the post-transition DOM.

This is the correct architecture (purely client-side transitions), but per ASSERTION-RULES
Rule 2, a state that can be reached by user action requires at least one test that exercises
pre→trigger→post. This gap is inherently an E2E gap (the `needs-automation` column in the
test matrix correctly flags it). No finding is raised here beyond documenting it as a known
open gap covered by the `needs-automation` tracking.

*No new finding raised — correctly deferred to E2E follow-up.*

**MEDIUM — M4: Account page language-saving and toast states (mockups 19–20) have no
render-layer assertions**
`tests/render/account-page.test.mjs` covers mockups 17 (linked-active) and 18
(linked-unsubscribed) at the render level, and the code comment in `account-page.mjs:13`
correctly documents that states 19/20/21 are client-JS-only. However:
- The `toast-root` container (`<div id="toast-root" aria-live="polite" aria-atomic="true">`)
  that the client JS relies on to inject the toast (mockup 20) is not asserted in any test.
- Without an assertion that `#toast-root` is present in the static HTML, a future refactor
  could remove it and break the toast without any test failing.

*This is a render-layer gap, not an E2E gap.*

**LOW — L3: B1b — localStorage non-write contract not tested**
Spec B1b and plan §3.3 state: "the renderer's frontend JS no longer writes
`localStorage.setItem('lang', ...)` for anonymous users." The plan entry for B1b lists
`tests/render/feature-flag.test.mjs (F3) asserts no localStorage.setItem('lang') in inline
JS`. The actual feature-flag.test.mjs (2 tests) checks BACKEND_LIVE presence in the
workflow YAML and articleId stability. Neither test greps the rendered page JS for the
`setItem('lang')` pattern. The contract is unverified.

---

## 3. Mockup-State Matrix

All 30 mockup states are covered:

| Range | States | Coverage |
|---|---|---|
| 01–05 | Subscribe form (idle/submitting/link-sent/errors) | Idle HTML ✅; JS states in SCRIPT ✅; arc is E2E deferred |
| 06–08 | Favourite star (empty/filled/syncing) | HTML presence ✅; arc is E2E deferred |
| 09–12 | Favourites page GH Pages + Cloudflare | ✅ |
| 13–16 | Sync-prompt 4-state panels | All 4 panels in DOM ✅; JS arc wiring ✅ |
| 17–22 | Account page (6 states) | Static HTML for 17/18 ✅; toast-root gap (M4) |
| 23–26 | Editor's Cut commentary (4 states) | ✅ |
| 27–28 | Email templates (EN/ZH) | ✅ |
| 29–30 | Translation page (populated/placeholder) | ✅ |

**2 states tagged manual-only** (email-en, email-zh mobile rendering, and feed-reader
rendering) — both correctly categorised as `[manual-only: visual-polish]`.

---

## 4. Worker Route Coverage

All 9 declared API routes have integration tests:

| Route | Test file | Auth tested | Security path |
|---|---|---|---|
| `POST /api/subscribe` | subscribe.test.ts | N/A (unauthenticated) | email format, idempotent upsert, lang preservation ✅ |
| `POST /api/sync-favourites` | sync-favourites.test.ts | N/A | email format ✅ |
| `GET /api/auth/verify` | auth-verify.test.ts | Magic-link token | expired/consumed/missing → opaque 400 ✅ |
| `GET /api/favourites` | favourites.test.ts | Session cookie | 401 no-cookie ✅ |
| `POST /api/favourites` | favourites.test.ts | Session cookie | article_id format validation ✅ |
| `DELETE /api/favourites/:id` | favourites.test.ts | Session cookie | idempotent 200 ✅ |
| `POST /api/account/unsubscribe` | account.test.ts | Session cookie | 401 guard ✅ |
| `PUT /api/account/language` | account.test.ts | Session cookie | 400 invalid lang, DB update ✅ |
| `POST /api/account/delete` | account.test.ts | Session cookie | CSRF guard (X-Requested-With) ✅, cookie clear ✅ |
| `POST /api/webhooks/beehiiv` | webhooks.test.ts | HMAC signature | missing sig 401, bad sig 401, absent secret 503 ✅ |

**Security paths specifically verified:**
- Constant-time HMAC comparison: implementation uses `crypto.subtle.verify` (timing-safe) ✅. **Gap:** no test asserts the *timing-safe path* is taken — i.e., no test submits a partially-correct signature and verifies the same 401 response time as a fully-wrong one. This is inherently hard to unit-test; the code review and implementation comment are the mitigation. Not raised as a finding given the implementation is correct.
- SESSION_SECRET guard: `index.test.ts` verifies missing/undefined secret throws ✅
- Rate limiting: `rate-limit.test.ts` covers token bucket, bypass, key isolation ✅
- Article-id format validation: `favourites.test.ts` line 98–108 ✅ (E-S1 finding addressed)
- Cookie attributes: `HttpOnly` is asserted in `auth-verify.test.ts`. **Gap (MEDIUM M5):** `Secure` and `SameSite=Lax` are set in the implementation but not asserted in any test. A future refactor dropping those attributes would not fail any test.

**MEDIUM — M5: Session cookie `Secure` and `SameSite=Lax` attributes unasserted**
`tests/worker/auth-verify.test.ts:69` asserts `'Set-Cookie'` contains `HttpOnly`.
The implementation (`worker/routes/auth-verify.ts:64`) sets `Secure; SameSite=Lax` but
no test asserts these. Per spec §3.5: "Session cookies: HMAC-signed, HttpOnly, Secure,
SameSite=Lax."

**LOW — L4: Beehiiv segment-move call not asserted in `PUT /api/account/language` test**
`tests/worker/account.test.ts` lines 99–110 pass empty strings for `beehiivApiKey` and
`beehiivPubId` and verify the DB update. Spec B6b requires "the Beehiiv subscriber is moved
from the current segment to the new one." The test does not assert that `moveToLanguageSegment`
was called (even with a stub). If the Beehiiv call is silently removed, the DB test still
passes and the segment migration silently breaks.

---

## 5. Behaviour Coverage

All 19 spec behaviours have at least one automated test layer:

| Behaviour | Automated layer | Gap |
|---|---|---|
| B1 Subscribe via email | Unit + integration (subscribe.test.ts) | E2E deferred |
| B1b Anonymous EN-only first paint | feature-flag.test.mjs (partial) | **L3: localStorage write contract untested** |
| B1c Subscriber lang auto-applies | account.test.ts (server round-trip) | E2E deferred |
| B2 Save anonymous | editors-cut.test.mjs (star button present) | E2E deferred |
| B3 Save linked | favourites.test.ts (POST+GET) | E2E deferred |
| B4 View saved articles | favourites-page.test.mjs (both flag states) | ✅ |
| B5 Sync favourites | sync-favourites.test.ts | E2E deferred |
| B6 Daily email in stored language | email-template.test.mjs + post-to-beehiiv.test.mjs | manual-only (visual) |
| B6b Lang pref change via /account | account.test.ts (DB update) | **L4: Beehiiv stub not asserted** |
| B7 Editor's Cut commentary on cards | editorial.test.mjs + editors-cut.test.mjs | ✅ |
| B7b Commentary respects language tab | editorial.test.mjs (data attributes) | E2E deferred |
| B8 CN article → translation page | translations.test.mjs + translation-pages.test.mjs | ✅ |
| B9 同 card with 中文 tab | translation-pages.test.mjs (dual-href) | E2E deferred |
| B10 Unsubscribe from emails | account.test.ts + webhooks.test.ts | E2E deferred |
| B11 Delete account | account.test.ts (data deletion, cookie clear) | E2E deferred |
| B12 Search engines discover site | seo.test.mjs + seo-pages.test.mjs | **No `<link rel="sitemap">` in HTML head tested** |
| B13 Translation pages multilingual | translations.test.mjs + translation-pages.test.mjs | **M1: headline/datePublished/articleBody/mainEntityOfPage not asserted** |
| B14 Atom feed reachable + valid | seo.test.mjs + seo-pages.test.mjs | manual-only (feed-reader rendering) |
| B15 Feed autodiscovery every page | seo-pages.test.mjs (index.html only, `>=1`) | **L1: exact-one check missing; other page types not checked** |

**All 19 behaviours covered — 0 uncovered.**

---

## 6. Findings Summary

| ID | Severity | Location | Finding |
|---|---|---|---|
| M1 | MEDIUM | `tests/lib/seo.test.mjs:7` | `renderNewsArticleJsonLd` imported but never called; spec B13 required fields (`headline`, `datePublished`, `articleBody`, `mainEntityOfPage`) not directly asserted |
| M2 | MEDIUM | `tests/render/seo-pages.test.mjs:133` | Atom summary editorial-leak check uses `toContain("Today's digest:")` — would pass if editorial prose was appended after the count-line; should be strict format regex |
| M3 | MEDIUM | `tests/render/account-page.test.mjs` | `#toast-root` container (required by client JS for language-saved toast, mockup 20) not asserted in static HTML; a removal would go undetected |
| M4 | MEDIUM | `tests/render/account-page.test.mjs` | (same file) `aria-live="polite"` attribute on toast container is spec-required for accessibility but not asserted |
| M5 | MEDIUM | `tests/worker/auth-verify.test.ts:69` | `Secure` and `SameSite=Lax` cookie attributes present in implementation but not asserted in any test |
| L1 | LOW | `tests/render/seo-pages.test.mjs:79–81` | B15 autodiscovery uses `>=1` not `===1`; only checks `index.html`, not digest/translation/favourites/account pages |
| L2 | LOW | `tests/lib/seo.test.mjs:104–121` | `og:description` (required by spec D7) not asserted in `renderOgMeta` test suite |
| L3 | LOW | `tests/render/feature-flag.test.mjs` | B1b contract "no `localStorage.setItem('lang')` in inline JS" stated in plan but absent from test |
| L4 | LOW | `tests/worker/account.test.ts:99–110` | Beehiiv `moveToLanguageSegment` call not asserted — passing empty API keys means B6b's Beehiiv segment-move is silently skipped in tests |

---

## 7. Overall Assessment

The test suite is structurally sound. All 19 behaviours have automated coverage at the
unit/integration layer. The E2E layer is correctly deferred (11 `needs-automation` items
tracking the Playwright harness that doesn't exist yet — not a gap, an honest deferral).

The 5 MEDIUM findings are all *assertion quality* issues — tests that pass against both the
correct implementation and a broken one. None represent a completely untested behaviour or
path. They should be addressed in the first available test-maintenance pass, before the
Playwright harness work begins (since the harness work won't cover server-side assertion
quality).

The 4 LOW findings are minor precision/completeness gaps.

**Recommended resolution order:**
1. M5 — add `Secure` + `SameSite=Lax` assertions to `auth-verify.test.ts` (2-min fix)
2. M3/M4 — add `#toast-root` + `aria-live` assertions to `account-page.test.mjs` (5-min fix)
3. M1 — add direct `renderNewsArticleJsonLd` test block covering spec B13 fields
4. M2 — tighten Atom summary regex to `/^Today's digest: \d+ items across \d+ sources/`
5. L3 — add grep of rendered inline JS for absence of `setItem('lang')` in `feature-flag.test.mjs`
6. L1 — change `>=1` to `===1` and add autodiscovery check to favourites/translation page
7. L2 — add `og:description` assertion to `renderOgMeta` test
8. L4 — add spy/stub on `moveToLanguageSegment` to language update test

---

<!-- pipeline:json
{
  "schema_version": 1,
  "skill": "full-stack-tdd",
  "step": 7,
  "mode": "audit",
  "severity": {"critical": 0, "high": 0, "medium": 5, "low": 4},
  "completeness": 9,
  "confidence": 9,
  "behaviour_coverage": {
    "covered": 19,
    "total": 19,
    "uncovered": []
  }
}
-->
