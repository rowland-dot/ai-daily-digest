/**
 * Beehiiv Post API helper — builds daily email payload and optionally posts.
 *
 * Usage (from GHA):
 *   node scripts/post-to-beehiiv.mjs en
 *   node scripts/post-to-beehiiv.mjs zh
 *
 * When BEEHIIV_API_KEY is absent, logs the payload and exits — no-op.
 */

import { readFileSync } from 'node:fs';
import { renderEmailEn, renderEmailZh } from './lib/email-template.mjs';

// Segment IDs — populated once real Beehiiv account is configured
const SEGMENT_IDS = {
  en: 'seg_en_placeholder',
  zh: 'seg_zh_placeholder',
};

/**
 * Build a Beehiiv Post API payload.
 * @param {string} lang - 'en' | 'zh'
 * @param {object} summaries - full claude-summaries.json data
 * @param {string} siteOrigin - e.g. 'https://ai-daily-digest.com'
 * @returns {object} Beehiiv Post API body
 */
export function buildBeehiivPayload(lang, summaries, siteOrigin) {
  if (!['en', 'zh'].includes(lang)) {
    throw new Error(`Unknown language: ${lang}. Must be 'en' or 'zh'.`);
  }

  const content_html = lang === 'zh'
    ? renderEmailZh(summaries, siteOrigin)
    : renderEmailEn(summaries, siteOrigin);

  const subject = lang === 'zh' ? 'AI 每日精选' : 'AI Daily Digest';
  const audience_segment_id = SEGMENT_IDS[lang];

  return {
    subject,
    content_html,
    audience_segment_id,
    status: 'draft', // GHA sets to 'confirmed' when actually sending
  };
}

/**
 * Post to Beehiiv Post API.
 * No-ops when BEEHIIV_API_KEY is absent.
 */
export async function postToBeehiiv(lang, summaries, apiKey, pubId, siteOrigin) {
  const payload = buildBeehiivPayload(lang, summaries, siteOrigin);

  if (!apiKey || !pubId) {
    console.log(`[beehiiv-stub] Would post ${lang} email (subject: "${payload.subject}") — skipped (no BEEHIIV_API_KEY)`);
    return;
  }

  const res = await fetch(`https://api.beehiiv.com/v2/publications/${pubId}/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Beehiiv Post API error ${res.status}: ${text}`);
  }

  const result = await res.json();
  console.log(`[beehiiv] Posted ${lang} email — post id: ${result?.data?.id}`);
}

// CLI entry point
if (process.argv[1] === new URL(import.meta.url).pathname || process.argv[1]?.endsWith('post-to-beehiiv.mjs')) {
  const lang = process.argv[2] ?? 'en';
  const summaries = JSON.parse(readFileSync('./data/claude-summaries.json', 'utf8'));
  const apiKey = process.env.BEEHIIV_API_KEY;
  const pubId = process.env.BEEHIIV_PUB_ID;
  const siteOrigin = process.env.SITE_ORIGIN ?? 'https://ai-daily-digest.com';

  postToBeehiiv(lang, summaries, apiKey, pubId, siteOrigin).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
