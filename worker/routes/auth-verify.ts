// Implemented in Task C2
export async function handleAuthVerify(
  _request: Request,
  _db: D1Database,
  _secret: string,
  _siteOrigin: string,
): Promise<Response> {
  return new Response('Not implemented', { status: 501 });
}
