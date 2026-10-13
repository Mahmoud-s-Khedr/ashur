import { it, expect } from 'vitest';
import { formatTime } from './time';
it('renders minute boundaries consistently with rounded seconds', () => {
  expect(formatTime(120000)).toBe('2:00');
  expect(formatTime(119999)).toBe('2:00');
  expect(formatTime(119000)).toBe('1:59');
  expect(formatTime(59999)).toBe('1:00');
  expect(formatTime(0)).toBe('0:00');
  expect(formatTime(-1)).toBe('0:00');
});
