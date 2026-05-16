/**
 * Beehiiv API callers.
 * When BEEHIIV_API_KEY is absent, logs to stdout and no-ops (test safety).
 */

export async function subscribeToBeehiiv(
  email: string,
  language: string,
  apiKey?: string,
  pubId?: string,
): Promise<void> {
  if (!apiKey || !pubId) {
    console.log(`[beehiiv-stub] subscribe ${email} lang=${language} (no-op — no BEEHIIV_API_KEY)`);
    return;
  }
  await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      utm_source: 'ai-daily-digest',
      custom_fields: [{ name: 'language', value: language }],
    }),
  });
}

export async function unsubscribeFromBeehiiv(
  email: string,
  apiKey?: string,
  pubId?: string,
): Promise<void> {
  if (!apiKey || !pubId) {
    console.log(`[beehiiv-stub] unsubscribe ${email} (no-op — no BEEHIIV_API_KEY)`);
    return;
  }
  // Beehiiv doesn't have a direct unsubscribe-by-email in v2; we update subscription status
  const listRes = await fetch(
    `https://api.beehiiv.com/v2/publications/${pubId}/subscriptions?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!listRes.ok) return;
  const { data } = (await listRes.json()) as { data: Array<{ id: string }> };
  if (!data?.length) return;
  const subId = data[0].id;
  await fetch(
    `https://api.beehiiv.com/v2/publications/${pubId}/subscriptions/${subId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'inactive' }),
    },
  );
}

export async function moveToLanguageSegment(
  email: string,
  language: string,
  apiKey?: string,
  pubId?: string,
): Promise<void> {
  if (!apiKey || !pubId) {
    console.log(`[beehiiv-stub] move ${email} to segment lang=${language} (no-op)`);
    return;
  }
  // Update custom_fields language preference via subscription PATCH
  const listRes = await fetch(
    `https://api.beehiiv.com/v2/publications/${pubId}/subscriptions?email=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!listRes.ok) return;
  const { data } = (await listRes.json()) as { data: Array<{ id: string }> };
  if (!data?.length) return;
  const subId = data[0].id;
  await fetch(
    `https://api.beehiiv.com/v2/publications/${pubId}/subscriptions/${subId}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ custom_fields: [{ name: 'language', value: language }] }),
    },
  );
}
