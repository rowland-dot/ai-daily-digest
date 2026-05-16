// Implemented in Task D3
export async function handleWebhook(
  _request: Request,
  _db: D1Database,
  _webhookSecret?: string,
): Promise<Response> {
  return new Response('Not implemented', { status: 501 });
}
