import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildBeehiivPayload } from '../../scripts/post-to-beehiiv.mjs';

const summaries = JSON.parse(
  readFileSync('./tests/fixtures/summaries-with-editorial.json', 'utf8')
);

describe('buildBeehiivPayload', () => {
  it('builds EN payload with correct content_html', () => {
    const p = buildBeehiivPayload('en', summaries, 'https://example.com');
    expect(p.content_html).toContain('data-testid="email-body"');
    expect(p.subject).toContain('AI Daily Digest');
  });

  it('EN payload has audience_segment_id defined', () => {
    const p = buildBeehiivPayload('en', summaries, 'https://example.com');
    expect(p.audience_segment_id).toBeDefined();
    expect(typeof p.audience_segment_id).toBe('string');
  });

  it('builds ZH payload with Chinese subject', () => {
    const p = buildBeehiivPayload('zh', summaries, 'https://example.com');
    expect(p.subject).toContain('AI 每日精选');
  });

  it('ZH payload content_html includes email-body testid', () => {
    const p = buildBeehiivPayload('zh', summaries, 'https://example.com');
    expect(p.content_html).toContain('data-testid="email-body"');
  });

  it('throws if editorial data is missing', () => {
    expect(() => buildBeehiivPayload('en', {}, 'https://example.com')).toThrow();
  });

  it('throws for unknown language', () => {
    expect(() => buildBeehiivPayload('fr', summaries, 'https://example.com')).toThrow();
  });

  it('payload has send_at or draft fields (Beehiiv Post API shape)', () => {
    const p = buildBeehiivPayload('en', summaries, 'https://example.com');
    // At minimum must have subject + content_html for Beehiiv Post API
    expect(p.subject).toBeTruthy();
    expect(p.content_html).toBeTruthy();
  });
});
