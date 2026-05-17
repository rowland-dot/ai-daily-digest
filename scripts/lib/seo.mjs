/**
 * SEO helpers — sitemap, news-sitemap, robots.txt, JSON-LD, OG/Twitter meta,
 * canonical link, and Atom feed.
 *
 * All functions are pure (no I/O) — callers write the output to disk.
 */

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escXml(str) {
  return escHtml(str);
}

// ---------- Sitemap ----------

/**
 * renderSitemap(pages, siteOrigin) → sitemap.xml string
 * @param {string[]} pages - relative URL paths (e.g. '/', '/digests/2026-05-17.html')
 * @param {string} siteOrigin
 */
export function renderSitemap(pages, siteOrigin) {
  const urls = pages.map(p => {
    const loc = p === '/' ? `${siteOrigin}/` : `${siteOrigin}${p}`;
    return `  <url>\n    <loc>${escXml(loc)}</loc>\n  </url>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

// ---------- News Sitemap ----------

/**
 * renderNewsSitemap(articles, siteOrigin) → news-sitemap.xml string
 * @param {Array<{slug, title, publishedAt, source}>} articles
 * @param {string} siteOrigin
 */
export function renderNewsSitemap(articles, siteOrigin) {
  const urls = articles.map(a => `  <url>
    <loc>${escXml(`${siteOrigin}/articles/${encodeURIComponent(a.slug)}/`)}</loc>
    <news:news>
      <news:publication>
        <news:name>AI Daily Digest</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${escXml(a.publishedAt)}</news:publication_date>
      <news:title>${escXml(a.title)}</news:title>
    </news:news>
  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`;
}

// ---------- robots.txt ----------

/**
 * renderRobotsTxt(siteOrigin) → robots.txt string
 */
export function renderRobotsTxt(siteOrigin) {
  return `User-agent: *
Allow: /
Sitemap: ${siteOrigin}/sitemap.xml
Sitemap: ${siteOrigin}/news-sitemap.xml
`;
}

// ---------- JSON-LD ----------

/**
 * renderItemListJsonLd(items, siteOrigin, date) → <script type="application/ld+json"> tag
 * @param {Array<{title, url}>} items
 */
export function renderItemListJsonLd(items, siteOrigin, date) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `AI Daily Digest — ${date}`,
    url: `${siteOrigin}/digests/${date}.html`,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.title,
      url: item.url,
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
}

/**
 * renderNewsArticleJsonLd(article, siteOrigin) → <script type="application/ld+json"> tag
 * @param {object} article - { title, url, publishedAt, source, slug, articleBody? }
 */
export function renderNewsArticleJsonLd(article, siteOrigin) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title,
    datePublished: article.publishedAt,
    author: { '@type': 'Organization', name: article.source },
    publisher: { '@type': 'Organization', name: 'AI Daily Digest' },
    mainEntityOfPage: `${siteOrigin}/articles/${encodeURIComponent(article.slug)}/`,
    isBasedOn: { '@type': 'Article', url: article.url, inLanguage: 'zh' },
    ...(article.articleBody != null ? { articleBody: article.articleBody } : {}),
  };
  return `<script type="application/ld+json">${JSON.stringify(ld)}</script>`;
}

// ---------- OG / Twitter meta ----------

/**
 * renderOgMeta({ title, url, description, imageUrl }) → HTML meta tags string
 */
export function renderOgMeta({ title, url, description, imageUrl }) {
  const t = escHtml(title ?? '');
  const u = escHtml(url ?? '');
  const d = escHtml(description ?? '');
  const img = escHtml(imageUrl ?? '');
  return [
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${t}">`,
    `<meta property="og:description" content="${d}">`,
    `<meta property="og:url" content="${u}">`,
    `<meta property="og:image" content="${img}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${t}">`,
    `<meta name="twitter:description" content="${d}">`,
    `<meta name="twitter:image" content="${img}">`,
  ].join('\n');
}

// ---------- Canonical link ----------

/**
 * renderCanonicalLink(pageUrl) → <link rel="canonical" href="..."> tag
 * HTML-escapes special characters in the URL.
 */
export function renderCanonicalLink(pageUrl) {
  return `<link rel="canonical" href="${escHtml(pageUrl)}">`;
}

// ---------- Atom feed ----------

/**
 * renderAtomFeed(digests, siteOrigin) → feed.xml string
 * @param {Array<{date, publishedAt, itemCount, sourceCount}>} digests
 *   Sorted newest-first; capped at 30 entries.
 */
export function renderAtomFeed(digests, siteOrigin) {
  const entries = digests.slice(0, 30);
  const updated = entries[0]?.publishedAt ?? new Date().toISOString();

  const entryXml = entries.map(d => {
    const id = `urn:ai-daily-digest:${d.date}`;
    const link = `${siteOrigin}/digests/${d.date}.html`;
    const title = `AI Daily Digest — ${d.date}`;
    const summary = `Today's digest: ${d.itemCount ?? '?'} articles from ${d.sourceCount ?? '?'} sources.`;
    return `  <entry>
    <id>${escXml(id)}</id>
    <title>${escXml(title)}</title>
    <link href="${escXml(link)}"/>
    <updated>${escXml(d.publishedAt)}</updated>
    <summary>${escXml(summary)}</summary>
  </entry>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:ai-daily-digest:feed</id>
  <title>AI Daily Digest</title>
  <link href="${escXml(siteOrigin)}/"/>
  <link rel="self" href="${escXml(siteOrigin)}/feed.xml"/>
  <updated>${escXml(updated)}</updated>
  <author><name>AI Daily Digest</name></author>
${entryXml}
</feed>`;
}
