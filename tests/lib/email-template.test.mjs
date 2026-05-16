import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';

// Use dynamic import for ESM fixture
const { renderEmailEn, renderEmailZh } = await import('../../scripts/lib/email-template.mjs');
const summaries = JSON.parse(
  (await import('node:fs')).readFileSync('./tests/fixtures/summaries-with-editorial.json', 'utf8')
);

describe('renderEmailEn', () => {
  it('contains editorial.overall_en text', () => {
    const html = renderEmailEn(summaries, 'https://example.com');
    expect(html).toContain(summaries.editorial.overall_en.slice(0, 30));
  });

  it('does NOT contain editorial.overall_zh text', () => {
    const html = renderEmailEn(summaries, 'https://example.com');
    expect(html).not.toContain(summaries.editorial.overall_zh.slice(0, 10));
  });

  it('contains subject in EN form', () => {
    const html = renderEmailEn(summaries, 'https://example.com');
    expect(html).toContain('AI Daily Digest');
  });

  it('has Beehiiv unsubscribe placeholder', () => {
    const html = renderEmailEn(summaries, 'https://example.com');
    expect(html).toContain('{{ beehiiv_unsubscribe_url }}');
  });

  it('output includes data-testid="email-body"', () => {
    const html = renderEmailEn(summaries, 'https://example.com');
    expect(html).toContain('data-testid="email-body"');
  });

  it('includes each EN cut commentary', () => {
    const html = renderEmailEn(summaries, 'https://example.com');
    const firstCut = summaries.editorial.cuts[0];
    expect(html).toContain(firstCut.commentary_en.slice(0, 20));
  });

  it('throws when editorial block is missing', () => {
    expect(() => renderEmailEn({ sections: {} }, 'https://example.com')).toThrow();
  });
});

describe('renderEmailZh', () => {
  it('contains editorial.overall_zh text', () => {
    const html = renderEmailZh(summaries, 'https://example.com');
    expect(html).toContain(summaries.editorial.overall_zh.slice(0, 10));
  });

  it('subject is in Chinese', () => {
    const html = renderEmailZh(summaries, 'https://example.com');
    expect(html).toContain('AI 每日精选');
  });

  it('has Beehiiv unsubscribe placeholder', () => {
    const html = renderEmailZh(summaries, 'https://example.com');
    expect(html).toContain('{{ beehiiv_unsubscribe_url }}');
  });

  it('output includes data-testid="email-body"', () => {
    const html = renderEmailZh(summaries, 'https://example.com');
    expect(html).toContain('data-testid="email-body"');
  });
});
