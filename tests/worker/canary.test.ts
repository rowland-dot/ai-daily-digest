import { describe, it, expect } from 'vitest';

describe('worker test pool', () => {
  it('executes in worker environment', () => {
    expect(typeof Request).toBe('function'); // Web Fetch API available
  });
});
