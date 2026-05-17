/**
 * Fav-star localStorage toggle + optional server-sync script.
 *
 * FAV_STAR_SCRIPT is an inline JS string injected near </body>.
 *
 * Behaviour (always — GH Pages and Cloudflare):
 *   - On DOMContentLoaded, reads localStorage key 'favourites' (JSON array of
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

  var LS_KEY = 'favourites';

  function readFavs() {
    try {
      var raw = localStorage.getItem(LS_KEY);
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
    if (nowSaved) {
      if (favs.indexOf(aid) === -1) favs.push(aid);
    } else {
      favs = favs.filter(function (id) { return id !== aid; });
    }
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
