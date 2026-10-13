import { describe, it, expect } from 'vitest';
import { speedBonus, blitzScore, gamblerScore, climbPosition, fastestCorrect } from './scoring';
describe('competition scoring', () => {
  it.each([
    [79999, 15],
    [80000, 15],
    [89999, 15],
    [90000, 10],
    [99999, 10],
    [100000, 5],
    [110000, 5],
    [110001, 0],
  ])('speed at %i ms', (ms, points) => expect(speedBonus(ms, true)).toBe(points));
  it('requires ten completed answers', () => expect(speedBonus(1000, false)).toBe(0));
  it('totals 81 base points and penalizes joker only', () => {
    expect(
      3 * blitzScore('easy', true) +
        3 * blitzScore('medium', true) +
        3 * blitzScore('hard', true) +
        blitzScore('joker', true),
    ).toBe(81);
    expect(blitzScore('joker', false)).toBe(-5);
    expect(blitzScore('hard', false)).toBe(0);
  });
  it('allows negative gambler balance', () =>
    expect(gamblerScore(15, false) + gamblerScore(5, true)).toBe(-10));
  it('floors the ladder and caps victory', () => {
    expect(climbPosition(1, false)).toBe(0);
    expect(climbPosition(9, true)).toBe(10);
  });
  it('arbitrates simultaneous finishes by receipt time, repeats exact ties', () => {
    expect(
      fastestCorrect([
        { teamId: 1, elapsedUs: 100, verdict: 'correct' },
        { teamId: 2, elapsedUs: 101, verdict: 'correct' },
      ]),
    ).toBe(1);
    expect(
      fastestCorrect([
        { teamId: 1, elapsedUs: 100, verdict: 'correct' },
        { teamId: 2, elapsedUs: 100, verdict: 'correct' },
      ]),
    ).toBeUndefined();
  });
});
