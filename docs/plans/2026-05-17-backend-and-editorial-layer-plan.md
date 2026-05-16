# Backend, Identity, Editorial Layer, Translations & SEO — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write and locally test the full backend (Cloudflare Worker + D1), editorial layer (Editor's Cut commentary, bilingual), translation pages (CN→EN excerpts), SEO bundle (sitemaps, JSON-LD, OG, Atom feed), and favourites UI — with a feature flag keeping backend-dependent UI off the live GH Pages build.

**Architecture:** GitHub Actions remains the build runner; all new server-side logic lives in `worker/` and is tested via vitest + miniflare-style local D1. The live site ships on GH Pages with `BACKEND_LIVE=false`, exposing only the static editorial/translation/SEO/feed improvements. Backend code is in-repo and locally verified but not deployed to a live Cloudflare account (deferred to the cloudflare-migration spec).

**Tech Stack:** Node ESM (`scripts/render-site.mjs`), Python (`scripts/generate-audio.py`), Cloudflare Workers (TypeScript/ESM), Cloudflare D1 (SQLite), Wrangler CLI, Vitest + `@cloudflare/vitest-pool-workers`, GitHub Actions YAML.

---

## File map

**New files (worker):**
- `worker/index.ts` — Worker entry; routes all `/api/*` paths
- `worker/lib/db.ts` — D1 query helpers (subscribers, favourites, magic_links)
- `worker/lib/auth.ts` — Session cookie sign/verify (HMAC), magic-link token generation
- `worker/lib/email.ts` — Resend API caller (send magic-link email)
- `worker/lib/beehiiv.ts` — Beehiiv Subscribe + Post API callers (stubbed via env flag)
- `worker/routes/subscribe.ts` — `POST /api/subscribe`
- `worker/routes/sync-favourites.ts` — `POST /api/sync-favourites`
- `worker/routes/auth-verify.ts` — `GET /api/auth/verify`
- `worker/routes/favourites.ts` — `GET|POST|DELETE /api/favourites`
- `worker/routes/account.ts` — `POST /api/account/unsubscribe`, `POST /api/account/delete`, `PUT /api/account/language`
- `worker/routes/webhooks.ts` — `POST /api/webhooks/beehiiv`
- `worker/types.ts` — Shared TypeScript types (Env, Subscriber, etc.)
- `wrangler.toml` — Wrangler config (dev environment only; no prod binding)
- `migrations/0001_initial_schema.sql` — D1 schema (subscribers, favourites, magic_links + indexes)

**New files (renderer extensions):**
- `scripts/lib/editorial.mjs` — Helpers: render Editor's Cut commentary HTML for a card
- `scripts/lib/translations.mjs` — Helpers: generate `/articles/<slug>/` page HTML
- `scripts/lib/seo.mjs` — Helpers: sitemap.xml, news-sitemap.xml, robots.txt, JSON-LD, OG/Twitter meta, Atom feed
- `scripts/lib/email-template.mjs` — Helpers: render `email_en.html` and `email_zh.html` from editorial data
- `scripts/lib/article-id.mjs` — Shared `articleId(source, url)` function (stable hash)

**New files (pages):**
- `docs/favourites/index.html` — `/favourites` page (rendered by `render-site.mjs`)
- `docs/account/index.html` — `/account` page (rendered by `render-site.mjs`, flagged off in GH Pages build)
- `docs/articles/<slug>/index.html` — Per-article translation pages (generated per build)

**New files (tests):**
- `tests/lib/article-id.test.mjs` — Unit tests for `articleId()`
- `tests/lib/editorial.test.mjs` — Unit tests for `renderEditorialCut()`
- `tests/lib/translations.test.mjs` — Unit tests for `renderTranslationPage()`
- `tests/lib/seo.test.mjs` — Unit tests for sitemap, Atom feed, JSON-LD, OG helpers
- `tests/lib/email-template.test.mjs` — Unit tests for email body renderers
- `tests/worker/subscribe.test.ts` — Integration tests for `POST /api/subscribe`
- `tests/worker/sync-favourites.test.ts` — Integration tests for `POST /api/sync-favourites`
- `tests/worker/auth-verify.test.ts` — Integration tests for `GET /api/auth/verify`
- `tests/worker/favourites.test.ts` — Integration tests for favourites CRUD routes
- `tests/worker/account.test.ts` — Integration tests for account routes
- `tests/worker/webhooks.test.ts` — Integration tests for Beehiiv webhook
- `tests/worker/auth.test.ts` — Unit tests for HMAC session cookie and token generation
- `tests/render/editors-cut.test.mjs` — Render integration tests: Editor's Cut HTML on cards
- `tests/render/translation-pages.test.mjs` — Render integration tests: `/articles/<slug>/` page shape
- `tests/render/seo-pages.test.mjs` — Render integration tests: sitemap, feed, robots output
- `tests/render/favourites-page.test.mjs` — Render integration tests: `/favourites` page states
- `tests/render/account-page.test.mjs` — Render integration tests: `/account` page (flag-gated)
- `tests/render/feature-flag.test.mjs` — Render integration test: `BACKEND_LIVE=false` hides backend UI

**Modified files:**
- `scripts/render-site.mjs` — Add editorial commentary, translation page generation, SEO/feed output, `/favourites` page, `/account` page, feature-flag guard, Atom feed autodiscovery link in `<head>` of every page, `articleId()` usage for `data-article-id` on cards
- `data/claude-summaries.json` — Schema extended (editorial.overall_en/zh, editorial.cuts[], translations[]) — format change only; the routine writes this, tests use fixtures
- `.github/workflows/*.yml` — Add `BACKEND_LIVE=false` env var to GH Pages deploy step; add email-render + Beehiiv POST step (stubbed) to fast-path workflow
- `vitest.config.mjs` — Add `@cloudflare/vitest-pool-workers` pool config for Worker tests

---

## Phase A — Local test harness

### Task A1: Add `@cloudflare/vitest-pool-workers` to vitest config

**Files:**
- Modify: `vitest.config.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test (canary)**

Create `tests/worker/canary.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
describe('worker test pool', () => {
  it('executes in worker environment', () => {
    expect(typeof Request).toBe('function'); // Web Fetch API available
  });
});
```

- [ ] **Step 2: Run test — expect FAIL** (pool not configured yet)

```bash
npx vitest run tests/worker/canary.test.ts
```
Expected: FAIL — either "Request is not defined" or pool not found.

- [ ] **Step 3: Install pool workers package**

```bash
npm install --save-dev @cloudflare/vitest-pool-workers wrangler
```

- [ ] **Step 4: Update vitest.config.mjs**

```js
import { defineConfig } from 'vitest/config';
import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{js,mjs,ts}', 'scripts/**/*.test.{js,mjs,ts}'],
    exclude: ['node_modules/**', 'docs/**', 'data/**'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/**', 'docs/**', 'data/**', '**/*.config.*', 'tests/fixtures/**'],
    },
    projects: [
      {
        test: {
          name: 'node',
          include: ['tests/lib/**/*.test.{js,mjs}', 'tests/render/**/*.test.{js,mjs}'],
          environment: 'node',
        },
      },
      defineWorkersConfig({
        test: {
          name: 'worker',
          include: ['tests/worker/**/*.test.ts'],
          poolOptions: {
            workers: {
              wrangler: { configPath: './wrangler.toml' },
              miniflare: {
                d1Databases: { DB: 'test-db' },
              },
            },
          },
        },
      }),
    ],
  },
});
```

- [ ] **Step 5: Run canary test — expect PASS**

```bash
npx vitest run tests/worker/canary.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add vitest.config.mjs package.json package-lock.json tests/worker/canary.test.ts
git commit -m "test(harness): configure vitest worker pool for Cloudflare Worker tests"
```

---

### Task A2: Create test fixture for extended `claude-summaries.json` schema

**Files:**
- Create: `tests/fixtures/summaries-with-editorial.json`
- Create: `tests/fixtures/summaries-minimal.json`

- [ ] **Step 1: Create fixtures directory and minimal fixture**

`tests/fixtures/summaries-minimal.json`:
```json
{
  "date": "2026-05-17",
  "sections": {
    "models": [
      { "article_id": "aihot-a3f12b8c", "title": "Claude 4.7 launches", "summary": "Anthropic shipped Claude 4.7.", "url": "https://www.aihot.com/a/1", "source": "AIHOT", "publishedAt": "2026-05-17T10:00:00Z", "source_lang": "zh" }
    ],
    "products": []
  }
}
```

- [ ] **Step 2: Create full fixture with editorial + translations**

`tests/fixtures/summaries-with-editorial.json` — includes `editorial.overall_en`, `editorial.overall_zh`, `editorial.cuts` (array with `article_id`, `commentary_en`, `commentary_zh`), `translations` (array with `article_id`, `slug`, `excerpt_en`, `paragraphs`). Use two cut articles and one translation entry for test coverage.

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/
git commit -m "test(fixtures): add claude-summaries fixture files for editorial and translation schema"
```

---

## Phase B — Backend skeleton

### Task B1: `wrangler.toml` and Worker entry

**Files:**
- Create: `wrangler.toml`
- Create: `worker/index.ts`
- Create: `worker/types.ts`

- [ ] **Step 1: Write failing test**

`tests/worker/canary.test.ts` (extend):
```ts
import { SELF } from 'cloudflare:test';
it('returns 404 for unknown paths', async () => {
  const res = await SELF.fetch('http://localhost/unknown');
  expect(res.status).toBe(404);
});
```

- [ ] **Step 2: Run — expect FAIL** (no worker file yet)

- [ ] **Step 3: Create `wrangler.toml`**

```toml
name = "ai-daily-digest-api"
main = "worker/index.ts"
compatibility_date = "2024-09-23"

[[d1_databases]]
binding = "DB"
database_name = "ai-daily-digest-dev"
database_id = "local"

[vars]
BACKEND_LIVE = "false"
```

- [ ] **Step 4: Create `worker/types.ts`**

```ts
export interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  RESEND_API_KEY: string;
  BEEHIIV_API_KEY: string;
  BEEHIIV_PUB_ID: string;
  SITE_ORIGIN: string;
}
```

- [ ] **Step 5: Create `worker/index.ts`**

```ts
import type { Env } from './types';
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 });
    }
    return new Response('Not implemented', { status: 501 });
  },
};
```

- [ ] **Step 6: Run test — expect PASS**

- [ ] **Step 7: Commit**

```bash
git add wrangler.toml worker/index.ts worker/types.ts
git commit -m "feat(worker): scaffold Wrangler config and Worker entry with /api/* routing skeleton"
```

---

### Task B2: D1 schema migrations

**Files:**
- Create: `migrations/0001_initial_schema.sql`
- Create: `tests/worker/db.test.ts`

- [ ] **Step 1: Write failing test**

`tests/worker/db.test.ts`:
```ts
import { env } from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(async () => {
  const sql = await import('node:fs/promises').then(f => f.readFile('./migrations/0001_initial_schema.sql', 'utf8'));
  await env.DB.exec(sql);
});

describe('D1 schema', () => {
  it('can insert and retrieve a subscriber', async () => {
    await env.DB.prepare('INSERT INTO subscribers (email) VALUES (?)').bind('test@example.com').run();
    const row = await env.DB.prepare('SELECT email, language FROM subscribers WHERE email = ?').bind('test@example.com').first();
    expect(row?.email).toBe('test@example.com');
    expect(row?.language).toBe('en');
  });
  it('can insert favourites with FK constraint', async () => {
    await env.DB.prepare('INSERT INTO favourites (email, article_id) VALUES (?, ?)').bind('test@example.com', 'aihot-a3f12b8c').run();
    const row = await env.DB.prepare('SELECT article_id FROM favourites WHERE email = ?').bind('test@example.com').first();
    expect(row?.article_id).toBe('aihot-a3f12b8c');
  });
  it('can insert and expire magic links', async () => {
    await env.DB.prepare('INSERT INTO magic_links (token, email, purpose, expires_at) VALUES (?, ?, ?, ?)').bind('abc123', 'test@example.com', 'subscribe', new Date(Date.now() + 1800000).toISOString()).run();
    const row = await env.DB.prepare('SELECT purpose FROM magic_links WHERE token = ?').bind('abc123').first();
    expect(row?.purpose).toBe('subscribe');
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (no migration file)

- [ ] **Step 3: Create `migrations/0001_initial_schema.sql`** (exact schema from spec Data model section)

- [ ] **Step 4: Apply migration locally**

```bash
npx wrangler d1 migrations apply ai-daily-digest-dev --local
```

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add migrations/ tests/worker/db.test.ts
git commit -m "feat(db): D1 schema migration for subscribers, favourites, magic_links"
```

---

### Task B3: `worker/lib/auth.ts` — HMAC session cookie + magic-link token

**Files:**
- Create: `worker/lib/auth.ts`
- Create: `tests/worker/auth.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/worker/auth.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { signSession, verifySession, generateToken } from '../../worker/lib/auth';

const SECRET = 'test-secret-32-bytes-xxxxxxxxxxxxxxxxx';

describe('signSession / verifySession', () => {
  it('round-trips an email', async () => {
    const cookie = await signSession('user@example.com', SECRET);
    const email = await verifySession(cookie, SECRET);
    expect(email).toBe('user@example.com');
  });
  it('returns null for tampered cookie', async () => {
    const cookie = await signSession('user@example.com', SECRET) + 'tampered';
    expect(await verifySession(cookie, SECRET)).toBeNull();
  });
  it('returns null for expired cookie', async () => {
    const cookie = await signSession('user@example.com', SECRET, -1); // expired
    expect(await verifySession(cookie, SECRET)).toBeNull();
  });
});

describe('generateToken', () => {
  it('returns a 64-char hex string', () => {
    const t = generateToken();
    expect(t).toMatch(/^[0-9a-f]{64}$/);
  });
  it('generates unique tokens', () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `worker/lib/auth.ts`**

```ts
export function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function signSession(email: string, secret: string, expiresInDays = 30): Promise<string> {
  const expiresAt = new Date(Date.now() + expiresInDays * 86400 * 1000).toISOString();
  const payload = `${email}|${expiresAt}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const sigHex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return btoa(`${payload}|${sigHex}`);
}

export async function verifySession(cookie: string, secret: string): Promise<string | null> {
  try {
    const decoded = atob(cookie);
    const parts = decoded.split('|');
    if (parts.length !== 3) return null;
    const [email, expiresAt, sigHex] = parts;
    if (new Date(expiresAt) < new Date()) return null;
    const payload = `${email}|${expiresAt}`;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sig = Uint8Array.from(sigHex.match(/../g)!.map(h => parseInt(h, 16)));
    const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(payload));
    return valid ? email : null;
  } catch { return null; }
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add worker/lib/auth.ts tests/worker/auth.test.ts
git commit -m "feat(worker): HMAC session cookie sign/verify and magic-link token generator"
```

---

## Phase C — Magic-link auth + session

### Task C1: `POST /api/subscribe` route

**Files:**
- Create: `worker/lib/db.ts` (subscriber upsert)
- Create: `worker/lib/email.ts` (Resend stub)
- Create: `worker/routes/subscribe.ts`
- Modify: `worker/index.ts`
- Create: `tests/worker/subscribe.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/worker/subscribe.test.ts`:
```ts
import { SELF, env } from 'cloudflare:test';
import { beforeAll, describe, it, expect } from 'vitest';
// apply migration first
beforeAll(async () => { /* exec migration sql */ });

describe('POST /api/subscribe', () => {
  it('returns 400 for missing email', async () => {
    const res = await SELF.fetch('http://localhost/api/subscribe', { method: 'POST', body: JSON.stringify({ language: 'en' }), headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBe(400);
  });
  it('returns 400 for invalid email format', async () => {
    const res = await SELF.fetch('http://localhost/api/subscribe', { method: 'POST', body: JSON.stringify({ email: 'not-an-email', language: 'en' }), headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBe(400);
  });
  it('returns 200 and inserts pending subscriber for valid email', async () => {
    const res = await SELF.fetch('http://localhost/api/subscribe', { method: 'POST', body: JSON.stringify({ email: 'sub@example.com', language: 'en' }), headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBe(200);
    const row = await env.DB.prepare('SELECT email, verified_at FROM subscribers WHERE email = ?').bind('sub@example.com').first();
    expect(row?.email).toBe('sub@example.com');
    expect(row?.verified_at).toBeNull(); // not yet verified
    const link = await env.DB.prepare('SELECT purpose FROM magic_links WHERE email = ?').bind('sub@example.com').first();
    expect(link?.purpose).toBe('subscribe');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `worker/lib/db.ts`** (upsert subscriber, insert magic_link, get subscriber by email, update language, set unsubscribed_at, delete all rows for email)

- [ ] **Step 4: Implement `worker/lib/email.ts`** (Resend API caller; if `RESEND_API_KEY` is missing/test, log and no-op instead of throwing)

- [ ] **Step 5: Implement `worker/routes/subscribe.ts`** and wire into `worker/index.ts`

- [ ] **Step 6: Run tests — expect PASS**

- [ ] **Step 7: Commit**

```bash
git add worker/lib/db.ts worker/lib/email.ts worker/routes/subscribe.ts worker/index.ts tests/worker/subscribe.test.ts
git commit -m "feat(worker): POST /api/subscribe — upsert subscriber, insert magic link, send via Resend stub"
```

---

### Task C2: `GET /api/auth/verify` — consume magic link, set session cookie

**Files:**
- Create: `worker/routes/auth-verify.ts`
- Modify: `worker/index.ts`
- Create: `tests/worker/auth-verify.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/worker/auth-verify.test.ts`:
```ts
// Setup: insert subscriber + magic_link token with purpose='subscribe', expires 30min from now
// Test: GET /api/auth/verify?token=<valid> → 302 redirect to /account?welcome=1, Set-Cookie header present, subscriber.verified_at set
// Test: GET /api/auth/verify?token=<expired> → 400
// Test: GET /api/auth/verify?token=<consumed> → 400 (consumed_at already set)
// Test: GET /api/auth/verify?token=<unknown> → 404
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `worker/routes/auth-verify.ts`** — validate token, verify not expired/consumed, mark consumed, set verified_at on subscriber, set HMAC session cookie (30d, HttpOnly, Secure, SameSite=Lax), redirect based on purpose.

- [ ] **Step 4: Wire into `worker/index.ts`**

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add worker/routes/auth-verify.ts worker/index.ts tests/worker/auth-verify.test.ts
git commit -m "feat(worker): GET /api/auth/verify — consume magic link, issue session cookie, redirect by purpose"
```

---

### Task C3: `POST /api/sync-favourites` — restore-favourites magic link

**Files:**
- Create: `worker/routes/sync-favourites.ts`
- Modify: `worker/index.ts`
- Create: `tests/worker/sync-favourites.test.ts`

- [ ] **Step 1: Write failing tests** (parallel to subscribe tests; purpose='restore-favourites'; redirect to /favourites?welcome=1 after verify)

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement route** (reuses `db.ts` upsert, `email.ts` send, same token generation)

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add worker/routes/sync-favourites.ts worker/index.ts tests/worker/sync-favourites.test.ts
git commit -m "feat(worker): POST /api/sync-favourites — send restore-favourites magic link"
```

---

## Phase D — Subscribers / favourites / language API routes

### Task D1: Favourites CRUD routes

**Files:**
- Create: `worker/routes/favourites.ts`
- Modify: `worker/index.ts`
- Create: `tests/worker/favourites.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/worker/favourites.test.ts` — cover:
- `GET /api/favourites` with no cookie → 401
- `GET /api/favourites` with valid session → 200 `{ article_ids: [] }`
- `POST /api/favourites` `{ article_id }` → 201, row in DB
- `POST /api/favourites` duplicate → 200 (idempotent)
- `DELETE /api/favourites/aihot-a3f12b8c` → 200, row gone
- `DELETE /api/favourites/nonexistent` → 200 (idempotent)

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `worker/routes/favourites.ts`** — parse session cookie via `auth.verifySession`, all three HTTP methods, CORS header for site origin only.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add worker/routes/favourites.ts worker/index.ts tests/worker/favourites.test.ts
git commit -m "feat(worker): GET|POST|DELETE /api/favourites CRUD with session-cookie auth"
```

---

### Task D2: Account routes (unsubscribe, language, delete)

**Files:**
- Create: `worker/lib/beehiiv.ts`
- Create: `worker/routes/account.ts`
- Modify: `worker/index.ts`
- Create: `tests/worker/account.test.ts`

- [ ] **Step 1: Write failing tests** — cover:
- `POST /api/account/unsubscribe` (no cookie → 401; valid → 200, unsubscribed_at set)
- `PUT /api/account/language` `{ language: 'zh' }` (valid → 200, subscribers.language updated)
- `POST /api/account/delete` (valid → 200, all rows deleted, cookie cleared)

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `worker/lib/beehiiv.ts`** — Subscribe API caller and segment-move caller; if `BEEHIIV_API_KEY` absent, log + no-op (test safety).

- [ ] **Step 4: Implement `worker/routes/account.ts`** — all three routes, call beehiiv.ts for language change and delete.

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add worker/lib/beehiiv.ts worker/routes/account.ts worker/index.ts tests/worker/account.test.ts
git commit -m "feat(worker): account routes — unsubscribe, language update, GDPR delete"
```

---

### Task D3: Beehiiv unsubscribe webhook

**Files:**
- Create: `worker/routes/webhooks.ts`
- Modify: `worker/index.ts`
- Create: `tests/worker/webhooks.test.ts`

- [ ] **Step 1: Write failing test** — POST with Beehiiv-signed payload → sets unsubscribed_at; invalid signature → 401.

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement webhook route** — verify Beehiiv HMAC signature (use `BEEHIIV_WEBHOOK_SECRET` env var; skip if absent in test), parse event type `subscriber.unsubscribed`, call `db.setUnsubscribed()`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add worker/routes/webhooks.ts worker/index.ts tests/worker/webhooks.test.ts
git commit -m "feat(worker): POST /api/webhooks/beehiiv — sync unsubscribe events to D1"
```

---

## Phase E — Daily email render + Beehiiv POST step

### Task E1: Email template helpers

**Files:**
- Create: `scripts/lib/email-template.mjs`
- Create: `tests/lib/email-template.test.mjs`

- [ ] **Step 1: Write failing tests**

`tests/lib/email-template.test.mjs`:
```js
import { renderEmailEn, renderEmailZh } from '../../scripts/lib/email-template.mjs';
import summaries from '../fixtures/summaries-with-editorial.json' assert { type: 'json' };

describe('renderEmailEn', () => {
  it('contains editorial.overall_en text', () => {
    const html = renderEmailEn(summaries, 'https://example.com');
    expect(html).toContain(summaries.editorial.overall_en.slice(0, 30));
  });
  it('does NOT contain editorial.overall_zh text', () => {
    const html = renderEmailEn(summaries, 'https://example.com');
    expect(html).not.toContain(summaries.editorial.overall_zh.slice(0, 30));
  });
  it('contains subject in EN form', () => {
    const html = renderEmailEn(summaries, 'https://example.com');
    expect(html).toContain('AI Daily Digest');
  });
  it('has Beehiiv unsubscribe placeholder', () => {
    const html = renderEmailEn(summaries, 'https://example.com');
    expect(html).toContain('{{ beehiiv_unsubscribe_url }}');
  });
  it('output matches email-en mockup structure', () => {
    const html = renderEmailEn(summaries, 'https://example.com');
    // must include inline table layout, data-testid="email-body"
    expect(html).toContain('data-testid="email-body"');
  });
});

describe('renderEmailZh', () => {
  it('contains editorial.overall_zh text', () => {
    const html = renderEmailZh(summaries, 'https://example.com');
    expect(html).toContain(summaries.editorial.overall_zh.slice(0, 10));
  });
  it('subject is in Chinese', () => {
    const html = renderEmailZh(summaries, 'https://example.com');
    expect(html).toContain('AI 每日精选');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `scripts/lib/email-template.mjs`**

Implement `renderEmailEn(summaries, siteOrigin)` and `renderEmailZh(summaries, siteOrigin)` producing inline-style HTML matching the structure in mockups `27-email-en.html` and `28-email-zh.html`. Hero section, Editor's Cut narrative, cut articles list with accent border-left, footer with Beehiiv unsubscribe placeholder. Inline styles only (no external CSS references).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/email-template.mjs tests/lib/email-template.test.mjs
git commit -m "feat(email): bilingual email template helpers matching mockups 27-28"
```

---

### Task E2: GHA fast-path step for Beehiiv POST (stubbed)

**Files:**
- Modify: `.github/workflows/*.yml` (fast-path workflow — add render-email + Beehiiv post step)
- Create: `scripts/post-to-beehiiv.mjs`
- Create: `tests/lib/post-to-beehiiv.test.mjs`

- [ ] **Step 1: Write failing test**

`tests/lib/post-to-beehiiv.test.mjs`:
```js
import { buildBeehiivPayload } from '../../scripts/post-to-beehiiv.mjs';
import summaries from '../fixtures/summaries-with-editorial.json' assert { type: 'json' };

describe('buildBeehiivPayload', () => {
  it('builds EN payload with correct content_html', () => {
    const p = buildBeehiivPayload('en', summaries, 'https://example.com');
    expect(p.content_html).toContain('data-testid="email-body"');
    expect(p.subject).toContain('AI Daily Digest');
    expect(p.audience_segment_id).toBeDefined();
  });
  it('builds ZH payload with Chinese subject', () => {
    const p = buildBeehiivPayload('zh', summaries, 'https://example.com');
    expect(p.subject).toContain('AI 每日精选');
  });
  it('throws if editorial data is missing', () => {
    expect(() => buildBeehiivPayload('en', {}, 'https://example.com')).toThrow();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `scripts/post-to-beehiiv.mjs`** — `buildBeehiivPayload(lang, summaries, siteOrigin)` builds the Beehiiv Post API payload; a `postToBeehiiv(lang, summaries, apiKey, pubId, siteOrigin)` function that calls the API (skip if `BEEHIIV_API_KEY` absent). Script is runnable as `node scripts/post-to-beehiiv.mjs en` and reads `data/claude-summaries.json` from disk.

- [ ] **Step 4: Add step to fast-path GHA workflow**

```yaml
- name: Render and post daily email to Beehiiv
  if: env.BEEHIIV_API_KEY != ''
  run: |
    node scripts/post-to-beehiiv.mjs en
    node scripts/post-to-beehiiv.mjs zh
  env:
    BEEHIIV_API_KEY: ${{ secrets.BEEHIIV_API_KEY }}
    BEEHIIV_PUB_ID: ${{ secrets.BEEHIIV_PUB_ID }}
    SITE_ORIGIN: ${{ vars.SITE_ORIGIN }}
```

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add scripts/post-to-beehiiv.mjs tests/lib/post-to-beehiiv.test.mjs .github/workflows/
git commit -m "feat(email): Beehiiv Post API step in fast-path workflow (no-op when key absent)"
```

---

## Phase F — Renderer changes (editorial, language model, favourites star)

### Task F1: `articleId()` stable hash helper

**Files:**
- Create: `scripts/lib/article-id.mjs`
- Create: `tests/lib/article-id.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
import { articleId } from '../../scripts/lib/article-id.mjs';

describe('articleId', () => {
  it('produces "<source>-<8-char-hex>" format', () => {
    const id = articleId('aihot', 'https://www.aihot.com/articles/claude-4-7');
    expect(id).toMatch(/^aihot-[0-9a-f]{8}$/);
  });
  it('is stable across calls with same inputs', () => {
    const a = articleId('simon', 'https://simonwillison.net/2026/may/prompt-caching');
    const b = articleId('simon', 'https://simonwillison.net/2026/may/prompt-caching');
    expect(a).toBe(b);
  });
  it('differs for different URLs', () => {
    expect(articleId('aihot', 'https://a.com/1')).not.toBe(articleId('aihot', 'https://a.com/2'));
  });
  it('lowercases source prefix', () => {
    expect(articleId('AIHOT', 'https://x.com')).toMatch(/^aihot-/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `scripts/lib/article-id.mjs`** — djb2 or FNV-1a hash of URL, take first 8 hex chars; prefix with `source.toLowerCase()`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/article-id.mjs tests/lib/article-id.test.mjs
git commit -m "feat(renderer): articleId() stable hash helper for localStorage and D1 keying"
```

---

### Task F2: Editor's Cut commentary HTML helper

**Files:**
- Create: `scripts/lib/editorial.mjs`
- Create: `tests/lib/editorial.test.mjs`

- [ ] **Step 1: Write failing tests**

`tests/lib/editorial.test.mjs`:
```js
import { renderEditorialCutBox } from '../../scripts/lib/editorial.mjs';

const cut = { article_id: 'aihot-a3f12b8c', commentary_en: 'EN comment text.', commentary_zh: 'ZH comment text.' };

describe('renderEditorialCutBox', () => {
  it('renders EN box with data-lang=en when commentary_en present', () => {
    const html = renderEditorialCutBox(cut);
    expect(html).toContain('data-testid="editors-cut"');
    expect(html).toContain('🏅 Editor\'s Cut');
    expect(html).toContain('EN comment text.');
    expect(html).toContain('data-commentary-source="commentary_en"');
  });
  it('includes commentary_zh in data attribute for language switch', () => {
    const html = renderEditorialCutBox(cut);
    expect(html).toContain('commentary_zh');
  });
  it('renders fallback tag when commentary_zh missing', () => {
    const html = renderEditorialCutBox({ ...cut, commentary_zh: undefined });
    expect(html).toContain('ec-fallback-tag');
    expect(html).toContain('(English only today)');
  });
  it('returns empty string for non-cut article (no cut object)', () => {
    expect(renderEditorialCutBox(null)).toBe('');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `scripts/lib/editorial.mjs`** — `renderEditorialCutBox(cut | null)` returns `<aside class="editors-cut" data-testid="editors-cut" ...>` matching mockup `23-editors-cut-cut-with-en-commentary.html`; handles ZH fallback per mockup `25-editors-cut-cut-zh-fallback-to-en.html`; returns `''` when cut is null (mockup `26-editors-cut-not-cut-no-box.html`).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/editorial.mjs tests/lib/editorial.test.mjs
git commit -m "feat(renderer): Editor's Cut commentary box HTML helper with EN/ZH/fallback support"
```

---

### Task F3: Wire editorial commentary + favourites star + language model into `render-site.mjs`

**Files:**
- Modify: `scripts/render-site.mjs`
- Create: `tests/render/editors-cut.test.mjs`
- Create: `tests/render/feature-flag.test.mjs`

**Before modifying `render-site.mjs`: run `gitnexus_impact` on `aihotItemsCard` and other card-building functions to understand blast radius.**

- [ ] **Step 1: Write failing tests**

`tests/render/editors-cut.test.mjs`:
```js
// Render with summaries-with-editorial fixture, check rendered HTML:
// - cut article card contains <aside class="editors-cut">
// - non-cut article card does NOT contain <aside class="editors-cut">
// - card with cut article has data-article-id attribute set
// - card has .fav-star button with aria-pressed="false" and data-testid="fav-star"
```

`tests/render/feature-flag.test.mjs`:
```js
// Render with BACKEND_LIVE=false (default):
// - rendered HTML does NOT contain data-testid="subscribe-form"
// - rendered HTML does NOT contain data-testid="account-page"
// - rendered HTML does NOT contain "sync-prompt"
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Modify `render-site.mjs`** — in `aihotItemsCard()` and related card builders:
  - Add `data-article-id="${articleId(source, url)}"` on each `<article>` element
  - Add `<button class="fav-star" type="button" aria-pressed="false" aria-label="Save article" title="Save" data-testid="fav-star" data-article-id="${...}">☆</button>` as first child
  - Look up article in `editorial.cuts` array; if found, append `renderEditorialCutBox(cut)` after card body
  - Language model: anonymous = no localStorage write; remove the `localStorage.setItem('lang', ...)` call from the front-end JS block; keep the toggle working for the session only

- [ ] **Step 4: Add `BACKEND_LIVE` feature flag guard** — read `process.env.BACKEND_LIVE === 'true'`; when false, omit subscribe form section and account page link from rendered HTML

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add scripts/render-site.mjs tests/render/editors-cut.test.mjs tests/render/feature-flag.test.mjs
git commit -m "feat(renderer): editorial commentary boxes, fav-star buttons, BACKEND_LIVE feature flag"
```

---

## Phase G — `/favourites` and `/account` pages

### Task G1: `/favourites` page

**Files:**
- Modify: `scripts/render-site.mjs` (add `renderFavouritesPage()` call)
- Create: `scripts/lib/favourites-page.mjs`
- Create: `tests/render/favourites-page.test.mjs`

- [ ] **Step 1: Write failing tests**

`tests/render/favourites-page.test.mjs`:
```js
// Render with BACKEND_LIVE=false:
// - docs/favourites/index.html exists after render
// - contains data-testid="favourites-page" with data-backend-live="false"
// - does NOT contain data-testid="sync-prompt"
// - empty state shows "No favourites yet" (matches mockup 09)
// - populated state: when called with saves, shows data-testid="fav-star" (matches mockup 10)
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `scripts/lib/favourites-page.mjs`** — `renderFavouritesPage(opts)` where opts includes `backendLive`, `savedArticles` (empty for static build). Structure matches mockups `09-favourites-ghpages-empty-no-saves.html` and `10-favourites-ghpages-populated.html` for GH Pages build. Include sync-prompt section (hidden via `data-backend-live` flag) for Cloudflare build targeting mockups `11` and `12`. Sync-prompt states from mockups `13-16` are client-side JS, not server-rendered — include the collapsed shell only.

- [ ] **Step 4: Wire `renderFavouritesPage()` into `render-site.mjs`**, write to `docs/favourites/index.html`

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/favourites-page.mjs tests/render/favourites-page.test.mjs scripts/render-site.mjs
git commit -m "feat(renderer): /favourites page with GH-Pages and Cloudflare states per mockups 09-16"
```

---

### Task G2: `/account` page (feature-flag gated)

**Files:**
- Modify: `scripts/render-site.mjs`
- Create: `scripts/lib/account-page.mjs`
- Create: `tests/render/account-page.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
// BACKEND_LIVE=false: docs/account/index.html NOT written (or written as redirect-only)
// BACKEND_LIVE=true: docs/account/index.html exists with data-testid="account-page"
// - linked-active state: newsletter-status "Subscribed", lang-pref toggle present (mockup 17)
// - linked-unsubscribed state: newsletter-status "Unsubscribed", resubscribe button (mockup 18)
// - delete-confirm-modal-closed: modal NOT present in initial HTML (mockup 22)
// Modal open (mockup 21) and language-saving/saved-toast (mockups 19-20) are client-side transitions
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `scripts/lib/account-page.mjs`** matching mockups `17-22`. Static HTML shell only; dynamic states (language-saving spinner, toast, modal open) driven by client JS.

- [ ] **Step 4: Wire into `render-site.mjs`** behind `BACKEND_LIVE` flag

- [ ] **Step 5: Run tests — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/account-page.mjs tests/render/account-page.test.mjs scripts/render-site.mjs
git commit -m "feat(renderer): /account page shell gated behind BACKEND_LIVE flag per mockups 17-22"
```

---

## Phase H — CN-translation pages + `/articles/<slug>/` route

### Task H1: Translation page HTML helper

**Files:**
- Create: `scripts/lib/translations.mjs`
- Create: `tests/lib/translations.test.mjs`

- [ ] **Step 1: Write failing tests**

`tests/lib/translations.test.mjs`:
```js
import { renderTranslationPage, translationSlug } from '../../scripts/lib/translations.mjs';

describe('translationSlug', () => {
  it('produces "<source>-<title-kebab>-<8-char-hash>" format', () => {
    const s = translationSlug('aihot', 'Claude 4.7 Launch', 'https://aihot.com/1');
    expect(s).toMatch(/^aihot-claude-4-7-launch-[0-9a-f]{8}$/);
  });
  it('is stable across calls', () => {
    const a = translationSlug('aihot', 'Claude 4.7', 'https://x.com');
    const b = translationSlug('aihot', 'Claude 4.7', 'https://x.com');
    expect(a).toBe(b);
  });
});

describe('renderTranslationPage', () => {
  const article = { title: 'Claude 4.7', source: 'AIHOT', originalUrl: 'https://aihot.com/1', publishedAt: '2026-05-17', excerpt_en: 'Para 1.\nPara 2.\nPara 3.', slug: 'aihot-claude-4-7-launch-a3f12b8c' };
  it('renders populated page matching mockup 29', () => {
    const html = renderTranslationPage(article, { siteOrigin: 'https://example.com' });
    expect(html).toContain('data-testid="translation-article"');
    expect(html).toContain('Read original (中文) →');
    expect(html).toContain('data-testid="read-original-cta"');
    expect(html).toContain(article.excerpt_en.slice(0, 10));
    // canonical + hreflang in head
    expect(html).toContain('<link rel="canonical"');
    expect(html).toContain('hreflang="zh"');
    expect(html).toContain('hreflang="en"');
    // NewsArticle JSON-LD
    expect(html).toContain('"@type":"NewsArticle"');
    expect(html).toContain('"isBasedOn"');
    // Atom autodiscovery
    expect(html).toContain('application/atom+xml');
  });
  it('renders placeholder page for missing excerpt (mockup 30)', () => {
    const html = renderTranslationPage({ ...article, excerpt_en: null }, { siteOrigin: 'https://example.com' });
    expect(html).toContain('data-testid="translation-placeholder"');
    expect(html).toContain('Translation pending');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `scripts/lib/translations.mjs`**

`translationSlug(source, title, url)` — kebab the title (strip punctuation, split on spaces, join with `-`), take first 5 parts max, suffix with 8-char URL hash.

`renderTranslationPage(article, opts)` — full HTML page matching mockup `29-article-translation-populated.html` when `excerpt_en` present; matches mockup `30-article-translation-pending-placeholder.html` when `excerpt_en` is null/empty. Must include: canonical pointing to CN source, hreflang EN+ZH, NewsArticle JSON-LD with `isBasedOn`, Atom autodiscovery `<link>`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/translations.mjs tests/lib/translations.test.mjs
git commit -m "feat(renderer): translation page helper with slug, SEO head, NewsArticle JSON-LD (mockups 29-30)"
```

---

### Task H2: Wire translation page generation into `render-site.mjs`

**Files:**
- Modify: `scripts/render-site.mjs`
- Create: `tests/render/translation-pages.test.mjs`

**Before editing `render-site.mjs`: run gitnexus_impact on the main render function.**

- [ ] **Step 1: Write failing test**

```js
// After render with summaries-with-editorial fixture:
// - docs/articles/aihot-<slug>/index.html exists
// - file contains data-testid="translation-article"
// - CN article card title links to /articles/<slug>/ not to original URL when lang=en
// - card title links to original CN URL when data-lang="zh" is active (data attribute on link)
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Modify `render-site.mjs`**:
  - Import `renderTranslationPage`, `translationSlug` from `./lib/translations.mjs`
  - After main pages rendered: loop `summaries.translations[]`, call `renderTranslationPage()`, write to `docs/articles/<slug>/index.html`
  - In card rendering for CN-source articles (source_lang === 'zh'): title link `href` gets a `data-en-href="/articles/<slug>/"` and `data-zh-href="<original-url>"` attributes; front-end JS switches the active href on language toggle

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/render-site.mjs tests/render/translation-pages.test.mjs
git commit -m "feat(renderer): generate /articles/<slug>/ pages for CN translations; cards link to them in EN mode"
```

---

## Phase I — SEO bundle

### Task I1: SEO helpers (sitemap, news-sitemap, robots, JSON-LD, OG/Twitter meta)

**Files:**
- Create: `scripts/lib/seo.mjs`
- Create: `tests/lib/seo.test.mjs`

- [ ] **Step 1: Write failing tests**

`tests/lib/seo.test.mjs`:
```js
import { renderSitemap, renderNewsSitemap, renderRobotsTxt, renderItemListJsonLd, renderNewsArticleJsonLd, renderOgMeta } from '../../scripts/lib/seo.mjs';

describe('renderSitemap', () => {
  const pages = ['/', '/digests/2026-05-17.html', '/articles/aihot-test-a1b2c3d4/', '/favourites', '/account', '/feed.xml'];
  it('produces valid sitemap XML structure', () => {
    const xml = renderSitemap(pages, 'https://example.com');
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<urlset');
    pages.forEach(p => expect(xml).toContain(p === '/' ? 'https://example.com/' : `https://example.com${p}`));
  });
});

describe('renderNewsSitemap', () => {
  const articles = [
    { slug: 'aihot-claude-4-7-launch-a3f12b8c', title: 'Claude 4.7 Launch', publishedAt: '2026-05-17T10:00:00Z', source: 'AIHOT' },
    { slug: 'aihot-deepseek-r3-7c3e9d1a', title: 'DeepSeek R3', publishedAt: '2026-05-17T11:30:00Z', source: 'AIHOT' },
  ];
  it('produces valid news sitemap XML with news namespace', () => {
    const xml = renderNewsSitemap(articles, 'https://example.com');
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"');
    expect(xml).toContain('<news:news>');
  });
  it('includes one <url> entry per article with correct loc', () => {
    const xml = renderNewsSitemap(articles, 'https://example.com');
    expect(xml).toContain('https://example.com/articles/aihot-claude-4-7-launch-a3f12b8c/');
    expect(xml).toContain('https://example.com/articles/aihot-deepseek-r3-7c3e9d1a/');
    expect((xml.match(/<url>/g) || []).length).toBe(2);
  });
  it('includes news:publication_date and news:title per entry', () => {
    const xml = renderNewsSitemap(articles, 'https://example.com');
    expect(xml).toContain('<news:publication_date>2026-05-17T10:00:00Z</news:publication_date>');
    expect(xml).toContain('<news:title>Claude 4.7 Launch</news:title>');
  });
  it('includes news:publication name and language', () => {
    const xml = renderNewsSitemap(articles, 'https://example.com');
    expect(xml).toContain('<news:publication>');
    expect(xml).toContain('<news:name>AI Daily Digest</news:name>');
    expect(xml).toContain('<news:language>en</news:language>');
  });
  it('returns valid empty sitemap when no articles', () => {
    const xml = renderNewsSitemap([], 'https://example.com');
    expect(xml).toContain('<urlset');
    expect((xml.match(/<url>/g) || []).length).toBe(0);
  });
});

describe('renderRobotsTxt', () => {
  it('allows all crawlers and references sitemap', () => {
    const txt = renderRobotsTxt('https://example.com');
    expect(txt).toContain('User-agent: *');
    expect(txt).toContain('Allow: /');
    expect(txt).toContain('Sitemap: https://example.com/sitemap.xml');
  });
});

describe('renderItemListJsonLd', () => {
  it('produces @type ItemList with correct items', () => {
    const ld = renderItemListJsonLd([{ title: 'A', url: 'https://x.com' }], 'https://example.com', '2026-05-17');
    const obj = JSON.parse(ld.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1]);
    expect(obj['@type']).toBe('ItemList');
    expect(obj.itemListElement[0]['@type']).toBe('ListItem');
  });
});

describe('renderOgMeta', () => {
  it('includes og:title, og:type, og:image, twitter:card', () => {
    const meta = renderOgMeta({ title: 'Test', url: 'https://x.com/p', description: 'Desc', imageUrl: 'https://x.com/img.png' });
    expect(meta).toContain('og:title');
    expect(meta).toContain('og:image');
    expect(meta).toContain('twitter:card');
  });
});

describe('renderCanonicalLink', () => {
  // Helper that returns the single canonical <link> tag for a page URL.
  // Per D7: every page emits a canonical link to its own URL.
  // Per D6: translation pages override this to point to the CN source — handled in translations.mjs, NOT here.
  it('produces a canonical link tag for the given page url', () => {
    const tag = renderCanonicalLink('https://example.com/digests/2026-05-17.html');
    expect(tag).toBe('<link rel="canonical" href="https://example.com/digests/2026-05-17.html">');
  });
  it('preserves trailing slash for index routes', () => {
    expect(renderCanonicalLink('https://example.com/')).toContain('href="https://example.com/"');
    expect(renderCanonicalLink('https://example.com/favourites')).toContain('href="https://example.com/favourites"');
  });
  it('escapes special characters in URL', () => {
    const tag = renderCanonicalLink('https://example.com/path?q=1&x="y"');
    expect(tag).not.toContain('"y"');
    expect(tag).toContain('&amp;');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `scripts/lib/seo.mjs`** — six helpers: `renderSitemap`, `renderNewsSitemap`, `renderRobotsTxt`, `renderItemListJsonLd`, `renderNewsArticleJsonLd`, `renderOgMeta`, **`renderCanonicalLink(pageUrl)`** (returns `<link rel="canonical" href="...">`). OG image uses `imageUrl` parameter (caller passes placeholder or real logo path). News sitemap uses `<news:news>` namespace with `news:publication`, `news:name`, `news:language`, `news:publication_date`, `news:title`. JSON-LD NewsArticle includes `isBasedOn`, `author`, `datePublished`, `mainEntityOfPage`. `renderCanonicalLink` HTML-escapes special characters in the URL.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/seo.mjs tests/lib/seo.test.mjs
git commit -m "feat(seo): sitemap, news-sitemap, robots.txt, ItemList/NewsArticle JSON-LD, OG/Twitter meta helpers"
```

---

### Task I2: Wire SEO output into `render-site.mjs`

**Files:**
- Modify: `scripts/render-site.mjs`
- Create: `tests/render/seo-pages.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
// After render:
// - docs/sitemap.xml exists, contains <urlset>, lists /, digest pages, /feed.xml
// - docs/news-sitemap.xml exists with <news:news> namespace entries for article pages
// - docs/robots.txt exists, contains "Sitemap: "
// - docs/index.html contains <script type="application/ld+json"> with ItemList
// - docs/index.html contains og:title, og:image, twitter:card in <head>
// - docs/index.html <head> contains exactly one <link rel="alternate" type="application/atom+xml">
// - docs/index.html <head> contains <link rel="canonical" href="https://<domain>/">
// - docs/digests/YYYY-MM-DD.html <head> contains <link rel="canonical" href="https://<domain>/digests/YYYY-MM-DD.html">
// - docs/favourites/index.html <head> contains <link rel="canonical" href="https://<domain>/favourites">
// - docs/account/index.html <head> contains <link rel="canonical" href="https://<domain>/account"> (when BACKEND_LIVE=true)
// - docs/digests/YYYY-MM-DD.html contains ItemList JSON-LD
// - docs/articles/<slug>/index.html <head> has canonical (points to CN source per D6), hreflang, NewsArticle JSON-LD (covered by H1 tests — verify cross-reference only — translation pages are the ONLY exception; their canonical points to the CN source, not to themselves)
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Modify `render-site.mjs`**:
  - Inject OG + Twitter meta into `<head>` of every page via `renderOgMeta()`
  - Inject `renderItemListJsonLd()` into daily digest page `<head>`
  - Add `<link rel="alternate" type="application/atom+xml" title="AI Daily Digest" href="/feed.xml">` to every page `<head>` (exactly once)
  - **Inject `<link rel="canonical" href="<page-url>">` into `<head>` of every rendered HTML page** (home, digest pages, /favourites, /account, /digests/index.html). Use the page's own canonical URL on the configured site origin. Translation pages under `/articles/<slug>/` are handled separately by `renderTranslationPage()` (H1) — their canonical points to the CN source per D7/D6, NOT to themselves. The renderer MUST NOT double-inject canonical on translation pages.
  - After all HTML pages rendered: write `docs/sitemap.xml`, `docs/news-sitemap.xml`, `docs/robots.txt`

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/render-site.mjs tests/render/seo-pages.test.mjs
git commit -m "feat(renderer): emit sitemap.xml, news-sitemap.xml, robots.txt, OG meta, JSON-LD, Atom autodiscovery"
```

---

## Phase J — Atom feed

### Task J1: Atom feed helper

**Files:**
- Modify: `scripts/lib/seo.mjs` (add `renderAtomFeed()`)
- Modify: `tests/lib/seo.test.mjs`

- [ ] **Step 1: Write failing test**

Add to `tests/lib/seo.test.mjs`:
```js
import { renderAtomFeed } from '../../scripts/lib/seo.mjs';

describe('renderAtomFeed', () => {
  const digests = [
    { date: '2026-05-17', publishedAt: '2026-05-17T20:30:00Z', itemCount: 14, sourceCount: 8 },
    { date: '2026-05-16', publishedAt: '2026-05-16T20:30:00Z', itemCount: 87, sourceCount: 10 },
  ];
  it('produces valid Atom 1.0 XML', () => {
    const xml = renderAtomFeed(digests, 'https://example.com');
    expect(xml).toContain('xmlns="http://www.w3.org/2005/Atom"');
    expect(xml).toContain('<feed ');
    expect(xml).toContain('<entry>');
  });
  it('has one entry per digest', () => {
    const xml = renderAtomFeed(digests, 'https://example.com');
    expect((xml.match(/<entry>/g) || []).length).toBe(2);
  });
  it('entry titles are "AI Daily Digest — YYYY-MM-DD"', () => {
    const xml = renderAtomFeed(digests, 'https://example.com');
    expect(xml).toContain('<title>AI Daily Digest — 2026-05-17</title>');
  });
  it('summary does NOT contain editorial content', () => {
    const xml = renderAtomFeed(digests, 'https://example.com');
    expect(xml).toContain("Today's digest:");
    // editorial.overall_en never appears in feed
  });
  it('caps at 30 entries', () => {
    const many = Array.from({ length: 35 }, (_, i) => ({ date: `2026-05-${String(i+1).padStart(2,'0')}`, publishedAt: '2026-05-01T00:00:00Z', itemCount: 10, sourceCount: 5 }));
    const xml = renderAtomFeed(many, 'https://example.com');
    expect((xml.match(/<entry>/g) || []).length).toBeLessThanOrEqual(30);
  });
  it('entry ids are stable URNs', () => {
    const xml = renderAtomFeed(digests, 'https://example.com');
    expect(xml).toContain('<id>urn:ai-daily-digest:2026-05-17</id>');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `renderAtomFeed(digests, siteOrigin)`** in `scripts/lib/seo.mjs` matching D11 spec. Cap at 30 entries newest-first. No editorial content in `<summary>`. Feed `<id>` is `urn:ai-daily-digest:feed`. Each entry `<id>` is `urn:ai-daily-digest:YYYY-MM-DD`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/seo.mjs tests/lib/seo.test.mjs
git commit -m "feat(feed): Atom 1.0 feed helper — 30-entry cap, stable URN ids, no editorial content"
```

---

### Task J2: Wire Atom feed output into `render-site.mjs`

**Files:**
- Modify: `scripts/render-site.mjs`
- Modify: `tests/render/seo-pages.test.mjs`

- [ ] **Step 1: Extend failing test**

Add to `tests/render/seo-pages.test.mjs`:
```js
// docs/feed.xml exists after render
// docs/feed.xml passes basic Atom structure check (contains <feed>, <entry>, xmlns Atom)
// docs/feed.xml entry count equals number of digest files (or 30 if more)
// docs/feed.xml does NOT contain summaries.editorial.overall_en text
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Modify `render-site.mjs`** — collect all digest dates (from `docs/digests/` dir listing), call `renderAtomFeed()`, write `docs/feed.xml`.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/render-site.mjs tests/render/seo-pages.test.mjs
git commit -m "feat(renderer): emit docs/feed.xml Atom 1.0 feed from digest archive"
```

---

## Phase K — Routine prompt extension + token-budget guard

### Task K1: Extend `data/claude-summaries.json` schema documentation and token-budget guard

**Files:**
- Create: `scripts/lib/summaries-schema.mjs` — schema validator + budget-fallback normaliser
- Create: `tests/lib/summaries-schema.test.mjs`

- [ ] **Step 1: Write failing tests**

```js
import { normaliseSummaries } from '../../scripts/lib/summaries-schema.mjs';

describe('normaliseSummaries', () => {
  it('passes through complete editorial data unchanged', () => {
    const s = JSON.parse(JSON.stringify(require('../fixtures/summaries-with-editorial.json')));
    const out = normaliseSummaries(s);
    expect(out.editorial.overall_en).toBe(s.editorial.overall_en);
  });
  it('fills missing commentary_zh with EN fallback and sets fallback flag', () => {
    const s = { editorial: { overall_en: 'EN', overall_zh: 'ZH', cuts: [{ article_id: 'x', commentary_en: 'EN c', commentary_zh: undefined }] }, translations: [] };
    const out = normaliseSummaries(s);
    expect(out.editorial.cuts[0].commentary_zh_fallback).toBe(true);
    expect(out.editorial.cuts[0].commentary_zh).toBeUndefined(); // renderer handles fallback display
  });
  it('handles missing editorial block gracefully', () => {
    const out = normaliseSummaries({ sections: {} });
    expect(out.editorial).toBeUndefined();
    // renderer must handle undefined editorial without throwing
  });
  it('handles missing translations block gracefully', () => {
    const out = normaliseSummaries({ sections: {}, editorial: { overall_en: 'X', cuts: [] } });
    expect(out.translations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `scripts/lib/summaries-schema.mjs`** — `normaliseSummaries(raw)` coerces the extended schema, fills defaults, sets `commentary_zh_fallback: true` when ZH is absent (renderer uses this to show fallback tag matching mockup 25).

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/summaries-schema.mjs tests/lib/summaries-schema.test.mjs
git commit -m "feat(schema): summaries normaliser with token-budget fallback detection for editorial cuts"
```

---

### Task K2: Routine prompt extension documentation

**Files:**
- Create: `docs/specs/2026-05-17-routine-prompt-extension-spec.md` (inline reference for the new routine output schema for whoever updates the Claude routine)

This is a pure docs task — no test needed. Write a concise reference explaining the three new output blocks (`editorial.overall_en/zh`, `editorial.cuts[]`, `translations[]`), token budget priorities, and fallback rules per the spec's *Routine prompt extension* section.

**File-govern note (Step 2 audit LOW K2 fix):** The filename follows `YYYY-MM-DD-<descriptive-slug>-spec.md` convention required by `governance-file-placement.md`. Earlier draft was `docs/specs/routine-prompt-extension.md` (no date prefix, no `-spec.md` suffix) — fixed here. The file is a reference spec, not a plan or design, so `-spec.md` is the correct suffix.

- [ ] **Step 1: Write the doc**

- [ ] **Step 2: Commit**

```bash
git add docs/specs/2026-05-17-routine-prompt-extension-spec.md
git commit -m "docs(spec): routine prompt extension reference for editorial + translations output schema"
```

---

## Phase L — Feature flag wiring + GH Pages live verification

### Task L1: Add `BACKEND_LIVE=false` to GH Pages deploy step

**Files:**
- Modify: `.github/workflows/*.yml` (the GH Pages deploy workflow)

- [ ] **Step 1: Find and confirm the deploy step** (grep for `actions/deploy-pages` or `gh-pages` in workflow files)

- [ ] **Step 2: Write failing test**

```js
// tests/render/feature-flag.test.mjs already covers renderer output.
// This step: verify the workflow YAML contains BACKEND_LIVE=false.
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
it('GH Pages deploy step sets BACKEND_LIVE=false', () => {
  const wf = globSync('.github/workflows/*.yml').map(f => readFileSync(f, 'utf8')).join('\n');
  expect(wf).toContain('BACKEND_LIVE=false');
});
```

- [ ] **Step 3: Run — expect FAIL**

- [ ] **Step 4: Add `BACKEND_LIVE: "false"` to the render/deploy step env in the workflow YAML**

- [ ] **Step 5: Run test — expect PASS**

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/
git commit -m "ci: set BACKEND_LIVE=false in GH Pages deploy step to feature-flag off backend UI"
```

---

### Task L2: Full local smoke test + CI green gate

**Files:**
- No new files

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```
Expected: all tests PASS.

- [ ] **Step 2: Run renderer end-to-end**

```bash
BACKEND_LIVE=false node scripts/render-site.mjs
```
Expected: `docs/index.html`, `docs/sitemap.xml`, `docs/feed.xml`, `docs/robots.txt`, `docs/favourites/index.html`, `docs/articles/*/index.html` all written without errors.

- [ ] **Step 3: Verify feed.xml is valid Atom** (grep for required elements)

```bash
grep -c '<entry>' docs/feed.xml && grep -q 'xmlns="http://www.w3.org/2005/Atom"' docs/feed.xml && echo "OK"
```

- [ ] **Step 4: Verify sitemap.xml lists expected URLs**

```bash
grep -c '<url>' docs/sitemap.xml
```

- [ ] **Step 5: Verify no backend UI in rendered HTML when flag is off**

```bash
grep -c 'subscribe-form' docs/index.html || echo "0 — correct"
grep -c 'account-page' docs/index.html || echo "0 — correct"
```

- [ ] **Step 6: Commit final verification**

```bash
git add docs/ --dry-run  # review what's changed
git add docs/sitemap.xml docs/feed.xml docs/robots.txt docs/favourites/ docs/articles/
git commit -m "chore: regenerated static output with backend-and-editorial-layer features (BACKEND_LIVE=false)"
```

---

## Summary: file count and test coverage

| Phase | New files | Modified files | Test files |
|---|---|---|---|
| A | 1 (canary) + 2 fixtures | vitest.config.mjs, package.json | 1 |
| B | wrangler.toml, worker/index.ts, worker/types.ts, worker/lib/auth.ts, migrations/ | — | 2 |
| C | worker/lib/db.ts, worker/lib/email.ts, worker/routes/subscribe.ts, worker/routes/auth-verify.ts, worker/routes/sync-favourites.ts | worker/index.ts | 3 |
| D | worker/lib/beehiiv.ts, worker/routes/favourites.ts, worker/routes/account.ts, worker/routes/webhooks.ts | worker/index.ts | 3 |
| E | scripts/lib/email-template.mjs, scripts/post-to-beehiiv.mjs | .github/workflows | 2 |
| F | scripts/lib/article-id.mjs, scripts/lib/editorial.mjs | scripts/render-site.mjs | 3 |
| G | scripts/lib/favourites-page.mjs, scripts/lib/account-page.mjs | scripts/render-site.mjs | 2 |
| H | scripts/lib/translations.mjs | scripts/render-site.mjs | 2 |
| I | scripts/lib/seo.mjs | scripts/render-site.mjs | 2 |
| J | (extends seo.mjs) | scripts/render-site.mjs | 1 |
| K | scripts/lib/summaries-schema.mjs, docs/specs/2026-05-17-routine-prompt-extension-spec.md | — | 1 |
| L | — | .github/workflows | 1 |

**Total tasks: 23 (A1–A2, B1–B3, C1–C3, D1–D3, E1–E2, F1–F3, G1–G2, H1–H2, I1–I2, J1–J2, K1–K2, L1–L2)**

---

# /autoplan Review Pipeline

**Mode:** pipeline auto-accept (Step 3 of `/dev-pipeline`)
**Date:** 2026-05-17
**Codex availability:** `[codex-unavailable: binary not found]` — degraded to single-reviewer mode tagged `[subagent-only]` across all four phases. Decisions made by the autoplan principal voice using the 6 decision principles.
**Plan state at review start:** `feb5899` — 23 tasks, ~1458 lines.
**Restore point:** plan file is committed at `feb5899`. To roll back: `git checkout feb5899 -- docs/plans/2026-05-17-backend-and-editorial-layer-plan.md`.

---

## Phase 0 — Intake

**Plan summary:** Implement the full backend (Cloudflare Worker + D1), editorial layer (Editor's Cut bilingual commentary), CN→EN translation pages, SEO bundle (sitemaps, JSON-LD, OG, canonical, Atom feed), and favourites UI behind a feature flag. Backend code is written and locally tested; live site stays on GH Pages with `BACKEND_LIVE=false`. 23 TDD-shaped tasks across phases A–L. Code-complete deferred from the production cloudflare-migration spec.

**UI scope:** YES — 30 mockup files in `docs/designs/backend-and-editorial-layer/`, 9 surfaces with multiple visual states (subscribe form, fav star, /favourites, /account, Editor's Cut, daily email, translation page).

**DX scope:** YES — the renderer outputs (sitemap/feed/JSON-LD/canonical) form a developer-discoverable contract; the Worker API is itself a developer surface; the Beehiiv/Resend pipeline has env-var contracts; routine prompt extension is a contract for the routine author.

**Spec coverage pre-check:** ALL spec sections covered by plan tasks (per pipeline brief). No auto-deferrals required. `TODOS.md` not created.

---

## Phase 1 — CEO Review (Strategy & Scope)

### 1.0 Premise challenge

| # | Stated premise | Verdict | Notes |
|---|---|---|---|
| P1 | "Migrate from GH Pages to Cloudflare to enable identity + email + dynamic features" | ACCEPT | The constraint is real: GH Pages cannot host `/api/*` or D1. Free-tier Cloudflare is the lowest-risk landing zone for the target shape. |
| P2 | "Backend code + UI behind feature flag now; production migration deferred to a separate spec" | ACCEPT — strong | Two-ship-moments split is the right risk shape: code-complete vs. domain+vendor flip are independent kinds of risk. |
| P3 | "Editor's Cut is bilingual in routine output (no machine translation)" | ACCEPT | Token-budget math is conservative; fallback rules per § *Routine prompt extension* protect the dominant audience. |
| P4 | "Translation pages MUST exist for every CN-source article; canonical points to the CN source" | ACCEPT | Excerpt-only + canonical-to-source is the defensible legal posture; D6 captures it. |
| P5 | "Beehiiv Post API works on Launch (free) tier" | ACCEPT WITH RISK NOTE | Spec already flags this as an *open question requiring a verification spike before implementation commits* — that spike sits at the boundary of this spec and remains a real schedule risk. Phase 1 confirms this is recorded in *Risks & open questions*. |
| P6 | "All 23 tasks are TDD-shaped with RED→GREEN→COMMIT" | ACCEPT | Every task in the plan declares failing-test-first; this is rare and good. |

**Verdict:** Premises pass. No premise gate halt.

### 1.1 Existing-code leverage map

| Sub-problem | Existing code | Action |
|---|---|---|
| Renderer (Node ESM) | `scripts/render-site.mjs` | EXTEND — add editorial, translation, SEO, feed, canonical injection |
| Card builders | existing card-refinements spec output | EXTEND — wire fav-star + data-article-id + editorial cut box |
| Vitest harness | `vitest.config.mjs` (already configured for `tests/` + `scripts/`) | EXTEND — add `@cloudflare/vitest-pool-workers` pool |
| Audio pipeline | `scripts/generate-audio.py` | UNTOUCHED — out of scope per spec |
| GHA workflow | `.github/workflows/*.yml` | EXTEND — add Beehiiv post step + `BACKEND_LIVE` env |
| `data/claude-summaries.json` shape | existing schema | EXTEND — `editorial.*` + `translations[]` blocks |
| All Worker / D1 / Wrangler | NONE — greenfield | NEW under `worker/` and `migrations/` |

The plan correctly extends what exists and only adds greenfield where greenfield is unavoidable.

### 1.2 Dream-state delta

**CURRENT** (live GH Pages): static aggregator, EN+CN summaries, audio, no identity, no editorial, no SEO bundle, no syndication.

**THIS PLAN** (end-state): same static surface PLUS editorial commentary on cards (bilingual), CN→EN translation pages with canonical-to-source, full SEO bundle (sitemap, news-sitemap, robots, JSON-LD, OG meta, canonical-on-every-page, Atom feed at `/feed.xml`), `/favourites` page (localStorage), `/account` shell (feature-flagged off). Worker + D1 + migrations live in-repo, locally testable, NOT live.

**12-MONTH IDEAL** (post-cloudflare-migration + monetisation specs): same site live on custom domain, real subscribers receiving bilingual segmented daily emails, monetisation surface (likely paid tier or sponsorship) on top of the identity + favourites primitives. This plan ships ~70% of the substrate the 12-month ideal needs. The remaining 30% is operational (DNS, vendor accounts) and commercial (monetisation), not code.

**Delta:** This plan moves the project from "static daily reader" to "subscribable property with editorial voice + bilingual reach" in one ship, with the production flip cleanly extractable.

### 1.3 Implementation alternatives (already evaluated in spec § D2; auto-accepted by autoplan)

| Approach | Effort | Risk | Verdict |
|---|---|---|---|
| Stay on GH Pages, no backend | < 1 day CC | Low | REJECTED — fails the spec's identity goal |
| Move everything to a single PaaS (e.g. Vercel) | 1 day CC | Medium | REJECTED in spec — Vercel hobby tier prohibits commercial use |
| GHA (build) + Cloudflare (runtime + storage) — chosen | 2–3 days CC | Low | ACCEPTED — free at scale, no commercial lock-in |
| Self-hosted backend (Fly.io, Render, VPS) | 3–5 days CC | Higher | REJECTED — operational overhead, no free tier match |

### 1.4 Scope decisions (auto-decided)

| Decision | Auto-verdict | Principle | Notes |
|---|---|---|---|
| Include canonical link on every page (not just translation pages) per Step 2 audit I2 | EXPAND | P1, P2 | In blast radius (single helper + one wiring point); SEO win is non-trivial; adds <1d CC. |
| Add `renderNewsSitemap` unit-test coverage per Step 2 audit I1 | EXPAND | P1 | Single test file; closes a real coverage gap; <30 min CC. |
| Rename `routine-prompt-extension.md` to follow file-govern convention per Step 2 audit K2 | ACCEPT | P5 | Trivial rename; restores convention compliance. |
| Defer monetisation primitives, EN→CN translation, logo, OG-image strategy | DEFER | P3 | Already in spec § Out of scope and TODOs T1–T6. No new defer needed. |
| Defer Beehiiv Post API verification spike to pre-Phase E implementation | DEFER WITH NAMED TRIGGER | P3 | Risk recorded in spec § Risks; trigger event = "before E2 implementation begins". |
| Defer production migration (domain, vendor accounts, DNS flip) | DEFER | P3 | Captured in *Implementation phasing* — explicit separate spec. |

### 1.5 Error & Rescue Registry (CEO-altitude)

| Failure mode | Where it would fire | Recovery |
|---|---|---|
| Beehiiv Post API not on Launch tier | Phase E2 implementation | Spec's named fallback: render `data/daily-email.html` + Beehiiv RSS-to-send (Max tier $96/mo) — re-evaluate at monetisation conversation. |
| Routine token budget overrun (≥15 cuts + ≥20 translations) | Phase K1 in production | Spec's drop order: `commentary_zh` first, then `overall_zh`, never `overall_en`/`commentary_en`/`translations[*].excerpt_en`. Renderer respects `commentary_zh_fallback` flag (mockup 25). |
| Translation copyright takedown request | Post-launch | Spec: comply immediately. Slug stays in sitemap as 410 Gone for ~30 days, then removed. |
| GH Pages deploy step breaks because `BACKEND_LIVE` env var typo | Phase L1 ship | Existing CI smoke test catches it; rollback = re-run prior workflow. |
| `wrangler dev` + miniflare drift from production Cloudflare runtime | Discovered at cloudflare-migration spec time | Out of scope here — recorded as cloudflare-migration risk. |

### 1.6 CEO consensus table (single-voice — Codex unavailable)

```
CEO REVIEW — CONSENSUS TABLE (single-voice, [codex-unavailable]):
═══════════════════════════════════════════════════════════════
  Dimension                           Verdict  Notes
  ──────────────────────────────────── ────────  ─────────────────────────────
  1. Premises valid?                   PASS     6/6 premises accepted
  2. Right problem to solve?           PASS     Identity + editorial + SEO is the right next ship
  3. Scope calibration correct?        PASS     23 tasks; no scope-creep flags
  4. Alternatives sufficiently explored? PASS   Spec § D2 has full alternatives table
  5. Competitive/market risks covered? PASS     Free-tier free; commercial-use unblocked; vendor-lock-in avoided
  6. 6-month trajectory sound?         PASS     Cleanly extends to cloudflare-migration + monetisation specs
═══════════════════════════════════════════════════════════════
```

### 1.7 CEO Completion Summary

| Item | Verdict |
|---|---|
| Premises accepted | 6/6 |
| Scope expansions accepted | 3 (I1, I2, K2 fixes from Step 2 audit) |
| Scope deferrals | 6 (already in spec § Out of scope / TODOs) |
| Failure modes registered | 5 |
| User challenges raised | 0 (no model disagreement; user direction holds) |
| Mode | SELECTIVE_EXPANSION |

---

## Phase 2 — Design Review

### 2.1 Design scope

**Initial DX-completeness rating:** 8.5/10. Spec § *UI surfaces requiring per-state declarations* lists every state explicitly. 30 mockup files exist, each tagged with a `data-mockup-state` per state. The plan references mockup file paths by basename in every render task. This is high-fidelity design coverage.

### 2.2 Mockup-to-task coverage map

| Mockup file | Task | Status |
|---|---|---|
| 01–05 subscribe-form-* | F3 / G2 (account page hosts) | Coverage: shell only; mocks state matrix; flag-gated off |
| 06–08 favourite-star-* | F3 (fav-star button) | Static states; `syncing` state is client-JS-only |
| 09–10 favourites-ghpages-* | G1 | Empty + populated |
| 11–12 favourites-cloudflare-* | G1 | Flag-gated; sync prompt visible only when BACKEND_LIVE=true |
| 13–16 sync-favourites-* | G1 | Static shell + client-JS transitions |
| 17–22 account-* | G2 | All 6 states; modal-open is client-JS |
| 23–26 editors-cut-* | F2 / F3 | All 4 states (en, zh, fallback, not-cut) |
| 27–28 email-en / email-zh | E1 | Two static templates |
| 29–30 article-translation-* | H1 | Populated + placeholder |

**Coverage: 30/30 mockups referenced by plan tasks.** No orphan mockups.

### 2.3 Information hierarchy review

Per spec § B7: cut articles get a 🏅 commentary box; non-cut cards are unchanged. Hierarchy: card title > card body > Editor's Cut box (below body). This is the right priority — Editor's Cut is editorial *commentary* on the article, not the article itself.

Per mockups 17–22: `/account` page has Newsletter status (top), Language preference (middle), Delete data (bottom, danger zone). Correct danger-zone-last ordering.

Per mockup 29: translation page leads with title → attribution → "Read original (中文) →" CTA → excerpt → CTA repeated. Good — the primary CTA is reading the source (legally protective), and excerpt is supportive.

### 2.4 Missing-state audit

| Surface | Spec states | Mockup states | Gap? |
|---|---|---|---|
| Subscribe form | 5 (idle, submitting, link-sent, error-invalid, error-network) | 5 | none |
| Fav star | 3 (empty, filled, syncing) | 3 | none |
| /favourites (GH) | 2 (empty, populated) | 2 | none |
| /favourites (CF) | 2 (anon-with-sync, linked-populated) | 2 | none |
| Sync-favourites | 4 (collapsed, open, sent, error) | 4 | none |
| /account | 6 (active, unsubscribed, lang-saving, lang-saved, delete-open, delete-closed) | 6 | none |
| Editor's Cut | 4 (en, zh, zh-fallback, not-cut) | 4 | none |
| Daily email | 2 (en, zh) | 2 | none |
| /articles/<slug>/ | 2 (populated, placeholder) | 2 | none |

Total: 30 spec-declared states ↔ 30 mockup files ↔ 30 plan-task references. Clean.

### 2.5 Accessibility audit (auto-decided)

- Fav star: plan declares `aria-pressed="false"` + `aria-label="Save article"` + `title="Save"`. ✅
- Language tab: spec implies it exists; plan F3 wires it. Verify `aria-selected` is set on tab role in mockup → spec asserts this but plan doesn't explicitly. **MEDIUM finding D-A1.**
- Delete modal: mockups 21/22 — verify `role="dialog"` + `aria-labelledby` + focus trap. **MEDIUM finding D-A2** — plan G2 says "modal open is client-side transitions" but does NOT spec focus-trap or escape-to-close. Closing modal on Escape is a baseline a11y expectation.
- Subscribe form: `<form>` semantics + label for email input. Verify mockup. **LOW finding D-A3** — plan should explicitly assert form has `<label for="email">`.

### 2.6 Design consensus table (single-voice, [codex-unavailable])

```
DESIGN REVIEW — CONSENSUS TABLE (single-voice):
═══════════════════════════════════════════════════════════════
  Dimension                       Score  Verdict
  ───────────────────────────────  ─────  ─────────────────────────────
  1. Mockup coverage               10/10  30/30 mockups mapped to tasks
  2. State completeness            10/10  No missing states
  3. Information hierarchy         9/10   Sound; one Editor's Cut subtle nit
  4. Accessibility                 7/10   3 medium/low gaps (focus trap, aria-selected, label)
  5. Responsive strategy           N/A    Spec defers — desktop-first ship
  6. Visual consistency            9/10   Mockups share `_shared.css`
  7. Design-system alignment       8/10   `_shared.css` is per-feature; project DESIGN.md not yet authored
═══════════════════════════════════════════════════════════════
Total: 53/60 (avg 8.8/10)
```

### 2.7 Design findings (auto-decided)

| ID | Severity | Finding | Auto-action | Principle |
|---|---|---|---|---|
| D-A1 | MEDIUM | Language tab `aria-selected` not explicit in plan | NOTE → Task F3 step 3 must set `aria-selected="true"` on active tab, `aria-selected="false"` on inactive | P1, P5 |
| D-A2 | MEDIUM | Delete modal focus-trap + Escape-to-close not specified | NOTE → Task G2 step 3 must declare focus-trap behaviour + `aria-modal="true"` + ESC handler | P1 |
| D-A3 | LOW | Subscribe form `<label for="email">` not explicit in plan | NOTE → Task G2 (or earlier subscribe-shell task) must include `<label for="email-input">` paired with the input id | P1, P5 |

These three findings are recorded as plan addenda — implementation tasks G2 and F3 must satisfy them. They do NOT require new tasks; they refine acceptance criteria on existing tasks.

---

## Phase 3 — Engineering Review

### 3.1 Architecture (ASCII dependency graph)

```
GHA build (Linux + Python + ffmpeg)
  ├── scripts/generate-audio.py            [UNCHANGED]
  ├── scripts/render-site.mjs              [EXTEND]
  │     ├── scripts/lib/article-id.mjs     [NEW: F1]
  │     ├── scripts/lib/editorial.mjs      [NEW: F2]
  │     ├── scripts/lib/translations.mjs   [NEW: H1]
  │     ├── scripts/lib/seo.mjs            [NEW: I1, extended in J1]
  │     ├── scripts/lib/favourites-page.mjs [NEW: G1]
  │     ├── scripts/lib/account-page.mjs   [NEW: G2]
  │     ├── scripts/lib/email-template.mjs [NEW: E1]
  │     └── scripts/lib/summaries-schema.mjs [NEW: K1]
  ├── scripts/post-to-beehiiv.mjs          [NEW: E2 — fast-path step]
  └── GH Pages deploy (BACKEND_LIVE=false) [L1]

Cloudflare Worker runtime (NEW — not deployed in this spec)
  worker/index.ts                          [NEW: B1]
    ├── worker/lib/auth.ts (HMAC)          [NEW: B3]
    ├── worker/lib/db.ts (D1 helpers)      [NEW: C1]
    ├── worker/lib/email.ts (Resend stub)  [NEW: C1]
    ├── worker/lib/beehiiv.ts (stub)       [NEW: D2]
    └── worker/routes/*.ts                 [NEW: C1/C2/C3, D1, D2, D3]
                                              → reads/writes D1 (subscribers,
                                                favourites, magic_links)

Test harness                              [EXTEND: A1]
  vitest projects:
    ├── 'node'   → tests/lib/, tests/render/
    └── 'worker' → tests/worker/  (miniflare + D1 local)
```

**Coupling assessment:**
- Renderer extensions are additive — existing `aihotItemsCard()` and friends gain attributes and child elements; no removal of existing markup.
- Worker code is fully isolated under `worker/` — zero imports from `scripts/`.
- Cross-runtime shared helper: `articleId()` lives in `scripts/lib/article-id.mjs` (Node ESM). The Worker side cannot reuse it directly (different runtime). **MEDIUM finding E-A1** — plan does not call this out. The fix is small: either (a) port `articleId()` to a `.ts` mirror in `worker/lib/article-id.ts` with a shared test fixture asserting both produce identical hashes, or (b) document that the Worker only receives `article_ids` from the client and never computes them server-side. Plan implicitly assumes (b); make it explicit.

**Scaling assessment:**
- D1: 5GB / 5M reads / 100k writes per day free. Subscriber count target is <2,500. Favourites at 100 saves/user = 250k rows. Magic-link expiry cleanup needed. **LOW finding E-A2** — plan does not declare a magic-link cleanup task. Add a sub-task to D2 or a TODO entry.

### 3.2 Code-quality review

**DRY check:** `articleId()` (F1) is shared between renderer and frontend JS via inline script — plan declares this. ✅ No duplication.

**Naming check:** `BACKEND_LIVE` env var — clear, boolean. ✅ `commentary_zh_fallback` field — clear. ✅ `data-article-id` attribute — matches convention. ✅

**File-size check:** `render-site.mjs` already exists; each task adds an extension. After Phase L1, that file will host many concerns — but each concern is one helper call. Acceptable for the slice; revisit if it exceeds ~800 lines.

**Type safety:** Worker code is TypeScript with `worker/types.ts` (B1). Renderer is `.mjs` (Node ESM, no types). The seam between Worker and frontend is JSON over HTTP; type drift risk is medium. **LOW finding E-Q1** — consider a shared `worker/types.ts` `Subscriber` type whose shape is documented (not enforced) at the renderer's call sites.

### 3.3 Test Plan Artifact — the load-bearing output of Phase 3

**Scope:** every user-visible behaviour in spec § B1–B15 + B1b/B1c/B6b/B7b is mapped to one or more test layers.

**Layer definitions:**
- **Unit** — `tests/lib/*.test.mjs` or `tests/worker/*.test.ts` against a single helper or single route. No browser, no full render.
- **Component** — render of a single HTML fragment via the renderer's helper and DOM-snapshot assertion. Vitest `node` pool, no Playwright.
- **Integration** — full `node scripts/render-site.mjs` run with a fixture, then DOM-assert the output files; or full Worker route via `SELF.fetch()` with miniflare D1.
- **E2E** — Playwright against the rendered static site (GH Pages preview) OR against `wrangler dev` for backend behaviours.
- **manual-only** — human verification with a category tag (`visual-polish`, `real-device-gesture`, or `subjective-ux`).

**Project note on E2E:** This branch has NO Playwright harness yet (`package.json` shows only `vitest`, `pytest`). E2E coverage in this slice is treated as **`needs-automation` deferred to a follow-up task** — items requiring E2E are marked accordingly and explicitly NOT tagged `manual-only`. The plan covers them via integration tests against rendered HTML and Worker miniflare; full Playwright E2E lands in a follow-up that scaffolds the harness.

**No dnd-kit / react-dnd / hover-reveal / drag features in this slice.** Defensive note for the automatable-signature trap: zero items in this matrix qualify as `[manual-only: real-device-gesture]`.

#### Behaviour-to-layer map

| Behaviour | Surface | Unit | Component | Integration | E2E | manual-only | Notes |
|---|---|---|---|---|---|---|---|
| **B1** Subscribe via email [Cloudflare-live] | Worker route + email | `tests/worker/subscribe.test.ts` (C1), `tests/worker/auth.test.ts` (B3) | — | `tests/worker/subscribe.test.ts` `SELF.fetch` end-to-end with D1+Resend stub | `needs-automation` (Playwright vs wrangler dev) — deferred to follow-up | — | Magic-link round-trip covered by integration; E2E proves session cookie set. |
| **B1b** Anonymous EN-only first paint, session toggle [GH-Pages-live] | Renderer + frontend JS | `tests/lib/article-id.test.mjs` indirect | `tests/render/feature-flag.test.mjs` (F3) asserts no `localStorage.setItem('lang')` in inline JS | `tests/render/editors-cut.test.mjs` asserts lang tab default EN on rendered HTML | `needs-automation` (Playwright toggles 中文, reloads, asserts back to EN) | — | Removal of localStorage write is the testable contract; assert via grep of rendered JS. |
| **B1c** Subscriber lang preference auto-applies on login [Cloudflare-live] | Worker route + frontend | `tests/worker/account.test.ts` (D2) for `PUT /api/account/language` | — | `tests/worker/account.test.ts` round-trip: PUT → GET shows new lang | `needs-automation` | — | Server-side covered; client-side render-on-load is E2E-only. |
| **B2** Save anonymous [GH-Pages-live] | Frontend JS only | — | `tests/render/editors-cut.test.mjs` (F3) asserts `<button class="fav-star">` exists with `data-article-id` | — | `needs-automation` (click ☆ → ★, reload → ★ persists) | — | localStorage behaviour is browser-only; Playwright is the right layer. |
| **B3** Save linked, server-synced [Cloudflare-live] | Worker route + frontend | `tests/worker/favourites.test.ts` (D1) for `POST /api/favourites` | — | `tests/worker/favourites.test.ts` POST+GET cycle | `needs-automation` (POST fires in background; verify network panel) | — | Background-POST + retry queue is implementation detail; tested via Worker integration. |
| **B4** View saved articles [GH-Pages-live (no sync) + Cloudflare-live] | `/favourites` page + frontend | — | `tests/render/favourites-page.test.mjs` (G1) — empty + populated states | `tests/render/favourites-page.test.mjs` BACKEND_LIVE matrix | `needs-automation` (saved-at-DESC order verified in browser) | — | Both flag states covered at render-integration level. |
| **B5** Sync favourites to new device [Cloudflare-live] | Worker + frontend | `tests/worker/sync-favourites.test.ts` (C3) | — | Worker integration: POST sync → magic-link consumed → favourites pulled | `needs-automation` (full magic-link click flow) | — | — |
| **B6** Daily email lands in stored language [Cloudflare-live] | GHA step | `tests/lib/email-template.test.mjs` (E1), `tests/lib/post-to-beehiiv.test.mjs` (E2) | `tests/lib/email-template.test.mjs` asserts mockup-shape DOM | `tests/lib/post-to-beehiiv.test.mjs` payload shape; segment ID populated | `needs-automation` (live Beehiiv send + inbox check — out of slice scope) | `[manual-only: visual-polish]` — verify mobile-rendered HTML legibility in a real email client (Gmail / Apple Mail / Outlook on iOS+desktop) | Inline-HTML email rendering quirks across clients are NOT automatable in CI. Visual polish category fits. |
| **B6b** Lang preference change via /account [Cloudflare-live] | Worker route + frontend | `tests/worker/account.test.ts` (D2) for `PUT /api/account/language` | — | Worker integration: PUT updates DB + Beehiiv segment-move stub called | `needs-automation` (form submit → toast → reload shows new tab) | — | — |
| **B7** Editor's Cut commentary on cut cards [GH-Pages-live] | Renderer | `tests/lib/editorial.test.mjs` (F2) | `tests/render/editors-cut.test.mjs` (F3) asserts `<aside class="editors-cut">` on cut articles, absent on non-cut | Full render integration | — (covered by component) | — | — |
| **B7b** Commentary respects language tab [GH-Pages-live] | Renderer + frontend JS | `tests/lib/editorial.test.mjs` asserts both `commentary_en` and `commentary_zh` carried in data attributes | `tests/render/editors-cut.test.mjs` — assert ZH-fallback tag rendered when `commentary_zh_fallback` flag set | — | `needs-automation` (Playwright: click 中文, assert commentary text swap) | — | Render-side covered; JS swap is E2E. |
| **B8** CN article → EN translation page [GH-Pages-live] | Renderer | `tests/lib/translations.test.mjs` (H1) — `translationSlug` + `renderTranslationPage` populated + placeholder | `tests/render/translation-pages.test.mjs` (H2) | Full render: `docs/articles/<slug>/index.html` exists with expected DOM | `needs-automation` (browser nav: click EN card title → land on `/articles/...`) | — | — |
| **B9** Same card with 中文 tab → CN source link [GH-Pages-live] | Renderer + frontend JS | — | `tests/render/translation-pages.test.mjs` — assert card link has `data-en-href` + `data-zh-href` | — | `needs-automation` (click 中文 then click title → opens CN source) | — | Render-side: both hrefs present in data attributes. JS swap is E2E. |
| **B10** Unsubscribe from emails [Cloudflare-live] | Worker route + webhook | `tests/worker/account.test.ts` `/api/account/unsubscribe`, `tests/worker/webhooks.test.ts` (D3) | — | Worker integration: webhook POST → `unsubscribed_at` set; favourites intact | `needs-automation` (Beehiiv-sent email → click unsubscribe → webhook fires → account page shows unsubscribed) | — | — |
| **B11** Delete account / data [Cloudflare-live] | Worker route | `tests/worker/account.test.ts` `/api/account/delete` | — | Worker integration: DELETE removes all rows + Beehiiv list entry (stub call); subsequent /api/favourites returns 401 | `needs-automation` (full UI flow + modal confirmation + redirect) | — | — |
| **B12** Search engines discover the site [GH-Pages-live] | Renderer SEO output | `tests/lib/seo.test.mjs` (I1) — `renderSitemap`, `renderNewsSitemap`, `renderRobotsTxt` | — | `tests/render/seo-pages.test.mjs` (I2) — files exist + cross-reference | — | — | Sitemap validation is mechanical; XML structure asserted. |
| **B13** Translation pages recognised as multilingual [GH-Pages-live] | Renderer | `tests/lib/translations.test.mjs` asserts canonical + hreflang + NewsArticle JSON-LD in head | `tests/render/translation-pages.test.mjs` cross-checks rendered file | — | — | — | Google Search Console submission is operational (cloudflare-migration spec). |
| **B14** Atom feed reachable + valid [GH-Pages-live] | Renderer | `tests/lib/seo.test.mjs` (J1) — `renderAtomFeed` 30-entry cap, URN ids, no editorial content | — | `tests/render/seo-pages.test.mjs` (J2) — `docs/feed.xml` exists + valid Atom 1.0 + no editorial leak | `needs-automation` (`validator.w3.org/feed/` external check) | `[manual-only: visual-polish]` — third-party feed-reader rendering check (Reeder, Feedly, NetNewsWire) | External validator is automatable from CI but currently out-of-harness; render-integration covers structure. Visual polish item covers app-specific rendering. |
| **B15** Feed autodiscovery from any HTML page [GH-Pages-live] | Renderer | — | `tests/render/seo-pages.test.mjs` — every rendered HTML page contains exactly one `<link rel="alternate" type="application/atom+xml">` | — | — | — | Render-side fully covered. |

#### Manual-only category audit

| Item | Category | Justification |
|---|---|---|
| B6 mobile-rendered email legibility | `[manual-only: visual-polish]` | Cross-client HTML rendering (Gmail/Apple Mail/Outlook iOS/desktop) cannot be automated in this harness; rendering subjectively assessed by human. Spec § B6 explicitly names "mobile-rendered HTML is legible in both languages". |
| B14 third-party feed-reader rendering | `[manual-only: visual-polish]` | Reeder/Feedly/NetNewsWire app rendering is subjective UX; XML validity is automated. |

**Count:** 2 tagged manual-only, 11 `needs-automation` (deferred to E2E follow-up after Playwright harness lands), 0 violations of the automatable-signature trap, 0 untagged manual-only items.

#### Coverage gap summary

- **All 19 behaviours have at least one automated test layer** in this slice (unit, component, or integration). No behaviour ships with manual-only as the *only* coverage.
- **E2E is universally `needs-automation` deferred** — this is honest: the Playwright harness does not exist yet. The right shape is to land a follow-up task that scaffolds Playwright and converts every `needs-automation` row to a passing E2E test. Recorded in NOT-in-scope below.

### 3.4 Performance review

- **D1 query patterns:** Worker reads/writes are single-row by primary key (`email` or `token`). No N+1 risk in this slice. `GET /api/favourites` does one indexed lookup. ✅
- **Renderer:** unchanged hot path. Editorial helpers are O(1) per card. Translation page generation is O(N) over `summaries.translations[]` — fine at ~10 articles/day.
- **Atom feed cap at 30 entries** prevents unbounded growth.
- **Email template inline-HTML size:** mockup `27-email-en.html` is 7.7K, `28-email-zh.html` is 7.3K. Sub-100K, well under Beehiiv limits.

### 3.5 Security review

- **Session cookies:** HMAC-signed, HttpOnly, Secure, SameSite=Lax. ✅
- **Magic-link tokens:** 32 random bytes hex (256-bit). ✅
- **CORS:** allows site origin only. ✅
- **CSRF on POST routes:** session cookie is SameSite=Lax which mitigates cross-origin POST. `POST /api/favourites` and `POST /api/account/*` rely on cookie auth — Lax is sufficient for non-form submissions but a determined attacker can bypass for top-level GETs. The relevant endpoints are POST/PUT/DELETE so Lax suffices. ✅
- **Webhook signature verification:** `worker/routes/webhooks.ts` (D3) verifies Beehiiv HMAC. ✅
- **Input validation:** email format check (C1 step 1 has the `'not-an-email'` test). Article-ID format check NOT explicit in plan. **MEDIUM finding E-S1** — `POST /api/favourites` should validate `article_id` matches `^[a-z]+-[0-9a-f]{8}$` shape before insert; otherwise a malicious client could pollute the table with arbitrary strings. Add an assertion.
- **D1 schema:** uses `?` parameterized binds throughout (per B2 test). ✅ No SQL injection risk.

### 3.6 Eng consensus table (single-voice, [codex-unavailable])

```
ENG REVIEW — CONSENSUS TABLE (single-voice):
═══════════════════════════════════════════════════════════════
  Dimension                       Verdict  Notes
  ──────────────────────────────── ─────── ────────────────────────────────
  1. Architecture sound?           PASS    Clean GHA/Cloudflare split; isolated worker/ dir
  2. Test coverage sufficient?     PASS    19/19 behaviours have automated layer; E2E deferred (honest)
  3. Performance risks addressed?  PASS    D1 single-row queries; feed cap 30; email size OK
  4. Security threats covered?     CONCERN E-S1: article_id format validation missing
  5. Error paths handled?          PASS    Stubs no-op when env vars absent; redirect-by-purpose
  6. Deployment risk manageable?   PASS    Feature flag isolates production exposure to zero
═══════════════════════════════════════════════════════════════
```

### 3.7 Eng findings (auto-decided)

| ID | Severity | Finding | Auto-action | Principle |
|---|---|---|---|---|
| E-A1 | MEDIUM | `articleId()` cross-runtime sharing not explicit (Node vs Worker) | NOTE → Plan should declare: Worker never computes article_id server-side; clients always supply it via API. Document in B1 or D1. Add an explicit `validateArticleId()` helper to `worker/lib/db.ts` or `worker/lib/auth.ts`. | P5 |
| E-A2 | LOW | Magic-link cleanup task not declared | NOTE → Add to NOT-in-scope: "expired magic-link garbage collection — defer to cloudflare-migration spec (cron-based wrangler scheduled trigger)" | P3 |
| E-Q1 | LOW | Type-safety seam between Worker (TS) and renderer (mjs) | NOTE — no action required this slice; document types in `worker/types.ts` for reference only | P3 |
| E-S1 | MEDIUM | `article_id` shape validation absent at write endpoint | FIX → Task D1 step 3 must validate `article_id` matches `^[a-z][a-z0-9]+-[0-9a-f]{8}$` (or the canonical regex from articleId()) before `POST /api/favourites` insert; reject with 400 otherwise. | P1, P5 |

### 3.8 Eng Completion Summary

| Item | Verdict |
|---|---|
| Architecture diagram produced | ✅ |
| Test plan artifact written | ✅ (above, § 3.3) |
| Failure modes registered | 5 (Phase 1) + 4 (Phase 3) = 9 total |
| Findings (MEDIUM) | E-A1, E-S1 — refinements to existing tasks, no new tasks |
| Findings (LOW) | E-A2, E-Q1 — recorded in NOT-in-scope or as documentation notes |
| Behaviours covered by automated tests | 19/19 |

---

## Phase 3.5 — Developer Experience Review

### 3.5.1 DX scope

This project is itself a developer tool surface in three ways:
1. **Routine prompt extension** — the routine author updates the Claude prompt to emit `editorial.*` and `translations[]`. Reference doc at `docs/specs/2026-05-17-routine-prompt-extension-spec.md`.
2. **Worker API** — `/api/*` is a contract for a (currently unbuilt) frontend or third-party.
3. **Build pipeline** — `BACKEND_LIVE` env var, Beehiiv secrets, Resend secrets, wrangler dev — all developer-facing.

**Initial DX rating: 7.5/10.**

### 3.5.2 Developer journey map

| Stage | Today (this slice) | Target |
|---|---|---|
| Discover | README + CLAUDE.md | Same (no changes) |
| Install | `npm install` | Same; will gain `@cloudflare/vitest-pool-workers` + `wrangler` in A1 |
| Hello world | `node scripts/render-site.mjs` | Same |
| First API call | `npx wrangler dev` + `curl http://localhost:8787/api/subscribe -d '{"email":"x@x.com","language":"en"}'` | Same once B1 lands |
| First test | `npx vitest run` | Same once A1 lands |
| First migration | `npx wrangler d1 migrations apply ai-daily-digest-dev --local` | Same once B2 lands |
| Beehiiv test | env-var-absent stub no-ops; in prod, real key | Same — stub path is well-defined |
| Error: missing env var | stubs log and continue; no crash | ✅ Good (P5) |
| Upgrade | `git pull` + re-run migrations | Same |

**TTHW (time-to-hello-world):** `git clone && npm install && node scripts/render-site.mjs` — under 2 minutes assuming `data/claude-summaries.json` exists with the extended schema (test fixture exists per A2). ✅

### 3.5.3 DX consensus table (single-voice)

```
DX REVIEW — CONSENSUS TABLE (single-voice):
═══════════════════════════════════════════════════════════════
  Dimension                       Verdict  Notes
  ──────────────────────────────── ─────── ──────────────────────────────────
  1. Getting started < 5 min?      PASS    < 2 min
  2. API/CLI naming guessable?     PASS    /api/subscribe, /api/favourites, /api/auth/verify — REST-shaped
  3. Error messages actionable?    CONCERN Plan doesn't specify response body shape for 400/401 — only status codes
  4. Docs findable & complete?     PASS    Routine prompt extension spec lands as part of K2
  5. Upgrade path safe?            PASS    Feature flag isolates; migrations are forward-only
  6. Dev environment friction-free?PASS    Stubs no-op without secrets; tests run offline
═══════════════════════════════════════════════════════════════
```

### 3.5.4 DX findings (auto-decided)

| ID | Severity | Finding | Auto-action | Principle |
|---|---|---|---|---|
| DX-1 | MEDIUM | API error response body shape not specified (only status codes) | NOTE → Worker routes should return `{ error: "<machine-key>", message: "<human-readable>" }` on 4xx. Document in `worker/types.ts` as an `ApiError` type. Task C1 step 3 must adopt this shape. | P1 |
| DX-2 | LOW | `BACKEND_LIVE` env var not documented in README | NOTE — README update is out-of-scope for this slice; tracked in NOT-in-scope below for a follow-up doc pass | P3 |
| DX-3 | LOW | `wrangler dev` startup instructions not in plan | NOTE — Task L2 should include a smoke-test command for `npx wrangler dev` against migrated local D1 | P5 |

### 3.5.5 DX Completion Summary

| Item | Verdict |
|---|---|
| TTHW | < 2 min (target: <5 min) ✅ |
| Developer journey map | ✅ |
| DX dimensions scored | 6/6 |
| MEDIUM findings | 1 (DX-1: API error shape) |
| LOW findings | 2 (DX-2: README, DX-3: wrangler smoke-test) |

---

## NOT in scope (this slice)

The following are explicitly out of scope for this slice. Each has a named home (deferred-to artifact) and, where applicable, a trigger event that elevates it back into scope.

### Deferred to the cloudflare-migration-and-vendor-onboarding spec

- **Production Cloudflare account creation** — Pages project, Worker production binding, D1 production database, custom domain DNS, sending-domain verification (Resend + Beehiiv), production API keys as GHA + Worker secrets. Per spec § *Implementation phasing*, this is the cloudflare-migration spec's entire scope.
- **`BACKEND_LIVE=true` flip + deploy-target switch** to Cloudflare Pages.
- **Submit `sitemap.xml` and `news-sitemap.xml`** to Google Search Console + Bing Webmaster Tools.
- **Expired magic-link garbage collection (E-A2 finding)** — implement as a cron-based wrangler scheduled trigger; not needed during local-only testing.
- **301 redirect from `rowland-dot.github.io/ai-daily-digest/*` to new domain** — operational, post-DNS-flip.

### Deferred to the monetisation spec (future)

- **Monetisation primitives** — paid tiers, ad slots, sponsorships.
- **Beehiiv Max tier upgrade** for RSS-to-send fallback (T4) — only if the Post-API spike fails.
- **Per-recipient daily email personalisation** (T6, e.g. "your saved articles") — defer until subscriber engagement metrics warrant it.

### Deferred to a follow-up task in this repo (post-merge of this branch)

- **Playwright E2E harness** — 11 `needs-automation` rows in the Test Plan Artifact will convert to passing E2E tests once Playwright is installed and wired into vitest or a separate `playwright.config.ts`. Trigger: post-merge of this slice.
- **DX-2 README update** — document `BACKEND_LIVE`, `wrangler dev`, Beehiiv stub behaviour, Resend stub behaviour, migration commands. Trigger: post-merge.
- **DX-3 `wrangler dev` smoke-test command** in L2 — minor refinement to L2; can land as part of L2 or as a follow-up.
- **Validator-CI for sitemap.xml / feed.xml** — wire a CI step that runs the `validator.w3.org/feed/` endpoint or a local Atom validator. Trigger: post-merge if time allows.

### Recorded in spec § TODOs (T1–T6, not re-listed here)

- T1 site logo + brand mark
- T2 OG image strategy
- T3 EN→CN translation of internal articles
- T4 Beehiiv Max tier
- T5 Google News inclusion verification (30-day post-launch)
- T6 Per-recipient daily email personalisation

### Recorded in spec § Out of scope (not re-listed here)

- Push notifications / mobile app
- User comments / discussion

---

## Cross-phase themes

Only one theme appeared in 2+ phases of this review:

- **Theme: API contract specificity** — surfaced in Phase 2 (D-A1/D-A2/D-A3 accessibility attribute gaps), Phase 3 (E-S1 input validation), and Phase 3.5 (DX-1 error response shape). All three reduce to "the plan specifies behaviour at the user-visible level but not always at the precise attribute/payload level". Auto-action: each finding's task receives a refinement note (above); no new task required.

---

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale |
|---|---|---|---|---|---|
| 1 | CEO | Accept 6/6 premises | Mechanical | P1 | All premises reasonable; verification spike for Beehiiv is correctly flagged in spec |
| 2 | CEO | Expand scope to include `renderNewsSitemap` unit tests (I1 fix) | Mechanical | P1 | Closes Step 2 audit MEDIUM finding; <30 min CC |
| 3 | CEO | Expand scope to inject canonical on every page (I2 fix) | Mechanical | P1 P2 | Closes Step 2 audit MEDIUM finding; in blast radius; <1d CC |
| 4 | CEO | Rename `routine-prompt-extension.md` → `-spec.md` form (K2 fix) | Mechanical | P5 | Restores file-govern convention; trivial |
| 5 | CEO | Defer monetisation, EN→CN, logo, OG image | Mechanical | P3 | Already in spec § Out of scope |
| 6 | Design | Note `aria-selected` on lang tabs (D-A1) | Mechanical | P1 P5 | Refines F3; no new task |
| 7 | Design | Note focus-trap + Escape + `aria-modal` on delete modal (D-A2) | Mechanical | P1 | Refines G2; no new task |
| 8 | Design | Note `<label for=>` on subscribe form (D-A3) | Mechanical | P1 P5 | Refines G2; no new task |
| 9 | Eng | Make Worker-side article_id non-computation explicit (E-A1) | Mechanical | P5 | Refines D1; documentation note |
| 10 | Eng | Defer magic-link garbage collection (E-A2) | Mechanical | P3 | Recorded in NOT-in-scope; cloudflare-migration ownership |
| 11 | Eng | Add `article_id` format validation on POST /api/favourites (E-S1) | Mechanical | P1 P5 | Refines D1 step 3; security gain |
| 12 | DX | Specify API error response body shape (DX-1) | Mechanical | P1 | Refines C1; introduces `ApiError` type in B1 |
| 13 | DX | Defer README update (DX-2) | Mechanical | P3 | Post-merge follow-up |
| 14 | DX | Defer wrangler-dev smoke command refinement (DX-3) | Mechanical | P5 | L2 owns this; small refinement |
| 15 | Approval gate | Auto-select Recommended option A | Pipeline mode | n/a | Pipeline-mode contract |

**Total decisions:** 15. Auto-decided: 15. Taste decisions raised: 0. User challenges raised: 0.

---

## Final Approval Gate (auto-accepted per pipeline mode)

**Option A — Approve as-is — selected.**

All review sections complete. All findings either applied as task refinements (notes appended to existing tasks via this document) or recorded in NOT-in-scope. No new plan tasks added; the existing 23 tasks remain the canonical work breakdown, refined by the findings catalogued above.

**Verdict:** APPROVED. Ready for Step 4 of `/dev-pipeline`.


