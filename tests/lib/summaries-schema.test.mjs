import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { normaliseSummaries } from '../../scripts/lib/summaries-schema.mjs';

const withEditorial = JSON.parse(
  readFileSync('./tests/fixtures/summaries-with-editorial.json', 'utf8')
);
const minimal = JSON.parse(
  readFileSync('./tests/fixtures/summaries-minimal.json', 'utf8')
);

describe('normaliseSummaries', () => {
  it('passes through complete editorial data unchanged', () => {
    const s = JSON.parse(JSON.stringify(withEditorial));
    const out = normaliseSummaries(s);
    expect(out.editorial.overall_en).toBe(s.editorial.overall_en);
    expect(out.editorial.overall_zh).toBe(s.editorial.overall_zh);
  });

  it('passes editorial cuts through unchanged when both langs present', () => {
    const s = JSON.parse(JSON.stringify(withEditorial));
    const out = normaliseSummaries(s);
    const firstCut = out.editorial.cuts[0];
    expect(firstCut.commentary_en).toBe(withEditorial.editorial.cuts[0].commentary_en);
    expect(firstCut.commentary_zh).toBe(withEditorial.editorial.cuts[0].commentary_zh);
    expect(firstCut.commentary_zh_fallback).toBeUndefined();
  });

  it('sets commentary_zh_fallback=true when commentary_zh is null/missing', () => {
    // Fixture has cuts[1] with commentary_zh: null
    const s = JSON.parse(JSON.stringify(withEditorial));
    const out = normaliseSummaries(s);
    const secondCut = out.editorial.cuts[1];
    expect(secondCut.commentary_zh_fallback).toBe(true);
    // commentary_zh itself stays undefined/null — renderer handles fallback display
    expect(secondCut.commentary_zh == null).toBe(true);
  });

  it('handles missing editorial block gracefully', () => {
    const out = normaliseSummaries({ sections: {} });
    expect(out.editorial).toBeUndefined();
  });

  it('handles missing translations block gracefully — defaults to []', () => {
    const out = normaliseSummaries({
      sections: {},
      editorial: { overall_en: 'X', overall_zh: 'Y', cuts: [] },
    });
    expect(out.translations).toEqual([]);
  });

  it('passes translations through from fixture', () => {
    const s = JSON.parse(JSON.stringify(withEditorial));
    const out = normaliseSummaries(s);
    expect(out.translations).toHaveLength(withEditorial.translations.length);
    expect(out.translations[0].slug).toBe(withEditorial.translations[0].slug);
  });

  it('handles minimal summaries (no editorial, no translations)', () => {
    const out = normaliseSummaries(JSON.parse(JSON.stringify(minimal)));
    expect(out.editorial).toBeUndefined();
    expect(out.translations).toEqual([]);
    // sections preserved unchanged
    expect(out.sections).toBeDefined();
  });

  it('does not mutate the input object', () => {
    const s = JSON.parse(JSON.stringify(withEditorial));
    const originalCutsLength = s.editorial.cuts.length;
    normaliseSummaries(s);
    // Input unchanged
    expect(s.editorial.cuts).toHaveLength(originalCutsLength);
  });
});
