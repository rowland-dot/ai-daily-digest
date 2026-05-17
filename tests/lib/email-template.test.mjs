/**
 * Email template tests — assert mockup 27/28 structure and palette.
 *
 * Requirements (C2):
 *  - Palette: cream bg #faf9f5, wrapper bg #efe9de, accent #cc785c, link #a9583e
 *    (NOT the old slate/blue #1e293b / #2563eb palette)
 *  - Structure: hero gradient, overall narrative, per-cut clickable rows
 *    (each row: title <a> + commentary), footer with account + lang toggle + unsubscribe
 *  - data-testid="email-body" on the inner content table
 *  - Beehiiv unsubscribe placeholder preserved
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const { renderEmailEn, renderEmailZh } = await import('../../scripts/lib/email-template.mjs');
const summaries = JSON.parse(
  readFileSync('./tests/fixtures/summaries-with-editorial.json', 'utf8')
);

// ---- Shared assertions ----

describe('renderEmailEn — mockup 27 structure and palette', () => {
  const html = renderEmailEn(summaries, 'https://example.com');

  it('has data-testid="email-body" on the inner table', () => {
    expect(html).toContain('data-testid="email-body"');
  });

  it('uses cream background #faf9f5 (Claude warm palette — NOT slate #1e293b)', () => {
    expect(html).toContain('#faf9f5');
    expect(html).not.toContain('#1e293b');
  });

  it('uses warm wrapper background #efe9de', () => {
    expect(html).toContain('#efe9de');
  });

  it('uses accent colour #cc785c (NOT blue #2563eb)', () => {
    expect(html).toContain('#cc785c');
    expect(html).not.toContain('#2563eb');
  });

  it('uses link colour #a9583e', () => {
    expect(html).toContain('#a9583e');
  });

  it('hero has warm gradient background', () => {
    expect(html).toContain('linear-gradient(135deg,#efe9de');
  });

  it('contains overall_en narrative text', () => {
    expect(html).toContain(summaries.editorial.overall_en.slice(0, 30));
  });

  it('does NOT contain overall_zh text', () => {
    expect(html).not.toContain(summaries.editorial.overall_zh.slice(0, 10));
  });

  it('subject is AI Daily Digest', () => {
    expect(html).toContain('AI Daily Digest');
  });

  it('cut rows are clickable — each cut has a link with ?ref=email-en', () => {
    // Per mockup 27: each cut row wraps the title in an <a> pointing to the site
    expect(html).toContain('ref=email-en');
    expect(html).toContain('<a href=');
  });

  it('per-cut row has border-left accent (mockup 27 cut row style)', () => {
    expect(html).toContain('border-left:3px solid #cc785c');
  });

  it('includes EN commentary for first cut', () => {
    const firstCut = summaries.editorial.cuts[0];
    expect(html).toContain(firstCut.commentary_en.slice(0, 20));
  });

  it('footer has Manage your account link', () => {
    expect(html).toContain('Manage your account');
    expect(html).toContain('/account');
  });

  it('footer has language toggle link (Switch to 中文)', () => {
    expect(html).toContain('Switch to 中文');
    expect(html).toContain('lang=zh');
  });

  it('has Beehiiv unsubscribe placeholder', () => {
    expect(html).toContain('{{ beehiiv_unsubscribe_url }}');
  });

  it('throws when editorial block is missing', () => {
    expect(() => renderEmailEn({ sections: {} }, 'https://example.com')).toThrow();
  });
});

describe('renderEmailZh — mockup 28 structure and palette', () => {
  const html = renderEmailZh(summaries, 'https://example.com');

  it('has data-testid="email-body"', () => {
    expect(html).toContain('data-testid="email-body"');
  });

  it('uses cream background #faf9f5 (NOT slate)', () => {
    expect(html).toContain('#faf9f5');
    expect(html).not.toContain('#1e293b');
  });

  it('uses accent colour #cc785c', () => {
    expect(html).toContain('#cc785c');
  });

  it('subject is in Chinese', () => {
    expect(html).toContain('AI 每日精选');
  });

  it('contains overall_zh text', () => {
    expect(html).toContain(summaries.editorial.overall_zh.slice(0, 10));
  });

  it('cut rows have ?ref=email-zh in links', () => {
    expect(html).toContain('ref=email-zh');
  });

  it('per-cut row has border-left accent', () => {
    expect(html).toContain('border-left:3px solid #cc785c');
  });

  it('includes ZH commentary for first cut (when available)', () => {
    const firstCut = summaries.editorial.cuts[0];
    // commentary_zh is present for the first cut in the fixture
    expect(html).toContain(firstCut.commentary_zh.slice(0, 10));
  });

  it('second cut falls back to EN commentary when commentary_zh is null', () => {
    const secondCut = summaries.editorial.cuts[1];
    // commentary_zh is null for the second cut — should fall back to EN
    expect(html).toContain(secondCut.commentary_en.slice(0, 20));
  });

  it('footer has language toggle link (切换至 English)', () => {
    expect(html).toContain('切换至 English');
    expect(html).toContain('lang=en');
  });

  it('has Beehiiv unsubscribe placeholder', () => {
    expect(html).toContain('{{ beehiiv_unsubscribe_url }}');
  });

  it('hero uses warm gradient background', () => {
    expect(html).toContain('linear-gradient(135deg,#efe9de');
  });
});

describe('renderEmailEn — cut rows need article title', () => {
  it('renders cut rows when cuts include article_id but no title — falls back gracefully', () => {
    // The fixture cuts have article_id but no title_en/title — the helper
    // falls back to empty string (no crash). Verify no throw.
    expect(() => renderEmailEn(summaries, 'https://example.com')).not.toThrow();
  });
});
