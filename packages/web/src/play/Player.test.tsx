import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULTS } from '@ashour/shared';
import type { Snapshot } from '../lib/types';

const snapshot = (stage: 1 | 2, difficulty: 'easy' | 'joker') =>
  ({
    stage,
    phase: 'RUNNING',
    settings: DEFAULTS,
    question: {
      id: 1,
      category: 'Category',
      body: 'Question',
      type: 'mcq',
      options: [],
      difficulty,
    },
    ownCard: 15,
    ownProgress: 0,
    index: 0,
    paused: false,
    submitted: false,
  }) as unknown as Snapshot;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe.each(['ar', 'en'])('player question in %s', (language) => {
  it('keeps Gambler category, wager and number while showing Blitz difficulty and points', async () => {
    vi.stubGlobal('location', { search: `?lang=${language}` });
    vi.stubGlobal('localStorage', { setItem() {} });
    const { Question } = await import('./Player');
    const render = (stage: 1 | 2, difficulty: 'easy' | 'joker') =>
      renderToStaticMarkup(
        <Question
          s={snapshot(stage, difficulty)}
          send={() => {}}
          remaining={1000}
          connected
          error=""
        />,
      );
    const gambler = render(2, 'easy');
    expect(gambler).toContain('Category');
    expect(gambler).toContain('gold');
    expect(gambler).toContain('15');
    expect(gambler).toContain('q-no');
    expect(gambler).not.toContain('chip diff easy');
    expect(render(2, 'joker')).not.toContain('chip diff joker');
    expect(render(1, 'easy')).toContain(language === 'ar' ? 'سهل · 5' : 'Easy · 5');
    expect(render(1, 'joker')).toContain('+15 / -5');
  });
});
