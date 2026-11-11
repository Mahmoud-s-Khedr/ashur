import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { questionSchema, type Question } from '@ashour/shared';
import source from '../content/ashour-source.json';
import questions from '../content/questions.json';
import { openDb } from './db';
import { seed } from './seed';
import { seed as seedDemo } from './demo-seed';
import { Engine } from './engine';

const admin = { role: 'admin' as const, deviceId: 'content-test' };

describe('workbook question bank', () => {
  it('loads the real bank through the seed command', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ashour-seed-'));
    try {
      const path = join(dir, 'questions.sqlite');
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', fileURLToPath(new URL('./seed.ts', import.meta.url))],
        {
          env: { ...process.env, DB_PATH: path, QUESTION_BANK: '' },
          encoding: 'utf8',
        },
      );
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).not.toContain('placeholder');
      const db = openDb(path);
      try {
        const bank = new Engine(db).questions();
        expect(bank).toHaveLength(112);
        expect(bank[0].body).toBe(questions[0].body);
        expect(bank.some((q) => q.body.includes('تجريبي'))).toBe(false);
      } finally {
        db.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('uses all 112 source questions without duplicates and preserves their answers in every slot', () => {
    expect(source).toHaveLength(112);
    expect(questions).toHaveLength(112);
    expect(new Set(questions.map((q) => q.body)).size).toBe(112);
    expect(new Set(questions.map((q) => q.body))).toEqual(new Set(source.map((q) => q.body)));
    expect(new Set(questions.map((q) => q.category)).size).toBe(7);
    expect(questions.map((q) => q.id)).toEqual(Array.from({ length: 112 }, (_, i) => i + 1));
    for (const raw of questions) {
      const q = questionSchema.parse(raw);
      const original = source.find((s) => s.body === q.body)!;
      expect(q.category).toBe(original.category);
      if (q.difficulty === 'joker') {
        expect(original.difficulty).toBe('hard');
      } else {
        expect(q.difficulty).toBe(original.difficulty);
      }
      if (q.type === 'mcq') {
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options).size).toBe(4);
        expect(q.options[q.correct as number]).toBe(original.answer);
      } else expect(q.correct).toContain(original.answer);
    }
    expect(new Set(questions.filter((q) => q.type === 'mcq').map((q) => q.correct))).toEqual(
      new Set([0, 1, 2, 3]),
    );
  });

  it('provides complete rounds with joker always drawn from hard questions', () => {
    expect(questions.filter((q) => q.stage === 2)).toHaveLength(18);
    expect(questions.filter((q) => q.stage === 3)).toHaveLength(9);
    expect(
      questions
        .filter((q) => q.stage === 2 || q.stage === 3)
        .every((q) => q.type === 'text' && q.options.length === 0),
    ).toBe(true);
    expect(questions.filter((q) => q.pool === 'tiebreaker')).toHaveLength(2);
    const reserves = questions.filter((q) => q.pool === 'reserve');
    expect(reserves).toHaveLength(3);
    expect(reserves.every((q) => q.type === 'mcq' && q.difficulty === 'hard')).toBe(true);
    for (let seq = 1; seq <= 8; seq++) {
      const set = questions.filter((q) => q.stage === 1 && q.setNo === seq);
      expect(set).toHaveLength(10);
      expect(new Set(set.map((q) => q.body)).size).toBe(10);
      expect(
        ['easy', 'medium', 'hard', 'joker'].map(
          (d) => set.filter((q) => q.difficulty === d).length,
        ),
      ).toEqual([3, 3, 3, 1]);
    }
  });

  it('seeds written answers for both later stages in the demo bank', () => {
    const db = openDb(':memory:');
    try {
      seedDemo(db);
      const bank = new Engine(db).questions();
      for (const [stage, count] of [
        [2, 24],
        [3, 15],
      ]) {
        const rows = bank.filter((q) => q.stage === stage);
        expect(rows).toHaveLength(count);
        expect(
          rows.every(
            (q) =>
              q.type === 'text' &&
              q.options.length === 0 &&
              Array.isArray(q.correct) &&
              q.correct.length > 0,
          ),
        ).toBe(true);
      }
    } finally {
      db.close();
    }
  });

  it('seeds real questions, preserves edits on reseed and runs a real Blitz round', () => {
    const db = openDb(':memory:');
    try {
      seed(db);
      const engine = new Engine(db);
      expect(engine.questions()).toHaveLength(112);
      expect(engine.questions().some((q) => q.body.includes('سؤال تجريبي'))).toBe(false);
      engine.dispatch(
        'settings.update',
        { settings: { automation: 'manual', countdownMs: 1 } },
        admin,
      );
      engine.dispatch('round.openHandshake', {}, admin);
      engine.dispatch('round.forceStart', {}, admin);
      engine.state.endsAt = Date.now() - 1;
      engine.dispatch('system.tick', {}, { role: 'system', deviceId: 'timer' });
      for (const id of engine.state.set) {
        const q = engine.question(id)!;
        for (const teamId of [1, 2, 3, 4])
          engine.dispatch(
            'answer.submit',
            {
              roundQuestionId: q.id,
              answer:
                teamId === 1 || (teamId === 2 && id === engine.state.set[0])
                  ? q.correct
                  : ((q.correct as number) + 1) % 4,
            },
            { role: 'team', deviceId: `t-${teamId}`, teamId },
          );
      }
      expect(engine.state.phase).toBe('RESULTS');
      expect(engine.state.winner).toBe(1);
      expect(engine.state.winners).toEqual([1, 2]);
      const first = JSON.parse(
        (db.prepare('SELECT json FROM questions WHERE id=1').get() as { json: string }).json,
      ) as Question;
      db.prepare('UPDATE questions SET json=? WHERE id=1').run(
        JSON.stringify({ ...first, body: 'محتوى معدل' }),
      );
      seed(db);
      expect(new Engine(db).question(1)?.body).toBe('محتوى معدل');
      expect(db.prepare('SELECT COUNT(*) n FROM questions').get()).toEqual({ n: 112 });
    } finally {
      db.close();
    }
  });
});
