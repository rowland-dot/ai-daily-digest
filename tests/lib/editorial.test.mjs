import { describe, it, expect } from 'vitest';
import { renderEditorialCutBox } from '../../scripts/lib/editorial.mjs';

const cut = {
  article_id: 'aihot-a3f12b8c',
  commentary_en: 'EN comment text.',
  commentary_zh: 'ZH comment text.',
};

describe('renderEditorialCutBox', () => {
  it('renders EN box with data-testid="editors-cut"', () => {
    const html = renderEditorialCutBox(cut);
    expect(html).toContain('data-testid="editors-cut"');
  });

  it('renders Editor\'s Cut label', () => {
    const html = renderEditorialCutBox(cut);
    expect(html).toContain("Editor's Cut");
  });

  it('contains EN commentary text', () => {
    const html = renderEditorialCutBox(cut);
    expect(html).toContain('EN comment text.');
  });

  it('includes data-commentary-source="commentary_en"', () => {
    const html = renderEditorialCutBox(cut);
    expect(html).toContain('data-commentary-source="commentary_en"');
  });

  it('carries commentary_zh in a data attribute for language switch', () => {
    const html = renderEditorialCutBox(cut);
    expect(html).toContain('commentary_zh');
  });

  it('includes ZH text in a hidden span or data attribute', () => {
    const html = renderEditorialCutBox(cut);
    expect(html).toContain('ZH comment text.');
  });

  it('renders fallback tag when commentary_zh is missing', () => {
    const html = renderEditorialCutBox({ ...cut, commentary_zh: undefined });
    expect(html).toContain('ec-fallback-tag');
    expect(html).toContain('English only today');
  });

  it('does NOT render fallback tag when commentary_zh is present', () => {
    const html = renderEditorialCutBox(cut);
    expect(html).not.toContain('ec-fallback-tag');
  });

  it('returns empty string for null cut (non-cut article)', () => {
    expect(renderEditorialCutBox(null)).toBe('');
  });

  it('returns empty string for undefined cut', () => {
    expect(renderEditorialCutBox(undefined)).toBe('');
  });

  it('has data-mockup-state="editors-cut-cut-with-en-commentary" when both langs present', () => {
    const html = renderEditorialCutBox(cut);
    expect(html).toContain('data-mockup-state');
  });
});
