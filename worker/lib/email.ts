/**
 * Resend API caller for sending magic-link emails.
 * When RESEND_API_KEY is absent, logs to stdout and no-ops.
 * Test-mode bypass uses an explicit environment flag, not a magic API key value.
 */

export type EmailSender = (to: string, subject: string, html: string) => Promise<void>;

export function makeEmailSender(apiKey?: string, environment?: string): EmailSender {
  return async (to: string, subject: string, html: string): Promise<void> => {
    if (!apiKey || environment === 'test') {
      console.log(`[email-stub] To: ${to} | Subject: ${subject} | (not sent — no RESEND_API_KEY or test environment)`);
      return;
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'AI Daily Digest <noreply@ai-daily-digest.com>',
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Resend API error ${res.status}: ${text}`);
    }
  };
}
