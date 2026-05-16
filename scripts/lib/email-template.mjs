/**
 * Bilingual email template helpers.
 * renderEmailEn(summaries, siteOrigin) → inline-HTML email in English
 * renderEmailZh(summaries, siteOrigin) → inline-HTML email in Chinese
 * Matches mockup structure of 27-email-en.html and 28-email-zh.html.
 */

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function assertEditorial(summaries) {
  if (!summaries?.editorial?.overall_en) {
    throw new Error('summaries.editorial is required for email rendering');
  }
}

function renderCutsList(cuts, lang, siteOrigin) {
  if (!cuts?.length) return '';
  return cuts
    .map(cut => {
      const commentary = lang === 'zh' && cut.commentary_zh
        ? cut.commentary_zh
        : cut.commentary_en ?? '';
      return `
        <tr>
          <td style="padding:12px 0;border-left:4px solid #f59e0b;padding-left:16px;">
            <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">
              ${escHtml(commentary)}
            </p>
          </td>
        </tr>`;
    })
    .join('\n');
}

function renderEmailBase({ subject, overallText, cutsHtml, siteOrigin, lang }) {
  const footerText = lang === 'zh'
    ? '您收到此邮件是因为您订阅了 AI 每日精选。'
    : 'You received this email because you subscribed to AI Daily Digest.';
  const unsubText = lang === 'zh' ? '取消订阅' : 'Unsubscribe';
  const editorsPickLabel = lang === 'zh' ? '🏅 编辑精选' : '🏅 Editor\'s Cut';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
               style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">

          <!-- Hero -->
          <tr>
            <td style="background:#1e293b;padding:32px 40px;text-align:center;">
              <h1 style="color:#f8fafc;font-size:24px;margin:0;font-weight:700;">
                ${escHtml(subject)}
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td data-testid="email-body" style="padding:32px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">

                <!-- Editorial narrative -->
                <tr>
                  <td style="padding-bottom:24px;">
                    <p style="margin:0;font-size:16px;line-height:1.7;color:#1f2937;">
                      ${escHtml(overallText)}
                    </p>
                  </td>
                </tr>

                <!-- Editor's Cut section -->
                ${cutsHtml ? `
                <tr>
                  <td style="padding-bottom:8px;">
                    <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.05em;
                               text-transform:uppercase;color:#6b7280;">
                      ${escHtml(editorsPickLabel)}
                    </p>
                  </td>
                </tr>
                ${cutsHtml}` : ''}

                <!-- CTA -->
                <tr>
                  <td style="padding-top:32px;text-align:center;">
                    <a href="${escHtml(siteOrigin)}"
                       style="display:inline-block;background:#2563eb;color:#ffffff;
                              font-size:15px;font-weight:600;padding:12px 28px;
                              border-radius:6px;text-decoration:none;">
                      ${lang === 'zh' ? '查看今日精选 →' : 'Read today\'s digest →'}
                    </a>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:24px 40px;text-align:center;
                       border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">
                ${escHtml(footerText)}
              </p>
              <a href="{{ beehiiv_unsubscribe_url }}"
                 style="font-size:12px;color:#6b7280;">
                ${escHtml(unsubText)}
              </a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function renderEmailEn(summaries, siteOrigin) {
  assertEditorial(summaries);
  const { editorial } = summaries;
  const subject = 'AI Daily Digest';
  const cutsHtml = renderCutsList(editorial.cuts, 'en', siteOrigin);
  return renderEmailBase({
    subject,
    overallText: editorial.overall_en,
    cutsHtml,
    siteOrigin,
    lang: 'en',
  });
}

export function renderEmailZh(summaries, siteOrigin) {
  assertEditorial(summaries);
  const { editorial } = summaries;
  const subject = 'AI 每日精选';
  const cutsHtml = renderCutsList(editorial.cuts, 'zh', siteOrigin);
  return renderEmailBase({
    subject,
    overallText: editorial.overall_zh ?? editorial.overall_en,
    cutsHtml,
    siteOrigin,
    lang: 'zh',
  });
}
