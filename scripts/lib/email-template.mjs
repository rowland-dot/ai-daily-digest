/**
 * Bilingual email template helpers.
 * renderEmailEn(summaries, siteOrigin) → inline-HTML email in English
 * renderEmailZh(summaries, siteOrigin) → inline-HTML email in Chinese
 * Matches mockup structure of 27-email-en.html and 28-email-zh.html.
 *
 * Design notes (from mockups):
 *  - Palette: cream #faf9f5 bg, warm #efe9de wrapper, #141413 text,
 *    #cc785c accent, #a9583e link, #6c6a64 muted — NOT slate/blue.
 *  - Cut rows are clickable: <a> title + commentary paragraph,
 *    border-left: 3px solid #cc785c.
 *  - Footer includes account + language toggle + unsubscribe links.
 *  - All styles must be inline (email clients strip <link>/<style>).
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

/**
 * Render clickable cut-article rows per mockup 27/28.
 * Each row: border-left accent, clickable title <a>, commentary paragraph.
 */
function renderCutRows(cuts, lang, siteOrigin) {
  if (!cuts?.length) return '';
  return cuts
    .map(cut => {
      const commentary = lang === 'zh' && cut.commentary_zh
        ? cut.commentary_zh
        : cut.commentary_en ?? '';
      // Build a UTM-style site link so the digest origin handles routing
      const articleRef = cut.article_id
        ? `${escHtml(siteOrigin)}/?ref=email-${lang}&article=${escHtml(cut.article_id)}${lang === 'zh' ? '&lang=zh' : ''}`
        : escHtml(siteOrigin);

      return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:16px;">
          <tr><td style="border-left:3px solid #cc785c; padding-left:12px;">
            <a href="${articleRef}" style="font-family:Georgia,'Tiempos Headline',serif; font-size:17px; font-weight:700; color:#141413; text-decoration:none;">${escHtml(cut.title_en ?? cut.title ?? '')}</a>
            <p style="margin:6px 0 0; font-size:14px; color:#6c6a64; line-height:1.55;">${escHtml(commentary)}</p>
          </td></tr>
        </table>`;
    })
    .join('\n');
}

/**
 * Build the full email HTML — inline styles only, matching mockups 27/28.
 */
function renderEmailBase({ subject, overallText, cutsHtml, cutsLabel, readAllLabel, readAllHref, footerSubscribedText, footerAccountHref, footerLangToggleHref, footerLangToggleText, siteOrigin, lang }) {
  const unsubText = lang === 'zh' ? '退订' : 'Unsubscribe';
  const accountText = lang === 'zh' ? '账户管理' : 'Manage your account';
  const todayPicksLabel = lang === 'zh' ? '今日精选' : "Today's picks";

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escHtml(subject)}</title>
</head>
<body style="margin:0; padding:0; background:#efe9de; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; color:#141413; line-height:1.6;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#efe9de; padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"
           data-testid="email-body"
           style="max-width:600px; width:100%; background:#faf9f5; border:1px solid #e6dfd8; border-radius:14px; overflow:hidden; box-shadow:0 4px 12px rgba(20,20,19,0.05);">

      <!-- Hero -->
      <tr><td style="padding:32px 28px 24px; background:linear-gradient(135deg,#efe9de 0%,#faf9f5 100%); border-bottom:1px solid #e6dfd8;">
        <h1 style="margin:0 0 6px; font-family:Georgia,'Tiempos Headline',serif; font-size:28px; font-weight:700; color:#141413; letter-spacing:-0.01em;">${escHtml(subject)}</h1>
        <p style="margin:0; font-size:14px; color:#6c6a64;">${escHtml(cutsLabel)}</p>
      </td></tr>

      <!-- Editor's Cut overall narrative -->
      <tr><td style="padding:28px 28px 8px;">
        <p style="margin:0 0 12px; font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#cc785c;">🏅 ${lang === 'zh' ? '今日编辑精选' : "Today's Editor's Cut"}</p>
        <p style="margin:0; font-size:16px; line-height:1.7; color:#141413;">${escHtml(overallText)}</p>
      </td></tr>

      <!-- Cut articles -->
      ${cutsHtml ? `
      <tr><td style="padding:18px 28px 8px;">
        <h2 style="margin:24px 0 12px; font-family:Georgia,serif; font-size:18px; font-weight:700; color:#141413;">${escHtml(todayPicksLabel)}</h2>
        ${cutsHtml}
        <p style="margin:12px 0; font-size:13px; color:#6c6a64; text-align:center;">
          <a href="${escHtml(readAllHref)}" style="color:#a9583e; text-decoration:none; font-weight:600;">${escHtml(readAllLabel)}</a>
        </p>
      </td></tr>` : ''}

      <!-- Footer -->
      <tr><td style="padding:24px 28px 32px; background:#efe9de; border-top:1px solid #e6dfd8; color:#6c6a64; font-size:12px; text-align:center;">
        <p style="margin:0 0 8px;">${escHtml(footerSubscribedText)}</p>
        <p style="margin:0 0 8px;">
          <a href="${escHtml(footerAccountHref)}" style="color:#a9583e; text-decoration:none;">${escHtml(accountText)}</a>
          ·
          <a href="${escHtml(footerLangToggleHref)}" style="color:#a9583e; text-decoration:none;">${escHtml(footerLangToggleText)}</a>
          ·
          <a href="{{ beehiiv_unsubscribe_url }}" style="color:#a9583e; text-decoration:none;">${escHtml(unsubText)}</a>
        </p>
        <p style="margin:0;">AI Daily Digest · <a href="${escHtml(siteOrigin)}/" style="color:#6c6a64; text-decoration:none;">${escHtml(siteOrigin.replace(/^https?:\/\//, ''))}</a></p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export function renderEmailEn(summaries, siteOrigin) {
  assertEditorial(summaries);
  const { editorial } = summaries;
  const subject = 'AI Daily Digest';
  const cutsHtml = renderCutRows(editorial.cuts, 'en', siteOrigin);
  return renderEmailBase({
    subject,
    overallText: editorial.overall_en,
    cutsHtml,
    cutsLabel: "Editor's Cut",
    readAllLabel: `Read all picks on the site →`,
    readAllHref: `${siteOrigin}/?ref=email-en`,
    footerSubscribedText: "You're getting this because you subscribed to AI Daily Digest in English.",
    footerAccountHref: `${siteOrigin}/account`,
    footerLangToggleHref: `${siteOrigin}/account?lang=zh`,
    footerLangToggleText: 'Switch to 中文',
    siteOrigin,
    lang: 'en',
  });
}

export function renderEmailZh(summaries, siteOrigin) {
  assertEditorial(summaries);
  const { editorial } = summaries;
  const subject = 'AI 每日精选';
  const cutsHtml = renderCutRows(editorial.cuts, 'zh', siteOrigin);
  return renderEmailBase({
    subject,
    overallText: editorial.overall_zh ?? editorial.overall_en,
    cutsHtml,
    cutsLabel: '编辑精选',
    readAllLabel: '在网站阅读全部 →',
    readAllHref: `${siteOrigin}/?ref=email-zh&lang=zh`,
    footerSubscribedText: '您订阅的是 AI 每日精选（中文版），因此收到此邮件。',
    footerAccountHref: `${siteOrigin}/account?lang=zh`,
    footerLangToggleHref: `${siteOrigin}/account?lang=en`,
    footerLangToggleText: '切换至 English',
    siteOrigin,
    lang: 'zh',
  });
}
