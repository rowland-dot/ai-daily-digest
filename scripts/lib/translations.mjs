/**
 * Translation page helpers.
 * translationSlug(source, title, url) → stable slug string
 * renderTranslationPage(article, opts) → full HTML page string
 *
 * Covers mockups 29 (populated) and 30 (pending placeholder).
 * Canonical points to the CN source (D6/D7 — not to this page itself).
 * Translation pages are the ONLY exception to "canonical = own URL" rule.
 */

import { articleId } from './article-id.mjs';

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(str) {
  return escHtml(str);
}

/** FNV-1a 32-bit hash (same as article-id.mjs for consistency) */
function fnv1a32(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (Math.imul(hash, 0x01000193) >>> 0);
  }
  return hash >>> 0;
}

/**
 * Generate a stable slug for a translation page.
 * Format: <source-lower>-<title-kebab-5-words>-<8-hex-hash-of-url>
 */
export function translationSlug(source, title, url) {
  const prefix = String(source).toLowerCase();
  // Convert dots/dashes to spaces, strip remaining punctuation,
  // split on whitespace, take first 5 words, kebab-case
  const words = String(title)
    .replace(/[.\-_]/g, ' ')      // dots/dashes → space (preserves "4.7" → "4 7")
    .replace(/[^a-zA-Z0-9\s]/g, '') // strip remaining punctuation
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .map(w => w.toLowerCase());
  const titlePart = words.join('-');
  const hash = fnv1a32(url).toString(16).padStart(8, '0');
  return `${prefix}-${titlePart}-${hash}`;
}

/**
 * Render paragraphs from newline-separated excerpt_en string.
 */
function renderExcerptParagraphs(excerpt_en) {
  const paras = String(excerpt_en).split('\n').filter(p => p.trim());
  return paras.map(p => `<p>${escHtml(p)}</p>`).join('\n');
}

/**
 * Render a full /articles/<slug>/ translation page.
 *
 * @param {object} article
 *   { title, source, originalUrl, publishedAt, excerpt_en, slug }
 * @param {object} opts
 *   { siteOrigin }
 * @returns {string} full HTML page
 */
export function renderTranslationPage(article, opts = {}) {
  const {
    title = '',
    source = '',
    originalUrl = '',
    publishedAt = '',
    excerpt_en = null,
    slug = '',
  } = article;
  const { siteOrigin = 'https://ai-daily-digest.com' } = opts;

  const pageUrl = `${siteOrigin}/articles/${encodeURIComponent(slug)}/`;
  const hasTranslation = excerpt_en != null && String(excerpt_en).trim().length > 0;

  // NewsArticle JSON-LD
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: title,
    datePublished: publishedAt,
    author: { '@type': 'Organization', name: source },
    publisher: { '@type': 'Organization', name: 'AI Daily Digest' },
    mainEntityOfPage: pageUrl,
    isBasedOn: { '@type': 'Article', url: originalUrl, inLanguage: 'zh' },
    inLanguage: 'en',
  });

  const head = `<!DOCTYPE html>
<html lang="en" data-theme="claude">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)} — EN Translation — AI Daily Digest</title>
<link rel="canonical" href="${escAttr(originalUrl)}">
<link rel="alternate" hreflang="zh" href="${escAttr(originalUrl)}">
<link rel="alternate" hreflang="en" href="${escAttr(pageUrl)}">
<link rel="alternate" type="application/atom+xml" title="AI Daily Digest" href="${escAttr(siteOrigin)}/feed.xml">
<script type="application/ld+json">${jsonLd}</script>
<!-- Styles are inlined via PAGE_CSS in render-site.mjs; no external _shared.css needed -->
</head>`;

  const nav = `<nav class="toc"><ul>
  <li><a href="../../">← Today's digest</a></li>
  <li><a href="../../digests/">🗂 Archive</a></li>
</ul></nav>`;

  // Use h2 for the hero page-title chrome so the article <h1> remains the unique primary heading.
  const header = `<header class="hero">
  <div class="lang-switch" role="tablist" aria-label="Audio language">
    <button data-lang="en" role="tab" aria-selected="true" aria-pressed="true">EN</button>
    <button data-lang="zh" role="tab" aria-selected="false" aria-pressed="false">中文</button>
  </div>
  <h2 style="font-size:clamp(22px,4vw,32px);">EN Translation — ${escHtml(source)} Article</h2>
  <p class="date">A translation excerpt. Read the full piece in 中文 below.</p>
</header>`;

  if (!hasTranslation) {
    // Mockup 30 — placeholder state
    // Header for pending: title is "Translation pending", subtitle matches mockup 30
    const pendingHeader = `<header class="hero">
  <div class="lang-switch" role="tablist" aria-label="Audio language">
    <button data-lang="en" role="tab" aria-selected="true" aria-pressed="true">EN</button>
    <button data-lang="zh" role="tab" aria-selected="false" aria-pressed="false">中文</button>
  </div>
  <h2 style="font-size:clamp(22px,4vw,32px);">Translation pending</h2>
  <p class="date">We weren't able to translate this article today — read the original below.</p>
</header>`;
    return `${head}
<body>
${pendingHeader}
${nav}
<main class="container">
  <article class="translation-article">
    <h1>${escHtml(title)}</h1>
    <p class="translation-attribution">
      <span><strong>Source:</strong> ${escHtml(source)}</span>
      <span><strong>Published:</strong> ${escHtml(publishedAt)}</span>
      <span><strong>Language:</strong> 中文 (Chinese)</span>
    </p>
    <div class="translation-placeholder" data-testid="translation-placeholder" data-state="pending">
      <div class="placeholder-icon" aria-hidden="true">📝</div>
      <h2 style="font-family: var(--display-font); color: var(--text); margin: 0 0 10px; font-size: 22px;">Translation pending</h2>
      <p style="font-size: 15px; max-width: 460px; margin: 0 auto 18px;">
        Our daily routine ran out of capacity before it could produce an EN excerpt for this article. We've preserved the URL so the link still works — you can read the original in Chinese instead.
      </p>
      <a href="${escAttr(originalUrl)}" target="_blank" rel="noopener" class="translation-cta" data-testid="read-original-cta">
        Read original (中文) →
      </a>
    </div>
  </article>
</main>
<footer class="site-footer">
  <div>Translation pending · <a href="../../">AI Daily Digest</a> · <a href="${escAttr(originalUrl)}" target="_blank" rel="noopener">view original (中文)</a></div>
</footer>
</body>
</html>`;
  }

  // Mockup 29 — populated state
  return `${head}
<body>
${header}
${nav}
<main class="container">
  <article class="translation-article" data-testid="translation-article">
    <h1>${escHtml(title)}</h1>
    <p class="translation-attribution">
      <span><strong>Source:</strong> ${escHtml(source)}</span>
      <span><strong>Published:</strong> ${escHtml(publishedAt)}</span>
      <span><strong>Language:</strong> 中文 (Chinese)</span>
    </p>

    <a href="${escAttr(originalUrl)}" target="_blank" rel="noopener"
       class="translation-cta" data-testid="read-original-cta">
      Read original (中文) →
    </a>

    <div class="translation-body">
      ${renderExcerptParagraphs(excerpt_en)}
      <p style="color:var(--text-muted);font-style:italic;margin-top:24px;">… continued in the original article →</p>
    </div>

    <a href="${escAttr(originalUrl)}" target="_blank" rel="noopener"
       class="translation-cta" data-testid="read-original-cta-bottom" style="margin-top:20px;">
      Read original (中文) →
    </a>
  </article>
</main>
<footer class="site-footer">
  <div>Translation excerpt published ${escHtml(publishedAt)} · <a href="../../">AI Daily Digest</a> · <a href="${escAttr(originalUrl)}" target="_blank" rel="noopener">view original (中文)</a></div>
</footer>
</body>
</html>`;
}
