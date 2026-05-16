// Implemented in Task C3
import type { EmailSender } from '../lib/email';
export async function handleSyncFavourites(
  _request: Request,
  _db: D1Database,
  _sendEmail: EmailSender,
  _siteOrigin: string,
): Promise<Response> {
  return new Response('Not implemented', { status: 501 });
}
