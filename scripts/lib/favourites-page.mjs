/**
 * /favourites page HTML helper.
 * renderFavouritesPage(opts) → full HTML page string.
 *
 * opts:
 *   backendLive   {boolean}  — BACKEND_LIVE flag
 *   auth          {string}   — 'anonymous' | 'linked' (only relevant when backendLive=true)
 *   savedArticles {Array}    — articles to display (empty array for fresh build)
 *
 * States covered:
 *   09 — GH Pages, no saves    (backendLive=false, savedArticles=[])
 *   10 — GH Pages, populated   (backendLive=false, savedArticles=[...])
 *   11 — Cloudflare, anonymous (backendLive=true, auth='anonymous')
 *   12 — Cloudflare, linked    (backendLive=true, auth='linked')
 *   13–16 sync-prompt states are client-JS; only the collapsed shell is server-rendered.
 */

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSyncPrompt() {
  return `<div class="sync-prompt" data-state="collapsed" data-testid="sync-prompt">
  <div>
    <p class="sp-title">Save these across devices →</p>
    <p class="sp-sub">Link them to your email so they follow you to your phone and laptop.</p>
  </div>
  <button type="button" class="btn-primary" data-testid="sync-prompt-open-btn">Sync</button>
  <!-- Expanded email-input state (mockups 14-16) driven by client JS -->
</div>`;
}

function renderArticleCards(articles) {
  if (!articles.length) return '';
  return `<section class="block">
  <h2><span class="section-icon">★</span> Saved articles</h2>
  <div class="cards">
    ${articles.map(a => `<article class="card" data-article-id="${escHtml(a.article_id ?? '')}">
      <button class="fav-star" type="button" aria-pressed="true" aria-label="Saved"
              data-testid="fav-star" data-article-id="${escHtml(a.article_id ?? '')}">★</button>
      <h3 class="card-title"><a href="${escHtml(a.url ?? '#')}" target="_blank" rel="noopener">${escHtml(a.title ?? '')}</a></h3>
      ${a.summary ? `<p class="card-summary">${escHtml(a.summary)}</p>` : ''}
      <div class="card-meta">
        ${a.source ? `<span class="badge">${escHtml(a.source)}</span>` : ''}
        ${a.savedAt ? `<span class="meta-time">saved ${escHtml(new Date(a.savedAt).toLocaleDateString())}</span>` : ''}
      </div>
    </article>`).join('\n')}
  </div>
</section>`;
}

function renderEmptyState() {
  return `<div class="empty-state">
  <div class="es-icon" aria-hidden="true">☆</div>
  <h2>No favourites yet</h2>
  <p>Tap the ☆ on any article to save it here. Your favourites live on this device — no account needed.</p>
  <p style="margin-top:18px;"><a href="../" class="btn-secondary" style="text-decoration:none;">← Browse today's digest</a></p>
</div>`;
}

export function renderFavouritesPage({ backendLive = false, auth = 'anonymous', savedArticles = [] } = {}) {
  const showSyncPrompt = backendLive && auth === 'anonymous';
  const favSource = backendLive ? 'api' : 'localStorage';
  const subtitleCount = savedArticles.length
    ? `${savedArticles.length} saved · this device only`
    : 'Your saved articles';

  const bodyContent = savedArticles.length > 0
    ? renderArticleCards(savedArticles)
    : renderEmptyState();

  return `<!DOCTYPE html>
<html lang="en" data-theme="claude">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>★ Favourites — AI Daily Digest</title>
<link rel="stylesheet" href="../_shared.css">
</head>
<body>
<header class="hero">
  <div class="lang-switch" role="tablist" aria-label="Audio language">
    <button data-lang="en" role="tab" aria-selected="true" aria-pressed="true">EN</button>
    <button data-lang="zh" role="tab" aria-selected="false" aria-pressed="false">中文</button>
  </div>
  <h1>★ Favourites</h1>
  <p class="date">${escHtml(subtitleCount)}</p>
</header>

<nav class="toc"><ul>
  <li><a href="../">← Today's digest</a></li>
  <li><a href="../digests/">🗂 Archive</a></li>
</ul></nav>

<main class="container"
      data-testid="favourites-page"
      data-backend-live="${backendLive ? 'true' : 'false'}"
      data-fav-source="${escHtml(favSource)}"
      ${backendLive ? `data-auth="${escHtml(auth)}"` : ''}>

  ${showSyncPrompt ? renderSyncPrompt() : ''}

  ${bodyContent}
</main>

<footer class="site-footer">
  <div>AI Daily Digest · <a href="../">Home</a></div>
</footer>
</body>
</html>`;
}
