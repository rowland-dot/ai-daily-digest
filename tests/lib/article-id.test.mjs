import { describe, it, expect } from 'vitest';
import { articleId } from '../../scripts/lib/article-id.mjs';

describe('articleId', () => {
  it('produces "<source>-<8-char-hex>" format', () => {
    const id = articleId('aihot', 'https://www.aihot.com/articles/claude-4-7');
    expect(id).toMatch(/^aihot-[0-9a-f]{8}$/);
  });

  it('is stable across calls with same inputs', () => {
    const a = articleId('simon', 'https://simonwillison.net/2026/may/prompt-caching');
    const b = articleId('simon', 'https://simonwillison.net/2026/may/prompt-caching');
    expect(a).toBe(b);
  });

  it('differs for different URLs', () => {
    expect(articleId('aihot', 'https://a.com/1')).not.toBe(articleId('aihot', 'https://a.com/2'));
  });

  it('lowercases source prefix', () => {
    expect(articleId('AIHOT', 'https://x.com')).toMatch(/^aihot-/);
  });

  it('differs for different sources with same URL', () => {
    expect(articleId('aihot', 'https://x.com/a')).not.toBe(articleId('simon', 'https://x.com/a'));
  });

  it('hash portion is always exactly 8 hex chars', () => {
    const id = articleId('github', 'https://github.com/trending');
    const parts = id.split('-');
    const hashPart = parts[parts.length - 1];
    expect(hashPart).toMatch(/^[0-9a-f]{8}$/);
  });
});
