/**
 * Resend API caller for sending magic-link emails.
 * When RESEND_API_KEY is absent (or equals 'test'), logs to stdout and no-ops.
 */

export type EmailSender = (to: string, subject: string, html: string) => Promise<void>;

export function makeEmailSender(apiKey?: string): EmailSender {
  return async (to: string, subject: string, html: string): Promise<void> => {
    if (!apiKey || apiKey === 'test') {
      console.log(`[email-stub] To: ${to} | Subject: ${subject} | (not sent — no RESEND_API_KEY)`);
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
