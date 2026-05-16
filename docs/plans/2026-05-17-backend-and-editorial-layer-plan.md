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
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `scripts/lib/seo.mjs`** — all five helpers. OG image uses `imageUrl` parameter (caller passes placeholder or real logo path). News sitemap uses `<news:news>` namespace. JSON-LD NewsArticle includes `isBasedOn`, `author`, `datePublished`, `mainEntityOfPage`.

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
// - docs/digests/YYYY-MM-DD.html contains ItemList JSON-LD
// - docs/articles/<slug>/index.html <head> has canonical, hreflang, NewsArticle JSON-LD (covered by H1 tests — verify cross-reference only)
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Modify `render-site.mjs`**:
  - Inject OG + Twitter meta into `<head>` of every page via `renderOgMeta()`
  - Inject `renderItemListJsonLd()` into daily digest page `<head>`
  - Add `<link rel="alternate" type="application/atom+xml" title="AI Daily Digest" href="/feed.xml">` to every page `<head>` (exactly once)
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
- Create: `docs/specs/routine-prompt-extension.md` (inline documentation of the new output schema for whoever updates the Claude routine)

This is a pure docs task — no test needed. Write a concise reference explaining the three new output blocks (`editorial.overall_en/zh`, `editorial.cuts[]`, `translations[]`), token budget priorities, and fallback rules per the spec's *Routine prompt extension* section.

- [ ] **Step 1: Write the doc**

- [ ] **Step 2: Commit**

```bash
git add docs/specs/routine-prompt-extension.md
git commit -m "docs: routine prompt extension reference for editorial + translations output schema"
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
| K | scripts/lib/summaries-schema.mjs, docs/specs/routine-prompt-extension.md | — | 1 |
| L | — | .github/workflows | 1 |

**Total tasks: 23 (A1–A2, B1–B3, C1–C3, D1–D3, E1–E2, F1–F3, G1–G2, H1–H2, I1–I2, J1–J2, K1–K2, L1–L2)**
