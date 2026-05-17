/**
 * /account page HTML helper — feature-flag gated (BACKEND_LIVE=true only).
 * renderAccountPage(opts) → HTML string or null when backend is off.
 *
 * opts:
 *   backendLive      {boolean}  — BACKEND_LIVE flag; returns null when false
 *   auth             {string}   — 'linked' (only linked users reach this page)
 *   newsletterState  {string}   — 'subscribed' | 'unsubscribed'
 *   language         {string}   — 'en' | 'zh'
 *   email            {string}   — subscriber email (optional; shown as "Signed in as")
 *
 * Static HTML covers mockups 17 (linked-active) and 18 (linked-unsubscribed).
 * Dynamic states (19 lang-saving, 20 toast, 21 modal-open) are client-JS only.
 * Modal (mockup 22) is NOT in initial HTML — injected by client JS on button click.
 * Per D-A2: focus-trap + aria-modal + ESC handler are client-JS responsibilities.
 */

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderNewsletterRow(newsletterState) {
  if (newsletterState === 'unsubscribed') {
    return `<div class="account-row">
  <span class="row-label">Newsletter</span>
  <span class="row-value" data-testid="newsletter-status">Unsubscribed</span>
  <button type="button" class="btn-primary" data-testid="resubscribe-btn">Resubscribe</button>
</div>`;
  }
  return `<div class="account-row">
  <span class="row-label">Newsletter</span>
  <span class="row-value" data-testid="newsletter-status">Subscribed · daily email at 07:00 Sydney</span>
  <button type="button" class="btn-secondary" data-testid="unsubscribe-btn">Unsubscribe</button>
</div>`;
}

function renderLangPref(language) {
  const enPressed = language === 'en' ? 'true' : 'false';
  const zhPressed = language === 'zh' ? 'true' : 'false';
  return `<div class="account-row">
  <span class="row-label">Language preference</span>
  <div class="lang-pref" role="tablist" aria-label="Email language" data-testid="lang-pref">
    <button type="button" role="tab" data-lang="en" aria-pressed="${enPressed}" data-testid="lang-pref-en">EN</button>
    <button type="button" role="tab" data-lang="zh" aria-pressed="${zhPressed}" data-testid="lang-pref-zh">中文</button>
  </div>
</div>`;
}

export function renderAccountPage({
  backendLive = false,
  auth = 'linked',
  newsletterState = 'subscribed',
  language = 'en',
  email = null,
  siteOrigin = '',
} = {}) {
  // Feature-flag gate — do not render when backend is off
  if (!backendLive) return null;

  const emailLine = email
    ? `<p class="muted">Signed in as <strong>${escHtml(email)}</strong></p>`
    : `<p class="muted">Signed in</p>`;

  return `<!DOCTYPE html>
<html lang="en" data-theme="claude">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Account — AI Daily Digest</title>
${siteOrigin ? `<link rel="canonical" href="${escHtml(siteOrigin + '/account')}">` : ''}
<link rel="alternate" type="application/atom+xml" title="AI Daily Digest" href="${escHtml((siteOrigin || '') + '/feed.xml')}">
<!-- Styles are inlined via PAGE_CSS in render-site.mjs; no external _shared.css needed -->
</head>
<body>
<header class="hero">
  <!-- SITE_NAV_PLACEHOLDER backendLive=true -->
  <div class="lang-switch" role="tablist" aria-label="Audio language">
    <button data-lang="en" role="tab" aria-selected="true" aria-pressed="true">EN</button>
    <button data-lang="zh" role="tab" aria-selected="false" aria-pressed="false">中文</button>
  </div>
  <div class="theme-switch" role="tablist" aria-label="Theme">
    <button data-theme="linear" role="tab">Linear</button>
    <button data-theme="claude" role="tab">Claude</button>
  </div>
  <h1>Account</h1>
  <p class="date">Manage your subscription and saved articles</p>
</header>

<nav class="toc"><ul>
  <li><a href="../">← Today's digest</a></li>
  <li><a href="../favourites">★ Favourites</a></li>
</ul></nav>

<main class="container"
      data-testid="account-page"
      data-auth="${escHtml(auth)}"
      data-newsletter-state="${escHtml(newsletterState)}">

  <div class="account-card">
    <h3>Your subscription</h3>
    ${emailLine}

    ${renderNewsletterRow(newsletterState)}

    ${renderLangPref(language)}

    <div class="account-row">
      <span class="row-label">Saved articles</span>
      <span class="row-value">Synced across devices</span>
      <a href="../favourites" class="btn-secondary" style="text-decoration:none;">View favourites</a>
    </div>
  </div>

  <div class="account-card">
    <h3>Danger zone</h3>
    <p class="muted">Delete everything we know about you. This can't be undone.</p>
    <div class="account-row" style="border-top:0;justify-content:flex-start;">
      <button type="button" class="btn-danger" data-testid="delete-data-btn">Delete my data</button>
    </div>
  </div>

  <!-- Delete-confirm modal (mockup 21) is client-JS only — injected on button click.
       Per D-A2: focus-trap, aria-modal="true", ESC handler wired by client JS. -->

</main>

<footer class="site-footer">
  <div>AI Daily Digest · <a href="../">Home</a></div>
</footer>

<!-- Toast container for language-saved confirmation (mockup 20) — client-JS only -->
<div id="toast-root" aria-live="polite" aria-atomic="true"></div>
</body>
</html>`;
}
