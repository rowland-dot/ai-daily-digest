// Implemented in Task D2
export async function subscribeToBeehiiv(
  _email: string,
  _language: string,
  _apiKey?: string,
  _pubId?: string,
): Promise<void> {
  if (!_apiKey) {
    console.log(`[beehiiv-stub] subscribe ${_email} lang=${_language} (no-op — no BEEHIIV_API_KEY)`);
  }
}

export async function unsubscribeFromBeehiiv(
  _email: string,
  _apiKey?: string,
  _pubId?: string,
): Promise<void> {
  if (!_apiKey) {
    console.log(`[beehiiv-stub] unsubscribe ${_email} (no-op — no BEEHIIV_API_KEY)`);
  }
}
