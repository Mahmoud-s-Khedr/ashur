import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULTS } from '@ashour/shared';
import type { Snapshot } from '../lib/types';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe.each(['ar', 'en'])('Gambler projector in %s', (language) => {
  it('shows the question, timer and team information while answering without the model answer', async () => {
    vi.stubGlobal('location', { search: `?lang=${language}` });
    vi.stubGlobal('localStorage', { setItem() {} });
    const { TeamTime, QuestionScene } = await import('./scenesC');
    const s = {
      stage: 2,
      phase: 'RUNNING',
      seq: 1,
      index: 0,
      settings: DEFAULTS,
      category: 'Category',
      paused: false,
      question: { body: 'Question text', category: 'Category', type: 'text', options: [] },
      lineup: [{ id: 1, name: 'Team One', color: '#fff', card: 5, score: 10, answered: false }],
    } as unknown as Snapshot;
    const running = renderToStaticMarkup(<TeamTime s={s} remaining={10000} unit={16} fx={{}} />);
    expect(running).toContain('Question text');
    expect(running).toContain('Team One');
    expect(running).toContain('10');
    expect(running).not.toContain('Secret answer');
    const reveal = {
      ...s,
      phase: 'REVEAL',
      question: { ...s.question!, correct: ['Secret answer'] },
    } as Snapshot;
    expect(renderToStaticMarkup(<QuestionScene s={reveal} fx={{}} />)).toContain('Secret answer');
  });
});
