import { describe, it, expect } from 'vitest';

describe('worker test pool', () => {
  it('executes with Web Fetch API available', () => {
    // Node 18+ exposes Request/Response globally; worker tests run in node env
    expect(typeof Request).toBe('function');
    expect(typeof Response).toBe('function');
  });
});
