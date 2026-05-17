/**
 * backend-deferred.spec.ts
 *
 * Cloudflare-live E2E stubs — deferred to the cloudflare-migration spec.
 *
 * These tests require a live Cloudflare Worker (wrangler dev or deployed
 * worker) to run. They cannot be automated against preview:demo because the
 * API routes (/api/subscribe, /api/favourites, /api/account, etc.) return
 * 404 in that environment (BACKEND_LIVE=true renders the UI, but the backend
 * itself doesn't run).
 *
 * Each stub documents:
 *   - Which spec behaviour it covers (Bx / Bxb)
 *   - What the test will assert once the backend is live
 *   - Which integration test already covers the server-side contract
 *
 * To implement: configure a second Playwright project that points
 * baseURL at the wrangler-dev port (e.g. http://localhost:8787) and
 * remove the test.skip() call from each test body once the Cloudflare Worker
 * is deployed.
 */

import { test } from '@playwright/test';

test.describe('Cloudflare-live — deferred to cloudflare-migration spec', () => {

  // ---- B1: Subscribe via email -----------------------------------------
  test('B1 — subscribe form POST sends magic-link email and shows link-sent state [cloudflare-migration]', async ({ page }) => {
    // Will assert: fill email → submit → form shows data-form-state="link-sent"
    // + network panel shows POST /api/subscribe returned 200.
    // Server-side covered by: tests/worker/subscribe.test.ts (SELF.fetch with D1+Resend stub).
    test.skip(true, 'Deferred: requires live Cloudflare Worker (wrangler dev). Promote in cloudflare-migration spec.');
  });

  // ---- B1c: Subscriber lang preference auto-applies on login -----------
  test('B1c — magic-link click sets session cookie and renders page in stored lang [cloudflare-migration]', async ({ page }) => {
    // Will assert: consume magic-link URL → page reloads → data-lang attribute
    // matches the preference stored by PUT /api/account/language.
    // Server-side covered by: tests/worker/account.test.ts (D2 PUT + GET round-trip).
    test.skip(true, 'Deferred: requires live Cloudflare Worker. Promote in cloudflare-migration spec.');
  });

  // ---- B3: Save linked, server-synced favourites -----------------------
  test('B3 — clicking fav-star while logged in POSTs to /api/favourites in background [cloudflare-migration]', async ({ page }) => {
    // Will assert: network panel shows POST /api/favourites fired + returned 200;
    // on a new page load /api/favourites GET returns the saved article.
    // Server-side covered by: tests/worker/favourites.test.ts (POST+GET cycle).
    test.skip(true, 'Deferred: requires live Cloudflare Worker. Promote in cloudflare-migration spec.');
  });

  // ---- B4 (Cloudflare-live): View saved articles when linked -----------
  test('B4 — /favourites page shows server-synced articles for a linked subscriber [cloudflare-migration]', async ({ page }) => {
    // Will assert: after login + save via API, /favourites renders article cards
    // in saved-at DESC order, pulled from /api/favourites (not localStorage).
    // Render-side covered by: tests/render/favourites-page.test.mjs (G1 — BACKEND_LIVE matrix).
    test.skip(true, 'Deferred: requires live Cloudflare Worker. Promote in cloudflare-migration spec.');
  });

  // ---- B5: Sync favourites to new device --------------------------------
  test('B5 — sync-favourites magic-link flow transfers localStorage favs to account [cloudflare-migration]', async ({ page }) => {
    // Will assert: expand sync prompt → enter email → click link → new session
    // loads /favourites with the same set of articles that were in localStorage.
    // Server-side covered by: tests/worker/sync-favourites.test.ts (C3 — POST sync + consume).
    test.skip(true, 'Deferred: requires live Cloudflare Worker. Promote in cloudflare-migration spec.');
  });

  // ---- B6: Daily email lands in stored language -------------------------
  test('B6 — daily email pipeline sends bilingual email via Beehiiv POST [cloudflare-migration]', async ({ page }) => {
    // Will assert: trigger GHA workflow → Beehiiv API receives POST with
    // correct segment_id for the subscriber's stored language preference.
    // Out of slice scope (live Beehiiv send + inbox check).
    // Server-side covered by: tests/lib/post-to-beehiiv.test.mjs (E2 — payload shape).
    test.skip(true, 'Deferred: requires live Cloudflare Worker and live Beehiiv credentials. Promote in cloudflare-migration spec.');
  });

  // ---- B6b: Language preference change via /account --------------------
  test('B6b — changing lang on /account page shows toast and reloads in new lang [cloudflare-migration]', async ({ page }) => {
    // Will assert: click language radio on /account → form submits →
    // toast appears → reload shows data-lang matches new preference.
    // Server-side covered by: tests/worker/account.test.ts (D2 — PUT updates DB + Beehiiv segment-move stub).
    test.skip(true, 'Deferred: requires live Cloudflare Worker. Promote in cloudflare-migration spec.');
  });

  // ---- B10: Unsubscribe from emails ------------------------------------
  test('B10 — Beehiiv webhook fires on unsubscribe → account shows unsubscribed state [cloudflare-migration]', async ({ page }) => {
    // Will assert: email unsubscribe link → Beehiiv fires webhook → /account
    // page shows unsubscribed badge; favourites still intact.
    // Server-side covered by: tests/worker/webhooks.test.ts (D3 — webhook POST sets unsubscribed_at).
    test.skip(true, 'Deferred: requires live Cloudflare Worker + Beehiiv webhook. Promote in cloudflare-migration spec.');
  });

  // ---- B11: Delete account / data --------------------------------------
  test('B11 — delete account: modal confirms → DELETE /api/account/delete → redirect + 401 [cloudflare-migration]', async ({ page }) => {
    // Will assert: open account page → click Delete account → modal appears →
    // confirm → DELETE fires → redirected to home → /api/favourites returns 401.
    // Server-side covered by: tests/worker/account.test.ts (DELETE — removes all rows + Beehiiv list entry).
    test.skip(true, 'Deferred: requires live Cloudflare Worker. Promote in cloudflare-migration spec.');
  });

});
