/**
 * /favourites page HTML helper.
 * renderFavouritesPage(opts) → full HTML page string.
 *
 * opts:
 *   backendLive   {boolean}  — BACKEND_LIVE flag
 *   auth          {string}   — 'anonymous' | 'linked' (only relevant when backendLive=true)
 *   savedArticles {Array}    — articles to display (empty array for fresh build)
 *   siteOrigin    {string}   — canonical site origin
 *
 * States covered:
 *   09 — GH Pages, no saves    (backendLive=false, savedArticles=[])
 *   10 — GH Pages, populated   (backendLive=false, savedArticles=[...])
 *   11 — Cloudflare, anonymous (backendLive=true, auth='anonymous')
 *   12 — Cloudflare, linked    (backendLive=true, auth='linked')
 *   13 — sync-prompt collapsed (server-rendered, visible)
 *   14 — sync-prompt open / email input (server-rendered, hidden; shown by JS)
 *   15 — sync-prompt link-sent confirmation (server-rendered, hidden; shown by JS)
 *   16 — sync-prompt error (server-rendered, hidden; shown by JS)
 *
 * All four sync-prompt state panels exist in the server-rendered DOM so
 * mockup-parity and E2E tests can assert their presence. Client JS toggles
 * visibility by adding/removing the `hidden` attribute and updating
 * data-state on the wrapper.
 *
 * The SYNC_PROMPT_SCRIPT export wires the interactive behaviour.
 */

import { relTime } from './util.mjs';

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeJsonForScript(value) {
  return JSON.stringify(value ?? [])
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Hydrate the static GH Pages favourites shell from localStorage.
 * The server-backed page deliberately returns early until that path is live.
 */
export const FAVOURITES_PAGE_SCRIPT = `
(function () {
  var root = document.querySelector('[data-testid="favourites-page"]');
  if (!root || root.dataset.favSource === 'api') return;

  var LS_KEY = 'favourites_v1';
  var LEGACY_LS_KEY = 'favourites';
  var META_KEY = 'favourites_meta_v1';
  var content = root.querySelector('[data-testid="favourites-content"]');
  var count = document.querySelector('[data-testid="favourites-count"]');
  var catalogueNode = document.getElementById('favourites-catalogue');
  var catalogue = [];

  try {
    catalogue = JSON.parse(catalogueNode ? catalogueNode.textContent : '[]');
    if (!Array.isArray(catalogue)) catalogue = [];
  } catch (e) {
    catalogue = [];
  }

  var byId = Object.create(null);
  catalogue.forEach(function (article) {
    if (article && article.article_id) byId[article.article_id] = article;
  });

  function readSavedIds() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) {
        var legacyRaw = localStorage.getItem(LEGACY_LS_KEY);
        if (legacyRaw) {
          var legacyParsed = JSON.parse(legacyRaw);
          if (Array.isArray(legacyParsed)) {
            raw = JSON.stringify(legacyParsed);
            localStorage.setItem(LS_KEY, raw);
            localStorage.removeItem(LEGACY_LS_KEY);
          }
        }
      }
      var parsed = JSON.parse(raw || '[]');
      if (!Array.isArray(parsed)) return [];
      var seen = Object.create(null);
      return parsed.filter(function (id) {
        if (typeof id !== 'string' || !id || seen[id]) return false;
        seen[id] = true;
        return true;
      });
    } catch (e) {
      return [];
    }
  }

  function readMetadata() {
    var metadata = Object.create(null);
    try {
      var parsed = JSON.parse(localStorage.getItem(META_KEY) || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return metadata;
      Object.keys(parsed).forEach(function (id) {
        var article = parsed[id];
        if (!article || typeof article !== 'object' || Array.isArray(article)) return;
        metadata[id] = {
          article_id: id,
          title: typeof article.title === 'string' ? article.title : '',
          summary: typeof article.summary === 'string' ? article.summary : '',
          source: typeof article.source === 'string' ? article.source : '',
          url: typeof article.url === 'string' ? article.url : '',
          savedAt: typeof article.savedAt === 'string' ? article.savedAt : '',
        };
      });
    } catch (e) {}
    return metadata;
  }

  function safeHref(value) {
    try {
      var parsed = new URL(value, window.location.href);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '#';
    } catch (e) {
      return '#';
    }
  }

  function renderEmpty() {
    var empty = document.createElement('div');
    empty.className = 'empty-state';
    var icon = document.createElement('div');
    icon.className = 'es-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '\\u2606';
    var heading = document.createElement('h2');
    heading.textContent = 'No favourites yet';
    var copy = document.createElement('p');
    copy.textContent = 'Tap the \\u2606 on any article to save it here. Your favourites live on this device — no account needed.';
    var action = document.createElement('p');
    action.style.marginTop = '18px';
    var link = document.createElement('a');
    link.href = '../';
    link.className = 'btn-secondary';
    link.style.textDecoration = 'none';
    link.textContent = '← Browse today\\'s digest';
    action.appendChild(link);
    empty.append(icon, heading, copy, action);
    return empty;
  }

  function renderCard(article) {
    var card = document.createElement('article');
    card.className = 'card';
    card.dataset.articleId = article.article_id;

    var star = document.createElement('button');
    star.className = 'fav-star';
    star.type = 'button';
    star.setAttribute('aria-pressed', 'true');
    star.setAttribute('aria-label', 'Remove saved article');
    star.setAttribute('data-testid', 'fav-star');
    star.dataset.articleId = article.article_id;
    star.textContent = '\\u2605';

    var title = document.createElement('h3');
    title.className = 'card-title';
    var link = document.createElement('a');
    link.href = safeHref(article.url || '#');
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = article.title || 'Untitled article';
    title.appendChild(link);
    card.append(star, title);

    if (article.summary) {
      var summary = document.createElement('p');
      summary.className = 'card-summary';
      summary.textContent = article.summary;
      card.appendChild(summary);
    }
    if (article.source) {
      var meta = document.createElement('div');
      meta.className = 'card-meta';
      var badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = article.source;
      meta.appendChild(badge);
      card.appendChild(meta);
    }
    return card;
  }

  function renderMissingCard(articleId) {
    var card = document.createElement('article');
    card.className = 'card missing-favourite';
    card.dataset.articleId = articleId;

    var star = document.createElement('button');
    star.className = 'fav-star';
    star.type = 'button';
    star.setAttribute('aria-pressed', 'true');
    star.setAttribute('aria-label', 'Remove unavailable saved article');
    star.setAttribute('data-testid', 'fav-star');
    star.dataset.articleId = articleId;
    star.textContent = '\u2605';

    var title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = 'Saved article unavailable';
    var copy = document.createElement('p');
    copy.className = 'card-summary';
    copy.textContent = 'Original article details are unavailable after migration.';
    card.append(star, title, copy);
    return card;
  }

  function render(savedIds) {
    if (!content) return;
    var metadata = readMetadata();
    var articles = savedIds.slice().reverse().map(function (id) {
      return { id: id, article: byId[id] || metadata[id] || null };
    });
    content.replaceChildren();
    if (!articles.length) {
      content.appendChild(renderEmpty());
      if (count) count.textContent = 'Your saved articles';
      return;
    }

    var section = document.createElement('section');
    section.className = 'block';
    var heading = document.createElement('h2');
    heading.textContent = '\\u2605 Saved articles';
    var cards = document.createElement('div');
    cards.className = 'cards';
    articles.forEach(function (entry) {
      cards.appendChild(entry.article ? renderCard(entry.article) : renderMissingCard(entry.id));
    });
    section.append(heading, cards);
    content.appendChild(section);
    if (count) count.textContent = articles.length + ' saved · this device only';
  }

  document.addEventListener('favourites:changed', function (event) {
    render(event.detail && Array.isArray(event.detail.ids) ? event.detail.ids : readSavedIds());
  });
  render(readSavedIds());
})();
`;

/**
 * Render the sync-prompt with all four state panels.
 * Collapsed (state 13) is visible; open/link-sent/error are hidden.
 * Client JS (SYNC_PROMPT_SCRIPT) drives transitions between states.
 */
function renderSyncPrompt() {
  return `<div class="sync-prompt" data-state="collapsed" data-testid="sync-prompt">

  <!-- State 13: collapsed (entry-point — visible on load) -->
  <div data-testid="sync-prompt-collapsed-panel">
    <p class="sp-title">Save these across devices →</p>
    <p class="sp-sub">Link them to your email so they follow you to your phone and laptop.</p>
  </div>
  <button type="button" class="btn-primary" data-testid="sync-prompt-open-btn">Sync</button>

  <!-- State 14: open / email-input (hidden; shown by JS on Sync click) -->
  <div data-testid="sync-prompt-open-panel" hidden>
    <p class="sp-title">Save these across devices</p>
    <p class="sp-sub">Enter your email — we'll send a one-click link to link this device.</p>
    <form class="subscribe-form" data-testid="sync-form" data-form-state="idle"
          style="box-shadow:none;padding:0;border:0;" novalidate>
      <input id="sync-email" name="email" type="email"
             placeholder="you@example.com" autocomplete="email"
             data-testid="sync-email-input">
      <button type="submit" class="btn-primary" data-testid="sync-submit-btn">Send link</button>
    </form>
  </div>

  <!-- State 15: link-sent confirmation (hidden; shown by JS on success) -->
  <div data-testid="sync-prompt-link-sent-panel" data-form-state="link-sent"
       role="status" aria-live="polite" hidden>
    <p class="sp-title">✓ Check your inbox</p>
    <p class="sp-sub">We sent a one-click link to your email. Click it within 30 minutes to sync your favourites.</p>
  </div>

  <!-- State 16: error (hidden; shown by JS on submit failure) -->
  <div data-testid="sync-prompt-error-panel" data-form-state="error" hidden>
    <p class="sp-title">Save these across devices</p>
    <p class="sp-sub">Enter your email — we'll send a one-click link to link this device.</p>
    <form class="subscribe-form" data-testid="sync-form-error" data-form-state="error"
          style="box-shadow:none;padding:0;border:0;" novalidate>
      <input id="sync-email-retry" name="email" type="email"
             placeholder="you@example.com" autocomplete="email"
             data-testid="sync-email-input-retry">
      <button type="submit" class="btn-primary" data-testid="sync-retry-btn">Try again</button>
      <div class="form-msg is-error" role="alert" data-testid="sync-error-msg">
        <strong>Couldn't send the link.</strong> Network error — please try again.
        If this keeps happening, your favourites stay safe on this device.
      </div>
    </form>
  </div>

</div>`;
}

/**
 * Minimal inline script that drives sync-prompt state transitions.
 * Runs without bundling — plain JS, no module imports.
 *
 * Transitions:
 *   collapsed → open         (click sync-prompt-open-btn)
 *   open      → link-sent    (POST /api/sync-favourites succeeds)
 *   open      → error        (POST fails)
 *   error     → open         (click try-again, reset form)
 */
export const SYNC_PROMPT_SCRIPT = `
(function () {
  var wrapper = document.querySelector('[data-testid="sync-prompt"]');
  if (!wrapper) return;

  var panels = {
    collapsed: wrapper.querySelector('[data-testid="sync-prompt-collapsed-panel"]'),
    openBtn:   wrapper.querySelector('[data-testid="sync-prompt-open-btn"]'),
    open:      wrapper.querySelector('[data-testid="sync-prompt-open-panel"]'),
    linkSent:  wrapper.querySelector('[data-testid="sync-prompt-link-sent-panel"]'),
    error:     wrapper.querySelector('[data-testid="sync-prompt-error-panel"]'),
  };

  function setVisible(state) {
    wrapper.dataset.state = state;
    // collapsed panels
    var showCollapsed = state === 'collapsed';
    if (panels.collapsed) panels.collapsed.hidden = !showCollapsed;
    if (panels.openBtn)   panels.openBtn.hidden   = !showCollapsed;
    // open panel
    if (panels.open)     panels.open.hidden     = state !== 'open';
    // link-sent panel
    if (panels.linkSent) panels.linkSent.hidden  = state !== 'link-sent';
    // error panel
    if (panels.error)    panels.error.hidden     = state !== 'error';
  }

  // Sync button: collapsed → open
  if (panels.openBtn) {
    panels.openBtn.addEventListener('click', function () {
      setVisible('open');
      var input = wrapper.querySelector('[data-testid="sync-email-input"]');
      if (input) input.focus();
    });
  }

  // Open form submit
  var openForm = wrapper.querySelector('[data-testid="sync-form"]');
  if (openForm) {
    openForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = openForm.querySelector('[data-testid="sync-email-input"]');
      var btn   = openForm.querySelector('[data-testid="sync-submit-btn"]');
      var email = input ? input.value.trim() : '';
      if (!email) { if (input) input.focus(); return; }

      if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> Sending…'; }
      if (input) input.disabled = true;

      fetch('/api/sync-favourites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email }),
      })
        .then(function (res) {
          if (res.ok) {
            // Update link-sent panel with the actual email
            var sub = panels.linkSent ? panels.linkSent.querySelector('.sp-sub') : null;
            if (sub) {
              var safe = email.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
              sub.innerHTML = 'We sent a one-click link to <strong>' + safe + '</strong>. Click it within 30 minutes to sync your favourites.';
            }
            setVisible('link-sent');
          } else {
            // Copy email to retry input
            var retryInput = wrapper.querySelector('[data-testid="sync-email-input-retry"]');
            if (retryInput) retryInput.value = email;
            setVisible('error');
          }
        })
        .catch(function () {
          var retryInput = wrapper.querySelector('[data-testid="sync-email-input-retry"]');
          if (retryInput) retryInput.value = email;
          setVisible('error');
        });
    });
  }

  // Error form retry — go back to open state with email pre-filled
  var errorForm = wrapper.querySelector('[data-testid="sync-form-error"]');
  if (errorForm) {
    errorForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var retryEmail = errorForm.querySelector('[data-testid="sync-email-input-retry"]');
      var openInput  = wrapper.querySelector('[data-testid="sync-email-input"]');
      if (openInput && retryEmail) openInput.value = retryEmail.value;
      // Re-enable open form inputs
      var openBtn = wrapper.querySelector('[data-testid="sync-submit-btn"]');
      var openIn  = wrapper.querySelector('[data-testid="sync-email-input"]');
      if (openBtn) { openBtn.disabled = false; openBtn.textContent = 'Send link'; }
      if (openIn)  openIn.disabled = false;
      setVisible('open');
      if (openIn) openIn.focus();
    });
  }
})();
`;

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
        ${a.savedAt ? `<span class="meta-time">saved ${escHtml(relTime(a.savedAt))}</span>` : ''}
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

export function renderFavouritesPage({
  backendLive = false,
  auth = 'anonymous',
  savedArticles = [],
  articleCatalogue = [],
  siteOrigin = '',
} = {}) {
  const showSyncPrompt = backendLive && auth === 'anonymous';
  const favSource = backendLive && auth === 'linked' ? 'api' : 'localStorage';
  const subtitleCount = savedArticles.length
    ? `${savedArticles.length} saved · this device only`
    : 'Your saved articles';

  const bodyContent = savedArticles.length > 0
    ? renderArticleCards(savedArticles)
    : renderEmptyState();

  return `<!DOCTYPE html>
<html lang="en" data-theme="notion">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>★ Favourites — AI Daily Digest</title>
<link rel="canonical" href="${escHtml((siteOrigin || '') + '/favourites')}">
<link rel="alternate" type="application/atom+xml" title="AI Daily Digest" href="${escHtml((siteOrigin || '') + '/feed.xml')}">
<!-- Styles are inlined via PAGE_CSS in render-site.mjs; no external _shared.css needed -->
<!-- THEME_BOOT_SCRIPT_PLACEHOLDER -->
</head>
<body>
<header class="hero">
  ${backendLive ? '<!-- SITE_NAV_PLACEHOLDER backendLive=true -->' : '<!-- SITE_NAV_PLACEHOLDER backendLive=false -->'}
  <div class="lang-switch" role="tablist" aria-label="Audio language">
    <button data-lang="en" role="tab" aria-selected="true" aria-pressed="true">EN</button>
    <button data-lang="zh" role="tab" aria-selected="false" aria-pressed="false">中文</button>
  </div>
  <div class="theme-switch" role="tablist" aria-label="Theme">
    <button data-theme="linear" role="tab">Linear</button>
    <button data-theme="claude" role="tab">Claude</button>
    <button data-theme="notion" role="tab">Notion</button>
  </div>
  <h1>★ Favourites</h1>
  <p class="date" data-testid="favourites-count">${escHtml(subtitleCount)}</p>
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

  <div data-testid="favourites-content">${bodyContent}</div>
</main>

<footer class="site-footer">
  <div>AI Daily Digest · <a href="../">Home</a></div>
</footer>
<script id="favourites-catalogue" type="application/json">${safeJsonForScript(articleCatalogue)}</script>
<!-- SYNC_PROMPT_SCRIPT_PLACEHOLDER -->
<!-- FAVOURITES_RUNTIME_SCRIPT_PLACEHOLDER -->
<!-- THEME_TOGGLE_SCRIPT_PLACEHOLDER -->
</body>
</html>`;
}
