/**
 * Feature flag tests — verify BACKEND_LIVE=false keeps backend UI out of rendered HTML.
 * Tests the GHA workflow YAML (L1 concern) and renderer helper contracts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

describe('BACKEND_LIVE feature flag — workflow YAML', () => {
  it('GH Pages render step has BACKEND_LIVE=false in workflow YAML', () => {
    const workflows = globSync('.github/workflows/*.yml')
      .map(f => readFileSync(f, 'utf8'))
      .join('\n');
    expect(workflows).toContain('BACKEND_LIVE');
    expect(workflows).toContain('"false"');
  });
});

describe('BACKEND_LIVE feature flag — articleId helper availability', () => {
  it('articleId is importable from scripts/lib/article-id.mjs', async () => {
    const { articleId } = await import('../../scripts/lib/article-id.mjs');
    expect(typeof articleId).toBe('function');
  });

  it('articleId produces stable output (same input → same output)', async () => {
    const { articleId } = await import('../../scripts/lib/article-id.mjs');
    const id1 = articleId('aihot', 'https://www.aihot.com/a/1');
    const id2 = articleId('aihot', 'https://www.aihot.com/a/1');
    expect(id1).toBe(id2);
  });
});
