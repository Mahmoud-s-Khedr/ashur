import { describe, expect, it } from 'vitest';
import { classifyChange, formatClock, toSeconds } from './hooks';

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

describe('classifyChange', () => {
  const at = (score: number, progress: number, bonus = 0) => ({ score, progress, bonus });
  it('counts every Blitz submission, including zero-point wrong answers', () => {
    expect(classifyChange(1, at(10, 2), at(15, 3))).toBe('correct');
    expect(classifyChange(1, at(10, 2), at(10, 3))).toBe('wrong');
    expect(classifyChange(1, at(10, 2), at(5, 3))).toBe('wrong');
    expect(classifyChange(1, at(10, 2), at(10, 2))).toBeNull();
  });
  it('does not let the speed bonus turn a wrong final answer into a correct one', () => {
    expect(classifyChange(1, at(66, 9), at(81, 10, 15))).toBe('wrong');
    expect(classifyChange(1, at(66, 9), at(91, 10, 15))).toBe('correct');
  });
  it('uses the score delta for Gambler and Climb', () => {
    expect(classifyChange(2, at(0, 0), at(15, 0))).toBe('correct');
    expect(classifyChange(2, at(0, 0), at(-10, 0))).toBe('wrong');
    expect(classifyChange(3, at(0, 0), at(0, 0))).toBeNull();
  });
  it('ignores hidden scores', () => {
    expect(classifyChange(1, { score: null, progress: 0, bonus: 0 }, at(5, 1))).toBeNull();
  });
});
