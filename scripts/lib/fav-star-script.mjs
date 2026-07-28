/**
 * Fav-star localStorage toggle + optional server-sync script.
 *
 * FAV_STAR_SCRIPT is an inline JS string injected near </body>.
 *
 * Behaviour (always — GH Pages and Cloudflare):
 *   - On DOMContentLoaded, reads localStorage key 'favourites_v1' (JSON array of
 *     article_ids). For every [data-testid="fav-star"] button whose
 *     data-article-id appears in the array, sets aria-pressed="true" and
 *     text content to ★.
 *   - On button click, toggles aria-pressed (false ↔ true), swaps ☆ ↔ ★,
 *     and updates the localStorage array (add or remove the article_id).
 *   - Adds data-fav-star-init attribute to <body> after init to prevent
 *     double-init if the script is somehow included twice.
 *
 * Behaviour (BACKEND_LIVE only — when window.__BACKEND_LIVE__ === true):
 *   - On a click that saves (aria-pressed → true), sets data-syncing="true"
 *     on the button and POSTs {article_id} to /api/favourites.
 *   - On success (2xx), clears data-syncing.
 *   - On 401, no retry (user is anonymous — localStorage is still updated).
 *   - On other errors, clears data-syncing and logs to console.
 *
 * No bundler required — plain browser ES (IIFE, no imports).
 */

export const FAV_STAR_SCRIPT = `
(function () {
  if (document.body && document.body.hasAttribute('data-fav-star-init')) return;

  var LS_KEY = 'favourites_v1';
  var LEGACY_LS_KEY = 'favourites';
  var META_KEY = 'favourites_meta_v1';

  function readMeta() {
    try {
      var parsed = JSON.parse(localStorage.getItem(META_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : Object.create(null);
    } catch (e) {
      return Object.create(null);
    }
  }

  function writeMeta(metadata) {
    try {
      localStorage.setItem(META_KEY, JSON.stringify(metadata));
    } catch (e) {}
  }

  function cleanText(node, maxLength) {
    if (!node) return '';
    return String(node.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, maxLength);
  }

  function safeArticleUrl(node) {
    if (!node) return '';
    try {
      var value = node.getAttribute('href') || node.href || '';
      var parsed = new URL(value, window.location.href);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
    } catch (e) {
      return '';
    }
  }

  function extractArticleMetadata(btn, articleId) {
    var article = btn.closest ? btn.closest('article[data-article-id], li[data-article-id]') : btn.parentNode;
    if (!article || !article.querySelector) return null;

    var titleNode = article.querySelector('.card-title a, .writing-title, .builder-title, .builder-text, .builder-meta-top strong');
    var summaryNode = article.querySelector('.card-summary, .writing-summary, .builder-text');
    var linkNode = article.querySelector('.card-title a, .writing-title, .builder-title, .builder-meta a[href]');
    var section = article.closest ? article.closest('section[id]') : null;
    var sourceBySection = {
      models: 'AI models',
      products: 'AI products',
      industry: 'AI industry',
      papers: 'AI research',
      labs: 'Lab posts',
      writing: 'Simon Willison',
      builders: 'Builder voices',
      llama: 'r/LocalLLaMA',
      trending: 'GitHub',
      hf: 'HuggingFace',
    };
    var title = cleanText(titleNode, 500) || articleId;
    var summary = summaryNode === titleNode ? '' : cleanText(summaryNode, 2000);
    var source = section && sourceBySection[section.id]
      ? sourceBySection[section.id]
      : cleanText(article.querySelector('.card-meta .badge, .builder-meta .badge'), 120);

    return {
      article_id: articleId,
      title: title,
      summary: summary,
      source: source,
      url: safeArticleUrl(linkNode),
      savedAt: new Date().toISOString(),
    };
  }

  function readFavs() {
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
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeFavs(arr) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(arr));
      document.dispatchEvent(new CustomEvent('favourites:changed', {
        detail: { ids: arr.slice() },
      }));
    } catch (e) {}
  }

  function applyStoredState() {
    var favs = readFavs();
    var btns = document.querySelectorAll('[data-testid="fav-star"]');
    btns.forEach(function (btn) {
      var aid = btn.getAttribute('data-article-id');
      if (aid && favs.indexOf(aid) !== -1) {
        btn.setAttribute('aria-pressed', 'true');
        btn.textContent = '\\u2605'; /* ★ */
      } else {
        btn.setAttribute('aria-pressed', 'false');
        btn.textContent = '\\u2606'; /* ☆ */
      }
    });
  }

  function syncToServer(articleId, shouldSave) {
    if (!shouldSave) return; /* only POST on save; server deletion is deferred */
    try {
      var btn = document.querySelector('[data-testid="fav-star"][data-article-id="' + articleId + '"]');
      if (btn) btn.setAttribute('data-syncing', 'true');
      fetch('/api/favourites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: articleId }),
        credentials: 'include',
      }).then(function (res) {
        if (btn) btn.removeAttribute('data-syncing');
        if (res.status === 401) return; /* anonymous — localStorage already updated */
        if (!res.ok) {
          console.warn('[fav-star] server sync failed:', res.status);
        }
      }).catch(function (err) {
        if (btn) btn.removeAttribute('data-syncing');
        console.warn('[fav-star] server sync error:', err);
      });
    } catch (e) {
      console.warn('[fav-star] sync exception:', e);
    }
  }

  function handleClick(btn) {
    var aid = btn.getAttribute('data-article-id');
    if (!aid) return;

    var pressed = btn.getAttribute('aria-pressed') === 'true';
    var nowSaved = !pressed;

    /* Toggle visual state immediately */
    btn.setAttribute('aria-pressed', nowSaved ? 'true' : 'false');
    btn.textContent = nowSaved ? '\\u2605' : '\\u2606'; /* ★ : ☆ */

    /* Persist to localStorage */
    var favs = readFavs();
    var metadata = readMeta();
    if (nowSaved) {
      if (favs.indexOf(aid) === -1) favs.push(aid);
      var articleMetadata = extractArticleMetadata(btn, aid);
      if (articleMetadata) metadata[aid] = articleMetadata;
    } else {
      favs = favs.filter(function (id) { return id !== aid; });
      delete metadata[aid];
    }
    writeMeta(metadata);
    writeFavs(favs);

    /* Server sync when backend is live */
    if (window.__BACKEND_LIVE__ === true) {
      syncToServer(aid, nowSaved);
    }
  }

  function init() {
    if (document.body) document.body.setAttribute('data-fav-star-init', 'true');

    /* Restore saved state from localStorage */
    applyStoredState();

    /* Wire clicks via event delegation on document */
    document.addEventListener('click', function (e) {
      var target = e.target;
      /* Walk up in case click hits a child node (e.g. text node wrapping) */
      while (target && target !== document) {
        if (
          target.nodeType === 1 &&
          target.getAttribute('data-testid') === 'fav-star'
        ) {
          handleClick(target);
          return;
        }
        target = target.parentNode;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
`;
