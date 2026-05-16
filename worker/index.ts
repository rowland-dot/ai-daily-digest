import type { Env } from './types';
import { handleSubscribe } from './routes/subscribe';
import { handleAuthVerify } from './routes/auth-verify';
import { handleSyncFavourites } from './routes/sync-favourites';
import { handleFavourites } from './routes/favourites';
import { handleAccount } from './routes/account';
import { handleWebhook } from './routes/webhooks';
import { makeEmailSender } from './lib/email';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (!pathname.startsWith('/api/')) {
      return new Response('Not found', { status: 404 });
    }

    const sendEmail = makeEmailSender(env.RESEND_API_KEY);
    const siteOrigin = env.SITE_ORIGIN ?? 'https://ai-daily-digest.com';

    // Route dispatch
    if (pathname === '/api/subscribe' && request.method === 'POST') {
      return handleSubscribe(request, env.DB, sendEmail, siteOrigin);
    }
    if (pathname === '/api/auth/verify' && request.method === 'GET') {
      return handleAuthVerify(request, env.DB, env.SESSION_SECRET ?? '', siteOrigin);
    }
    if (pathname === '/api/sync-favourites' && request.method === 'POST') {
      return handleSyncFavourites(request, env.DB, sendEmail, siteOrigin);
    }
    if (pathname.startsWith('/api/favourites')) {
      return handleFavourites(request, env.DB, env.SESSION_SECRET ?? '', siteOrigin);
    }
    if (pathname.startsWith('/api/account')) {
      return handleAccount(request, env.DB, env.SESSION_SECRET ?? '', env.BEEHIIV_API_KEY, env.BEEHIIV_PUB_ID);
    }
    if (pathname === '/api/webhooks/beehiiv' && request.method === 'POST') {
      return handleWebhook(request, env.DB, (env as any).BEEHIIV_WEBHOOK_SECRET);
    }

    return new Response('Not implemented', { status: 501 });
  },
};
