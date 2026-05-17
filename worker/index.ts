import type { Env } from './types';
import { handleSubscribe } from './routes/subscribe';
import { handleAuthVerify } from './routes/auth-verify';
import { handleSyncFavourites } from './routes/sync-favourites';
import { handleFavourites } from './routes/favourites';
import { handleAccount } from './routes/account';
import { handleWebhook } from './routes/webhooks';
import { makeEmailSender } from './lib/email';
import { isRateLimited, hasBypassToken, clientIp, rateLimitedResponse } from './lib/rate-limit';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    // Guard: SESSION_SECRET must be set — an empty/absent secret produces
    // an HMAC key of zero entropy, making all session cookies forgeable.
    if (!env.SESSION_SECRET) {
      throw new Error('SESSION_SECRET environment variable is required but not set');
    }

    const url = new URL(request.url);
    const { pathname } = url;

    if (!pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 });
    }

    const sendEmail = makeEmailSender(env.RESEND_API_KEY);
    const siteOrigin = env.SITE_ORIGIN ?? 'https://ai-daily-digest.com';

    // Rate-limiter configuration: 5 req / 10 min per IP per rate-limited route.
    // Disabled when RATE_LIMIT_DISABLED=true (test env), or bypassed per-request
    // when X-Test-Bypass-RateLimit header matches RATE_LIMIT_BYPASS_TOKEN env var.
    const rateLimitDisabled = env.RATE_LIMIT_DISABLED === 'true';
    const bypassToken = env.RATE_LIMIT_BYPASS_TOKEN;
    const skipRateLimit = rateLimitDisabled || hasBypassToken(request, bypassToken);
    const ip = clientIp(request);

    // Route dispatch
    if (pathname === '/api/subscribe' && request.method === 'POST') {
      if (!skipRateLimit && isRateLimited(`${ip}:subscribe`, {})) {
        return rateLimitedResponse();
      }
      return handleSubscribe(request, env.DB, sendEmail, siteOrigin);
    }
    if (pathname === '/api/auth/verify' && request.method === 'GET') {
      return handleAuthVerify(request, env.DB, env.SESSION_SECRET, siteOrigin);
    }
    if (pathname === '/api/sync-favourites' && request.method === 'POST') {
      if (!skipRateLimit && isRateLimited(`${ip}:sync-favourites`, {})) {
        return rateLimitedResponse();
      }
      return handleSyncFavourites(request, env.DB, sendEmail, siteOrigin);
    }
    if (pathname.startsWith('/api/favourites')) {
      return handleFavourites(request, env.DB, env.SESSION_SECRET, siteOrigin);
    }
    if (pathname.startsWith('/api/account')) {
      // Rate-limit the destructive delete endpoint only
      if (pathname === '/api/account/delete' && request.method === 'POST') {
        if (!skipRateLimit && isRateLimited(`${ip}:account-delete`, {})) {
          return rateLimitedResponse();
        }
      }
      return handleAccount(request, env.DB, env.SESSION_SECRET, env.BEEHIIV_API_KEY, env.BEEHIIV_PUB_ID);
    }
    if (pathname === '/api/webhooks/beehiiv' && request.method === 'POST') {
      return handleWebhook(request, env.DB, (env as any).BEEHIIV_WEBHOOK_SECRET);
    }

    return new Response('Not implemented', { status: 501 });
  },
};
