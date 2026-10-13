import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { openDb } from './db';
import { seed } from './seed';
import { Engine } from './engine';
let db: ReturnType<typeof openDb>, engine: Engine;
let clock = 0;
const admin = { role: 'admin' as const, deviceId: 'admin' };
const team = (teamId: number) => ({ role: 'team' as const, deviceId: `team-${teamId}`, teamId });
function start(key = '1-1') {
  engine.dispatch('settings.update', { settings: { automation: 'manual', countdownMs: 1 } }, admin);
  if (key !== '1-1') engine.dispatch('round.select', { key }, admin);
  if (engine.round.stage !== 1)
    engine.dispatch(
      'round.assignTeams',
      { teamIds: engine.round.stage === 3 ? [1, 2, 3] : [1, 2, 3, 4] },
      admin,
    );
  engine.dispatch('round.openHandshake', {}, admin);
  engine.dispatch('round.forceStart', {}, admin);
  engine.state.endsAt = Date.now() - 1;
  engine.dispatch('system.tick', {}, { role: 'system', deviceId: 'timer' });
}
beforeEach(() => {
  clock = 0;
  db = openDb(':memory:');
  seed(db);
  engine = new Engine(db, () => clock);
});
afterEach(() => {
  db.close();
  vi.useRealTimers();
});
describe('M0 foundation', () => {
  it('seeds exactly 48 teams and 180 questions', () => {
    expect(engine.teams()).toHaveLength(48);
    expect(engine.questions()).toHaveLength(180);
  });
  it('hides codes and answers from untrusted roles', () => {
    const s = engine.snapshot({ role: 'display', deviceId: 'display' });
    expect(JSON.stringify(s)).not.toContain('"code"');
    expect(s).not.toHaveProperty('questions');
    expect(s).not.toHaveProperty('answers');
  });
  it('persists snapshots with WAL-compatible schema', () => {
    engine.dispatch('round.showRules', {}, admin);
    expect(new Engine(db).state.phase).toBe('RULES');
  });
});
describe('M1 Blitz', () => {
  it('rejects illegal and unauthorized transitions atomically', () => {
    expect(() => engine.dispatch('round.start', {}, admin)).toThrow();
    expect(() => engine.dispatch('round.showRules', {}, team(1))).toThrow();
    expect(engine.state.version).toBe(0);
    expect(db.prepare('SELECT COUNT(*) n FROM event_log').get()).toEqual({ n: 0 });
  });
  it('scores a complete round, bonus, winner and bracket advancement', () => {
    start();
    clock = 5000;
    for (let i = 0; i < 10; i++)
      for (let id = 1; id <= 4; id++)
        engine.dispatch(
          'answer.submit',
          { roundQuestionId: engine.state.set[i], answer: id === 1 ? 0 : 1 },
          team(id),
          `${id}-${i}`,
        );
    expect(engine.state.phase).toBe('RESULTS');
    expect(engine.scores()[1]).toBe(96);
    expect(engine.scores()[2]).toBe(10);
    expect(engine.state.winner).toBe(1);
    expect(engine.state.rounds.find((r) => r.key === '2-1')!.teamIds).toEqual([1]);
  });
  it('accepts first submission only and deduplicates cmdId across reconnect', () => {
    start();
    const p = { roundQuestionId: engine.state.set[0], answer: 0 };
    engine.dispatch('answer.submit', p, team(1), 'first');
    expect(engine.dispatch('answer.submit', p, team(1), 'first').duplicate).toBe(true);
    expect(() => engine.dispatch('answer.submit', p, team(1), 'other')).toThrow('Stale');
    expect(engine.scores()[1]).toBe(5);
  });
  it('freezes time on pause and restores paused after restart', () => {
    start();
    clock = 10000;
    engine.dispatch('round.pause', {}, admin);
    const elapsed = engine.state.elapsedMs;
    clock = 50000;
    expect(engine.elapsed()).toBe(elapsed);
    engine.dispatch('round.resume', {}, admin);
    clock = 51000;
    expect(engine.elapsed()).toBe(elapsed + 1000);
    engine.dispatch('system.tick', {}, { role: 'system', deviceId: 'timer' });
    const recovered = new Engine(db);
    expect(recovered.state.paused).toBe(true);
    expect(recovered.state.remainingMs).toBeGreaterThan(0);
  });
  it('rejects late answers and never sends team verdicts', () => {
    start();
    const q = engine.state.set[0];
    expect(engine.snapshot(team(1)).question).not.toHaveProperty('correct');
    engine.state.endsAt = Date.now() - 1;
    expect(() =>
      engine.dispatch('answer.submit', { roundQuestionId: q, answer: 0 }, team(1)),
    ).toThrow('deadline');
  });
  it('resolves ties without changing competition scores', () => {
    start();
    for (let i = 0; i < 10; i++)
      for (let id = 1; id <= 4; id++)
        engine.dispatch(
          'answer.submit',
          { roundQuestionId: engine.state.set[i], answer: 0 },
          team(id),
        );
    expect(engine.state.phase).toBe('REVIEW');
    engine.dispatch('tiebreak.open', {}, admin);
    for (let id = 1; id <= 4; id++) engine.dispatch('team.ready', {}, team(id));
    engine.dispatch('tiebreak.launch', {}, admin);
    const q = engine.question(engine.state.tieQuestion!)!;
    for (let id = 1; id <= 4; id++) {
      clock = id * 100;
      engine.dispatch(
        'answer.submit',
        { roundQuestionId: q.id, answer: (q.correct as string[])[0] },
        team(id),
      );
    }
    for (const a of engine.state.answers.filter((a) => a.questionId === q.id))
      engine.dispatch('grade.set', { answerId: a.id, verdict: 'correct' }, admin);
    const scores = engine.scores();
    engine.dispatch('question.reveal', {}, admin);
    expect(engine.state.winner).toBe(1);
    expect(engine.scores()).toEqual(scores);
  });
});
describe('M2 admin tools', () => {
  it('imports atomically and protects consumed questions', () => {
    const q = engine.questions()[0];
    const count = engine.questions().length;
    const { id, ...copy } = q;
    copy.setNo = null;
    expect(() =>
      engine.dispatch('questions.save', { questions: [copy, { ...copy, body: '' }] }, admin),
    ).toThrow();
    expect(engine.questions()).toHaveLength(count);
    engine.dispatch('questions.save', { questions: [copy] }, admin);
    expect(engine.questions()).toHaveLength(count + 1);
    start();
    expect(() => engine.dispatch('questions.delete', { id: q.id }, admin)).toThrow();
  });
  it('keeps an append-only ledger for adjustments and undo', () => {
    engine.dispatch('score.adjust', { teamId: 1, delta: -5, reason: 'Objection' }, admin);
    expect(engine.scores()[1]).toBe(-5);
    engine.dispatch('undo.last', {}, admin);
    expect(engine.scores()[1]).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM score_events').get()).toEqual({ n: 2 });
    expect(() => engine.dispatch('undo.last', {}, admin)).toThrow();
  });
  it('validates set distribution and restores leaks exactly', () => {
    start();
    const qId = engine.state.set[0];
    for (let id = 1; id <= 4; id++)
      engine.dispatch('answer.submit', { roundQuestionId: qId, answer: 0 }, team(id));
    expect(engine.scores()[1]).toBe(5);
    engine.dispatch('question.cancelLeak', { questionId: qId }, admin);
    expect(engine.scores()[1]).toBe(0);
    expect(engine.state.progress[1]).toBe(0);
    expect(engine.state.set[0]).not.toBe(qId);
    expect(engine.state.answers[0].verdict).toBe('void');
    expect(engine.state.phase).toBe('RUNNING');
    expect(engine.question(qId)?.used).toBe(true);
  });
  it('preserves a paused Blitz clock when replacing a leaked question', () => {
    vi.useFakeTimers();
    start();
    const qId = engine.state.set[0];
    clock = 10000;
    vi.advanceTimersByTime(10000);
    engine.dispatch('round.pause', {}, admin);
    const remaining = engine.state.remainingMs;
    clock = 70000;
    vi.advanceTimersByTime(60000);
    engine.dispatch('question.cancelLeak', { questionId: qId }, admin);
    expect(engine.state.paused).toBe(true);
    expect(engine.elapsed()).toBe(10000);
    expect(engine.state.remainingMs).toBe(remaining);
    expect(() =>
      engine.dispatch(
        'answer.submit',
        { roundQuestionId: engine.state.set[0], answer: 0 },
        team(1),
      ),
    ).toThrow('paused');
    engine.dispatch('round.resume', {}, admin);
    expect(engine.state.endsAt).toBe(Date.now() + remaining);
    clock = 71000;
    vi.advanceTimersByTime(1000);
    expect(engine.elapsed()).toBe(11000);
    for (const q of engine.state.set)
      engine.dispatch('answer.submit', { roundQuestionId: q, answer: 0 }, team(1));
    expect(engine.state.finishMs[1]).toBe(11000);
    expect(engine.snapshot(team(1)).ownBonus).toBe(15);
    vi.advanceTimersByTime(remaining - 1000);
    engine.dispatch('system.tick', {}, { role: 'system', deviceId: 'timer' });
    expect(engine.state.phase).toBe('RESULTS');
  });
  it.each(['REVIEW', 'TIE_READY', 'TIE_RUNNING', 'TIE_REVIEW'] as const)(
    'recalculates qualification after a score correction in %s',
    (phase) => {
      start();
      engine.state.endsAt = Date.now() - 1;
      engine.dispatch('system.tick', {}, { role: 'system', deviceId: 'timer' });
      if (phase !== 'REVIEW') engine.dispatch('tiebreak.open', {}, admin);
      if (phase === 'TIE_RUNNING' || phase === 'TIE_REVIEW') {
        for (let id = 1; id <= 4; id++) engine.dispatch('team.ready', {}, team(id));
        engine.dispatch('tiebreak.launch', {}, admin);
      }
      if (phase === 'TIE_REVIEW') {
        engine.state.endsAt = Date.now() - 1;
        engine.dispatch('system.tick', {}, { role: 'system', deviceId: 'timer' });
      }
      expect(engine.state.phase).toBe(phase);
      engine.dispatch('score.adjust', { teamId: 1, delta: 5, reason: 'Correction' }, admin);
      expect(engine.state.phase).toBe('RESULTS');
      expect(engine.state.winner).toBe(1);
      expect(engine.state.tieIds).toEqual([]);
      expect(engine.state.tieQuestion).toBeUndefined();
      expect(engine.state.autoAt).toBe(0);
      expect(engine.round.completed).toBe(true);
      expect(engine.state.rounds.find((r) => r.key === '2-1')!.teamIds).toEqual([1]);
    },
  );
  it('restarts tie readiness with the corrected leaders', () => {
    start();
    engine.state.endsAt = Date.now() - 1;
    engine.dispatch('system.tick', {}, { role: 'system', deviceId: 'timer' });
    engine.dispatch('tiebreak.open', {}, admin);
    for (let id = 1; id <= 4; id++) engine.dispatch('team.ready', {}, team(id));
    engine.dispatch('tiebreak.launch', {}, admin);
    engine.dispatch('score.adjust', { teamId: 4, delta: -5, reason: 'Penalty' }, admin);
    expect(engine.state.phase).toBe('REVIEW');
    expect(engine.state.tieIds).toEqual([1, 2, 3]);
    expect(engine.state.tieQuestion).toBeUndefined();
    expect(engine.state.ready).toEqual([]);
    expect(engine.state.endsAt).toBe(0);
    engine.dispatch('tiebreak.open', {}, admin);
    expect(() => engine.dispatch('team.ready', {}, team(4))).toThrow('Not in lineup');
    engine.dispatch('undo.last', {}, admin);
    expect(engine.state.phase).toBe('REVIEW');
    expect(engine.state.tieIds).toEqual([1, 2, 3, 4]);
  });
  it('recalculates qualification after undoing a manual adjustment', () => {
    engine.dispatch('score.adjust', { teamId: 1, delta: 5, reason: 'Correction' }, admin);
    engine.dispatch('score.adjust', { teamId: 2, delta: 5, reason: 'Correction' }, admin);
    start();
    engine.state.endsAt = Date.now() - 1;
    engine.dispatch('system.tick', {}, { role: 'system', deviceId: 'timer' });
    expect(engine.state.tieIds).toEqual([1, 2]);
    engine.dispatch('undo.last', {}, admin);
    expect(engine.state.phase).toBe('RESULTS');
    expect(engine.state.winner).toBe(1);
    expect(engine.scores()[2]).toBe(0);
  });
  it('binds one device per team, releases only on admin kick', () => {
    for (const id of ['device-a', 'device-b'])
      db.prepare('INSERT INTO devices(id,role,token_hash) VALUES(?,?,?)').run(id, 'team', id);
    engine.dispatch('team.checkin', { code: '111' }, { role: 'team', deviceId: 'device-a' });
    expect(() =>
      engine.dispatch('team.checkin', { code: '111' }, { role: 'team', deviceId: 'device-b' }),
    ).toThrow('already');
    engine.dispatch('checkin.kick', { teamId: 1 }, admin);
    expect(
      engine.dispatch('team.checkin', { code: '111' }, { role: 'team', deviceId: 'device-b' })
        .teamId,
    ).toBe(1);
  });
});
describe('M3 Gambler', () => {
  it('keeps a paused replacement question paused with a fresh timer', () => {
    start('2-1');
    engine.dispatch('wheel.spin', {}, admin);
    for (let id = 1; id <= 4; id++) engine.dispatch('card.select', { value: 5 }, team(id));
    engine.dispatch('question.start', {}, admin);
    const qId = engine.state.set[0];
    clock = 10000;
    engine.dispatch('round.pause', {}, admin);
    clock = 70000;
    engine.dispatch('question.cancelLeak', {}, admin);
    expect(engine.state.set[0]).not.toBe(qId);
    expect(engine.state.paused).toBe(true);
    expect(engine.elapsed()).toBe(0);
    expect(engine.state.remainingMs).toBe(engine.state.settings.questionMs);
    expect(engine.state.cards).toEqual({ 1: 5, 2: 5, 3: 5, 4: 5 });
    engine.dispatch('round.resume', {}, admin);
    expect(engine.state.endsAt).toBe(Date.now() + engine.state.settings.questionMs);
    clock = 71000;
    expect(engine.elapsed()).toBe(1000);
  });
  it('runs all eight questions with cards chosen before seeing questions', () => {
    start('2-1');
    expect(engine.state.phase).toBe('WHEEL');
    for (let i = 0; i < 8; i++) {
      engine.dispatch('wheel.spin', {}, admin);
      expect(engine.snapshot(team(1)).question).toBeNull();
      for (let id = 1; id <= 4; id++) engine.dispatch('card.select', { value: 15 }, team(id));
      expect(() => engine.dispatch('card.select', { value: 5 }, team(1))).toThrow('already');
      engine.dispatch('question.start', {}, admin);
      const q = engine.question(engine.state.set[i])!;
      for (let id = 1; id <= 4; id++)
        engine.dispatch(
          'answer.submit',
          {
            roundQuestionId: q.id,
            answer:
              q.type === 'mcq'
                ? id === 1
                  ? q.correct
                  : 1
                : id === 1
                  ? (q.correct as string[])[0]
                  : 'wrong',
          },
          team(id),
        );
      if (q.type !== 'mcq')
        for (const a of engine.state.answers.filter((a) => a.questionId === q.id))
          engine.dispatch(
            'grade.set',
            { answerId: a.id, verdict: a.teamId === 1 ? 'correct' : 'wrong' },
            admin,
          );
      expect(engine.state.phase).toBe('AUDIENCE');
      expect(engine.snapshot({ role: 'display', deviceId: 'display' }).question).not.toHaveProperty(
        'correct',
      );
      engine.dispatch('question.reveal', {}, admin);
      if (i < 7) engine.dispatch('question.next', {}, admin);
    }
    expect(engine.state.phase).toBe('RESULTS');
    expect(engine.scores()[1]).toBe(120);
    expect(engine.scores()[2]).toBe(-120);
    expect(engine.state.rounds.find((r) => r.key === '3-1')?.teamIds).toContain(1);
  });
  it('penalizes unanswered cards and reverses revealed leak scores', () => {
    start('2-1');
    engine.dispatch('wheel.spin', {}, admin);
    for (let id = 1; id <= 4; id++) engine.dispatch('card.select', { value: 10 }, team(id));
    engine.dispatch('question.start', {}, admin);
    engine.state.endsAt = Date.now() - 1;
    engine.dispatch('system.tick', {}, { role: 'system', deviceId: 'timer' });
    engine.dispatch('question.reveal', {}, admin);
    expect(engine.scores()[1]).toBe(-10);
    engine.dispatch('question.cancelLeak', {}, admin);
    expect(engine.scores()[1]).toBe(0);
    expect(engine.state.phase).toBe('RUNNING');
  });
  it('requires manual grading before revealing text answers', () => {
    start('2-1');
    engine.dispatch('wheel.spin', {}, admin);
    for (let id = 1; id <= 4; id++) engine.dispatch('card.select', { value: 5 }, team(id));
    const q = engine.questions().find((q) => q.stage === 2 && q.type === 'text')!;
    engine.state.category = q.category;
    engine.dispatch('question.start', {}, admin);
    engine.state.set[0] = q.id;
    for (let id = 1; id <= 4; id++)
      engine.dispatch('answer.submit', { roundQuestionId: q.id, answer: 'value' }, team(id));
    expect(() => engine.dispatch('question.reveal', {}, admin)).toThrow('Grade all');
  });
});
describe('M4 Final Climb', () => {
  it('crowns the fastest team reaching the top on the same question', () => {
    start('3-1');
    for (let i = 0; i < 10; i++) {
      const q = engine.question(engine.state.set[i])!;
      for (let id = 1; id <= 3; id++) {
        clock = i * 1000 + id * 10;
        engine.dispatch(
          'answer.submit',
          {
            roundQuestionId: q.id,
            answer: q.type === 'mcq' ? q.correct : (q.correct as string[])[0],
          },
          team(id),
        );
      }
      if (q.type !== 'mcq')
        for (const a of engine.state.answers.filter((a) => a.questionId === q.id))
          engine.dispatch('grade.set', { answerId: a.id, verdict: 'correct' }, admin);
      engine.dispatch('question.reveal', {}, admin);
      if (i < 9) engine.dispatch('question.next', {}, admin);
    }
    expect(engine.state.phase).toBe('RESULTS');
    expect(engine.state.winner).toBe(1);
    expect(engine.scores()[1]).toBe(10);
    expect(engine.teams().find((t) => t.id === 1)?.status).toBe('champion');
  });
  it('does not drop below ground on unanswered questions', () => {
    start('3-1');
    engine.state.endsAt = Date.now() - 1;
    engine.dispatch('system.tick', {}, { role: 'system', deviceId: 'timer' });
    engine.dispatch('question.reveal', {}, admin);
    expect(engine.scores()[1]).toBe(0);
    expect(engine.snapshot({ role: 'display', deviceId: 'display' }).lineup[0].score).toBe(0);
  });
});
describe('full 48-team tournament', () => {
  it('advances 48 → 12 → 3 → champion using all configured rounds', () => {
    engine.dispatch(
      'settings.update',
      { settings: { automation: 'manual', countdownMs: 1 } },
      admin,
    );
    function begin() {
      engine.dispatch('round.openHandshake', {}, admin);
      engine.dispatch('round.forceStart', {}, admin);
      engine.state.endsAt = Date.now() - 1;
      engine.dispatch('system.tick', {}, { role: 'system', deviceId: 'timer' });
    }
    for (let r = 0; r < 12; r++) {
      begin();
      const ids = [...engine.round.teamIds];
      for (let i = 0; i < 10; i++)
        for (const id of ids) {
          clock += 10;
          engine.dispatch(
            'answer.submit',
            { roundQuestionId: engine.state.set[i], answer: id === ids[0] ? 0 : 1 },
            team(id),
          );
        }
      expect(engine.state.winner).toBe(ids[0]);
      engine.dispatch('round.next', {}, admin);
    }
    expect(engine.state.rounds.filter((r) => r.stage === 1 && r.winner)).toHaveLength(12);
    expect(
      engine.state.rounds.filter((r) => r.stage === 2).every((r) => r.teamIds.length === 4),
    ).toBe(true);
    for (let r = 0; r < 3; r++) {
      begin();
      const ids = [...engine.round.teamIds];
      for (let i = 0; i < 8; i++) {
        engine.dispatch('wheel.spin', {}, admin);
        for (const id of ids) engine.dispatch('card.select', { value: 15 }, team(id));
        engine.dispatch('question.start', {}, admin);
        const q = engine.question(engine.state.set[i])!;
        for (const id of ids) {
          clock += 10;
          engine.dispatch(
            'answer.submit',
            {
              roundQuestionId: q.id,
              answer:
                q.type === 'mcq'
                  ? id === ids[0]
                    ? q.correct
                    : 1
                  : id === ids[0]
                    ? (q.correct as string[])[0]
                    : 'wrong',
            },
            team(id),
          );
        }
        for (const a of engine.state.answers.filter((a) => a.verdict === 'pending'))
          engine.dispatch(
            'grade.set',
            { answerId: a.id, verdict: a.teamId === ids[0] ? 'correct' : 'wrong' },
            admin,
          );
        engine.dispatch('question.reveal', {}, admin);
        if (i < 7) engine.dispatch('question.next', {}, admin);
      }
      engine.dispatch('round.next', {}, admin);
    }
    expect(engine.round.teamIds).toHaveLength(3);
    begin();
    const ids = [...engine.round.teamIds];
    for (let i = 0; i < 10; i++) {
      const q = engine.question(engine.state.set[i])!;
      for (const id of ids) {
        clock += 10;
        engine.dispatch(
          'answer.submit',
          {
            roundQuestionId: q.id,
            answer:
              q.type === 'mcq'
                ? id === ids[0]
                  ? q.correct
                  : 1
                : id === ids[0]
                  ? (q.correct as string[])[0]
                  : 'wrong',
          },
          team(id),
        );
      }
      for (const a of engine.state.answers.filter((a) => a.verdict === 'pending'))
        engine.dispatch(
          'grade.set',
          { answerId: a.id, verdict: a.teamId === ids[0] ? 'correct' : 'wrong' },
          admin,
        );
      engine.dispatch('question.reveal', {}, admin);
      if (i < 9) engine.dispatch('question.next', {}, admin);
    }
    expect(engine.state.winner).toBe(1);
    expect(engine.teams().filter((t) => t.status === 'champion')).toHaveLength(1);
    expect(engine.state.rounds.every((r) => r.completed)).toBe(true);
  });
});
describe('operator overrides and final fallback', () => {
  it('consumes a scheduled auto action when the operator triggers it early', () => {
    start('2-1');
    engine.dispatch('automation.set', { mode: 'auto' }, admin);
    engine.dispatch('wheel.spin', {}, admin);
    for (let id = 1; id <= 4; id++) engine.dispatch('card.select', { value: 5 }, team(id));
    expect(engine.state.autoAction).toBe('question.start');
    engine.dispatch('question.start', {}, admin);
    expect(engine.state.autoAt).toBe(0);
    expect(engine.state.autoAction).toBe('');
  });
  it('selects the highest position after all fifteen questions', () => {
    start('3-1');
    for (let i = 0; i < 15; i++) {
      const q = engine.question(engine.state.set[i])!;
      for (let id = 1; id <= 3; id++) {
        clock += 10;
        const correct = id === 1 && i % 2 === 0;
        engine.dispatch(
          'answer.submit',
          {
            roundQuestionId: q.id,
            answer:
              q.type === 'mcq'
                ? correct
                  ? q.correct
                  : 1
                : correct
                  ? (q.correct as string[])[0]
                  : 'wrong',
          },
          team(id),
        );
      }
      for (const a of engine.state.answers.filter((a) => a.verdict === 'pending'))
        engine.dispatch(
          'grade.set',
          { answerId: a.id, verdict: a.teamId === 1 && i % 2 === 0 ? 'correct' : 'wrong' },
          admin,
        );
      engine.dispatch('question.reveal', {}, admin);
      if (i < 14) engine.dispatch('question.next', {}, admin);
    }
    expect(engine.state.phase).toBe('RESULTS');
    expect(engine.state.winner).toBe(1);
    expect(engine.scores()[1]).toBe(1);
  });
  it('rejects elapsed monotonic deadlines despite a future wall deadline', () => {
    start();
    clock = 120001;
    expect(() =>
      engine.dispatch(
        'answer.submit',
        { roundQuestionId: engine.state.set[0], answer: 0 },
        team(1),
      ),
    ).toThrow('deadline');
  });
});
describe('presentation support', () => {
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  it('exposes check-in, answered flags and bonus without leaking codes', () => {
    engine.dispatch(
      'settings.update',
      { settings: { automation: 'manual', countdownMs: 1 } },
      admin,
    );
    db.prepare(
      "INSERT INTO devices(id,role,team_id,token_hash,seat_no,last_seen_at) VALUES('d1','team',1,'x',1,?)",
    ).run(Date.now());
    const s: any = engine.snapshot({ role: 'display', deviceId: 'display' });
    expect(s.lineup[0]).toMatchObject({ checkedIn: true, online: true, answered: false, bonus: 0 });
    expect(s.lineup[1].checkedIn).toBe(false);
    expect(JSON.stringify(s)).not.toContain('"code"');
    expect(s.categories.length).toBeGreaterThan(0);
    const a: any = engine.snapshot({ role: 'admin', deviceId: 'admin' });
    expect(a.devices.find((d: any) => d.id === 'd1')).toBeTruthy();
  });
  it('reports own finish time and bonus to the team only after completing Blitz', () => {
    start();
    clock = 85_000;
    for (let i = 0; i < 10; i++)
      engine.dispatch(
        'answer.submit',
        { roundQuestionId: engine.state.set[i], answer: 0 },
        team(1),
        `a${i}`,
      );
    const own: any = engine.snapshot(team(1));
    expect(own.ownFinishMs).toBeGreaterThanOrEqual(85_000);
    expect(own.ownBonus).toBe(15);
    expect((engine.snapshot(team(2)) as any).ownBonus).toBe(0);
    const display: any = engine.snapshot({ role: 'display', deviceId: 'display' });
    expect(display.lineup[0].bonus).toBe(15);
    expect(display.lineup[0].answered).toBe(false);
  });
  it('forces default cards and records the wheel spin time', () => {
    start('2-1');
    engine.dispatch('wheel.spin', {}, admin);
    expect(engine.state.spinAt).toBeGreaterThan(0);
    engine.dispatch('card.select', { value: 15 }, team(1));
    engine.dispatch('cards.forceFill', {}, admin);
    expect(engine.state.cards).toEqual({ 1: 15, 2: 5, 3: 5, 4: 5 });
    engine.dispatch('question.start', {}, admin);
    expect(engine.state.phase).toBe('RUNNING');
  });
  it('force-fill honours the card reuse limit', () => {
    engine.dispatch('settings.update', { settings: { cardReuseLimit: 1 } }, admin);
    start('2-1');
    engine.dispatch('wheel.spin', {}, admin);
    engine.state.cardUses = { 2: { 5: 1 }, 3: { 5: 1, 10: 1, 15: 1 } };
    expect(() => engine.dispatch('cards.forceFill', {}, admin)).toThrow('reuse limit');
    expect(engine.state.cards).toEqual({});
    engine.state.cardUses = { 2: { 5: 1 } };
    engine.dispatch('cards.forceFill', {}, admin);
    expect(engine.state.cards).toEqual({ 1: 5, 2: 10, 3: 5, 4: 5 });
  });
  it('applies a whole draw atomically and rejects duplicates', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      key: `1-${i + 1}`,
      teamIds: [1, 2, 3, 4].map((n) => 48 - (i * 4 + n) + 1),
    }));
    engine.dispatch('bracket.bulk', { assignments: rows }, admin);
    expect(engine.state.rounds[0].teamIds).toEqual([48, 47, 46, 45]);
    const before = JSON.stringify(engine.state.rounds);
    expect(() =>
      engine.dispatch(
        'bracket.bulk',
        {
          assignments: [
            { key: '1-1', teamIds: [1, 2, 3, 4] },
            { key: '1-2', teamIds: [4, 5, 6, 7] },
          ],
        },
        admin,
      ),
    ).toThrow('twice');
    expect(JSON.stringify(engine.state.rounds)).toBe(before);
  });
  it('rejects the same round key twice in one draw', () => {
    const before = JSON.stringify(engine.state.rounds);
    expect(() =>
      engine.dispatch(
        'bracket.bulk',
        {
          assignments: [
            { key: '1-1', teamIds: [1, 2, 3, 4] },
            { key: '1-1', teamIds: [5, 6, 7, 8] },
          ],
        },
        admin,
      ),
    ).toThrow('twice');
    expect(JSON.stringify(engine.state.rounds)).toBe(before);
  });
  it('rejects a partial draw that duplicates a team from an untouched round', () => {
    const before = JSON.stringify(engine.state.rounds);
    // team 5 already sits in round 1-2 which is not part of this submission
    expect(() =>
      engine.dispatch(
        'bracket.bulk',
        { assignments: [{ key: '1-1', teamIds: [5, 2, 3, 4] }] },
        admin,
      ),
    ).toThrow('twice');
    expect(JSON.stringify(engine.state.rounds)).toBe(before);
    // a swap between two rounds is still fine
    engine.dispatch(
      'bracket.bulk',
      {
        assignments: [
          { key: '1-1', teamIds: [5, 2, 3, 4] },
          { key: '1-2', teamIds: [1, 6, 7, 8] },
        ],
      },
      admin,
    );
    expect(engine.state.rounds[1].teamIds).toEqual([1, 6, 7, 8]);
  });
  it.each(['round.assignTeams', 'bracket.override'])(
    'rejects duplicate stage entries through %s atomically',
    (command) => {
      const before = structuredClone(engine.state);
      expect(() =>
        engine.dispatch(command, { key: '1-1', teamIds: [5, 2, 3, 4] }, admin, 'invalid-draw'),
      ).toThrow('twice');
      expect(engine.state).toEqual(before);
      expect(db.prepare('SELECT COUNT(*) AS n FROM event_log').get()).toEqual({ n: 0 });
      expect(db.prepare('SELECT COUNT(*) AS n FROM commands').get()).toEqual({ n: 0 });
      engine.dispatch(command, { key: '1-1', teamIds: [4, 3, 2, 1] }, admin);
      expect(engine.round.teamIds).toEqual([4, 3, 2, 1]);
    },
  );
  it('stores team logos outside snapshots and versions them', () => {
    engine.dispatch(
      'teams.save',
      { teams: [{ id: 1, code: '111', name: 'الفريق 1', color: '#27d6b0', logo: png }] },
      admin,
    );
    expect(engine.logo(1)?.logo_mime).toBe('image/png');
    expect(engine.teams()[0].logoV).toBe(1);
    const pub: any = engine.snapshot({ role: 'display', deviceId: 'd' });
    expect(pub.lineup[0].logoV).toBe(1);
    expect(pub.rounds[0].teams[0].logoV).toBe(1);
    expect(JSON.stringify(engine.snapshot({ role: 'display', deviceId: 'd' }))).not.toContain(
      'base64',
    );
    engine.dispatch(
      'teams.save',
      { teams: [{ id: 1, code: '111', name: 'الفريق 1', color: '#27d6b0', logo: null }] },
      admin,
    );
    expect(engine.logo(1)?.logo).toBeNull();
    expect(engine.teams()[0].logoV).toBe(0);
    expect(() =>
      engine.dispatch(
        'teams.save',
        {
          teams: [
            {
              id: 1,
              code: '111',
              name: 'x',
              color: '#27d6b0',
              logo: 'data:image/svg+xml;base64,AAAA',
            },
          ],
        },
        admin,
      ),
    ).toThrow();
  });
});
