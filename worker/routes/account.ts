// Implemented in Task D2
export async function handleAccount(
  _request: Request,
  _db: D1Database,
  _secret: string,
  _beehiivApiKey: string,
  _beehiivPubId: string,
): Promise<Response> {
  return new Response('Not implemented', { status: 501 });
}
