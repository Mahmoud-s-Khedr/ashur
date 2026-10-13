import { describe, expect, it } from 'vitest';
import { formatClock, toSeconds } from './hooks';

describe('clock formatting', () => {
  it('formats minutes, seconds and optional tenths', () => {
    expect(formatClock(120_000)).toBe('2:00');
    expect(formatClock(61_900)).toBe('1:01');
    expect(formatClock(61_900, true)).toBe('1:01.9');
    expect(formatClock(-5)).toBe('0:00');
  });
  it('shows server timestamps with millisecond precision', () => {
    expect(toSeconds(87_412)).toBe('87.412');
    expect(toSeconds(87_412, 1)).toBe('87.4');
  });
});
