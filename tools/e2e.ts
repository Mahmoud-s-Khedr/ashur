/** Real-server end-to-end checks. Every scenario owns a disposable database and port. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

import { browserOperations } from './e2e-browser';
import { Server, Client, output, results, sleep, until } from './test-harness';
import { tournament, seat, begin } from './tournament';

async function scenario(name: string, run: (s: Server) => Promise<void>, bank = 'demo') {
  const s = new Server(bank);
  const start = Date.now();
  try {
    await s.start();
    await run(s);
    results.push({ scenario: name, status: 'passed', durationMs: Date.now() - start });
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push({
      scenario: name,
      status: 'failed',
      durationMs: Date.now() - start,
      detail: String(e),
    });
    writeFileSync(join(output, 'server-failure.log'), s.log);
    console.error(`FAIL ${name}:`, e);
  } finally {
    await s.stop();
    writeFileSync(join(output, name.replace(/[^a-z0-9]+/gi, '-') + '.log'), s.log);
    rmSync(s.dir, { recursive: true, force: true });
    writeFileSync(join(output, 'report.json'), JSON.stringify(results, null, 2));
  }
}
async function operations(s: Server) {
  const admin = await s.client('admin'),
    display = await s.client('display');
  const teams = await Promise.all(Array.from({ length: 4 }, () => s.client('team')));
  const initial = await admin.export();
  const firstTeam = initial.teams[0];
  await admin.bulk(
    'teams.save',
    {
      teams: [
        { ...firstTeam, name: 'Atomic rollback' },
        { code: '111', name: 'Duplicate', color: '#ffffff' },
      ],
    },
    false,
  );
  assert.equal((await admin.export()).teams[0].name, firstTeam.name);
  await admin.bulk(
    'questions.save',
    {
      questions: [
        { ...initial.questions[0], body: 'Atomic rollback' },
        { ...initial.questions[1], body: '' },
      ],
    },
    false,
  );
  assert.equal((await admin.export()).questions[0].body, initial.questions[0].body);
  const { id: ignoredId, ...newQuestion } = initial.questions[0];
  await admin.bulk('questions.save', {
    questions: [
      {
        ...newQuestion,
        stage: null,
        pool: 'reserve',
        setNo: null,
        type: 'numeric',
        body: 'Disposable E2E numeric question',
        options: [],
        correct: ['4'],
      },
    ],
  });
  const created = (await admin.export()).questions.find(
    (q: any) => q.body === 'Disposable E2E numeric question',
  );
  assert(created && created.id !== ignoredId);
  await admin.cmd('questions.delete', { id: created.id });
  assert.equal((await admin.export()).questions.length, initial.questions.length);
  await admin.cmd('questions.resetUsed');
  await admin.cmd('set.build', {
    seq: 1,
    questionIds: initial.questions.slice(0, 10).map((q: any) => q.id),
  });
  for (const cmd of ['round.assignTeams', 'bracket.override'])
    await assert.rejects(admin.cmd(cmd, { key: '1-1', teamIds: [5, 2, 3, 4] }), /twice/);
  await admin.cmd('bracket.bulk', {
    assignments: [
      { key: '1-1', teamIds: [5, 2, 3, 4] },
      { key: '1-2', teamIds: [1, 6, 7, 8] },
    ],
  });
  await admin.cmd('bracket.bulk', {
    assignments: [
      { key: '1-1', teamIds: [1, 2, 3, 4] },
      { key: '1-2', teamIds: [5, 6, 7, 8] },
    ],
  });
  await assert.rejects(display.cmd('round.forceStart'), /Unauthorized/);
  await assert.rejects(
    teams[0].cmd('settings.update', { settings: { sound: false } }),
    /Unauthorized/,
  );
  for (const path of [
    '/api/export',
    '/api/results.csv',
    '/api/audit.csv',
    '/api/backup',
    '/api/network',
    '/api/command',
  ])
    assert.equal(
      (await fetch(s.url + path, path.endsWith('command') ? { method: 'POST', body: '{}' } : {}))
        .status,
      401,
    );
  for (const scene of ['intro', 'bracket', 'leaderboard', 'auto']) {
    await admin.cmd('display.scene', { scene });
    await until(() => display.s.scene === scene, 'display scene');
  }
  await admin.cmd('settings.update', {
    settings: { automation: 'auto', countdownMs: 5, autoDelayMs: 2000, questionMs: 500 },
  });
  await admin.cmd('lineup.announce');
  await seat(admin, teams);
  assert.equal(admin.s.autoAction, 'round.start');
  await admin.cmd('auto.cancel');
  await sleep(2100);
  assert.equal(admin.s.phase, 'HANDSHAKE');
  await admin.cmd('automation.set', { mode: 'assisted' });
  await admin.cmd('round.start');
  await until(() => admin.s.phase === 'RUNNING', 'Blitz starts');
  await until(() => !!teams[0].s.question, 'first Blitz question reaches team');
  const leaked = teams[0].s.question.id;
  const cmdId = randomUUID();
  await teams[0].cmd('answer.submit', { roundQuestionId: leaked, answer: 0 }, cmdId);
  await teams[0].cmd('answer.submit', { roundQuestionId: leaked, answer: 0 }, cmdId);
  assert.equal(teams[0].s.ownProgress, 1);
  await admin.cmd('round.pause');
  const remaining = admin.s.remainingMs;
  await sleep(300);
  await admin.cmd('question.cancelLeak', { questionId: leaked });
  assert(admin.s.paused);
  assert.equal(admin.s.remainingMs, remaining);
  await until(() => teams[0].s.ownProgress === 0 && teams[0].s.paused, 'paused rewind');
  assert.equal(teams[0].s.question, null);
  assert.equal(admin.s.lineup[0].score, 0);
  await admin.cmd('round.resume');
  await until(() => !!teams[0].s.question, 'replacement question');
  const replacement = teams[0].s.question.id;
  await assert.rejects(
    teams[0].cmd('answer.submit', { roundQuestionId: leaked, answer: 0 }),
    /Stale/,
  );
  await admin.cmd('score.adjust', { teamId: 1, delta: -5, reason: 'Objection' });
  await admin.cmd('undo.last');
  assert.equal(admin.s.lineup[0].score, 0);
  await assert.rejects(admin.cmd('questions.delete', { id: replacement }), /used/);
  await assert.rejects(admin.cmd('devices.reset'), /live/);
  await assert.rejects(admin.cmd('settings.update', { settings: { questionMs: 100 } }), /Illegal/);
  await admin.cmd('checkin.kick', { teamId: 4 });
  await until(() => !teams[3].s.team, 'kick reaches device');
  await teams[3].cmd('team.checkin', { code: '114' });
  await admin.cmd('round.pause');
  const exported = await admin.export();
  const backup = await fetch(s.url + '/api/backup', {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  assert(backup.ok);
  const path = join(s.dir, 'restored.sqlite');
  writeFileSync(path, Buffer.from(await backup.arrayBuffer()));
  await s.stop('SIGKILL');
  await s.start(path);
  await admin.connect();
  const restored = await admin.export();
  assert.deepEqual(restored, exported);
  assert(admin.s.paused);
  for (const team of teams) await team.connect();
  await admin.cmd('round.resume');
  await until(() => !!teams[0].s.question, 'restored replacement reaches team');
  assert.equal(teams[0].s.question.id, replacement);
  for (let i = 0; i < 10; i++)
    for (const team of teams) {
      await until(() => !!team.s.question, 'Blitz question');
      const q = team.s.question;
      await team.cmd('answer.submit', { roundQuestionId: q.id, answer: 0 });
    }
  assert.equal(admin.s.phase, 'REVIEW');
  assert.deepEqual(admin.s.tieIds, [1, 2, 3, 4]);
  await admin.cmd('tiebreak.open');
  for (const team of teams) await team.cmd('team.ready');
  await admin.cmd('tiebreak.launch');
  await until(() => teams.every((team) => !!team.s.question), 'tie question');
  const tieId = teams[0].s.question.id;
  for (const team of teams)
    await team.cmd('answer.submit', { roundQuestionId: tieId, answer: 'wrong' });
  await assert.rejects(admin.cmd('question.reveal'), /Grade/);
  for (const a of admin.s.answers.filter((a: any) => a.verdict === 'pending'))
    await admin.cmd('grade.set', { answerId: a.id, verdict: 'wrong' });
  await admin.cmd('question.reveal');
  assert.equal(admin.s.phase, 'TIE_READY');
  for (const team of teams) await team.cmd('team.ready');
  await admin.cmd('tiebreak.launch');
  await admin.cmd('score.adjust', { teamId: 4, delta: -5, reason: 'Correct leaders' });
  assert.equal(admin.s.phase, 'REVIEW');
  assert.deepEqual(admin.s.tieIds, [1, 2, 3]);
  await admin.cmd('undo.last');
  assert.deepEqual(admin.s.tieIds, [1, 2, 3, 4]);
  await admin.cmd('score.adjust', { teamId: 1, delta: 5, reason: 'Resolve tie' });
  assert.equal(admin.s.phase, 'RESULTS');
  assert.equal(admin.s.winner, 1);
  await admin.cmd('round.select', { key: '2-1' });
  await admin.cmd('round.assignTeams', { teamIds: [1, 2, 3, 4] });
  await admin.cmd('settings.update', { settings: { automation: 'manual' } });
  await begin(admin, teams);
  await admin.cmd('wheel.spin');
  await teams[0].cmd('card.select', { value: 15 });
  await admin.cmd('question.reroll');
  assert(admin.s.lineup.every((t: any) => t.card === null));
  await admin.cmd('cards.forceFill');
  assert(admin.s.lineup.every((t: any) => t.card === 5));
  await admin.cmd('question.start');
  await admin.cmd('round.pause');
  await admin.cmd('question.cancelLeak');
  assert(admin.s.paused);
  assert.equal(admin.s.remainingMs, 500);
  await admin.cmd('round.resume');
  await until(() => admin.s.phase === 'AUDIENCE', 'unanswered timeout');
  await admin.cmd('question.reveal');
  assert(admin.s.lineup.every((t: any) => t.score === -5));
  const final = await admin.export();
  assert(final.ledger.some((e: any) => e.kind === 'reversal'));
  for (const path of ['/api/results.csv', '/api/audit.csv']) {
    const r = await fetch(s.url + path, { headers: { Authorization: `Bearer ${admin.token}` } });
    assert(r.ok);
    assert((await r.text()).split('\n').length > 2);
  }
  for (let i = 0; i < 5; i++)
    await assert.rejects(teams[3].cmd('team.checkin', { code: '9999' }), /Unknown/);
  await assert.rejects(teams[3].cmd('team.checkin', { code: '114' }), /locked/);
  writeFileSync(join(output, 'operations-export.json'), JSON.stringify(final, null, 2));
}

async function authenticationAndFaults(s: Server) {
  const admin = await s.client('admin'),
    display = await s.client('display');
  const teams = await Promise.all(Array.from({ length: 4 }, () => s.client('team')));
  async function hello(payload: object, expected: RegExp) {
    const ws = new WebSocket(s.url.replace('http', 'ws') + '/ws');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.terminate();
        reject(new Error('Hello probe timeout'));
      }, 5000);
      ws.on('error', reject);
      ws.on('open', () => ws.send(JSON.stringify({ v: 1, type: 'hello', payload })));
      ws.on('message', (raw) => {
        const m = JSON.parse(String(raw));
        if (m.type !== 'error') return;
        clearTimeout(timer);
        try {
          assert.match(m.payload.message, expected);
          resolve();
        } catch (e) {
          reject(e);
        }
        ws.close();
      });
    });
  }
  await hello(
    { role: 'team', deviceId: teams[0].id, deviceToken: 'forged-token' },
    /Invalid device token/,
  );
  await hello(
    { role: 'team', deviceId: teams[0].id, deviceToken: teams[0].token },
    /already connected/,
  );
  await hello(
    { role: 'admin', deviceId: display.id, deviceToken: display.token, pin: s.pin },
    /Invalid device token/,
  );
  assert.equal(
    (await fetch(s.url + '/api/export', { headers: { Authorization: `Bearer ${display.token}` } }))
      .status,
    401,
  );
  await admin.cmd('settings.update', {
    settings: { automation: 'manual', countdownMs: 1000, questionMs: 300, blitzMs: 10000 },
  });
  await admin.cmd('lineup.announce');
  await seat(admin, teams);
  const fifth = await s.client('team');
  await assert.rejects(fifth.cmd('team.checkin', { code: '115' }), /seats/);
  teams[3].ws.terminate();
  await until(() => teams[3].ws.readyState === WebSocket.CLOSED, 'offline device');
  await assert.rejects(fifth.cmd('team.checkin', { code: '114' }), /already checked in/);
  await admin.cmd('checkin.kick', { teamId: 4 });
  await fifth.cmd('team.checkin', { code: '114' });
  await fifth.cmd('team.ready');
  await admin.cmd('round.forceStart');
  await admin.cmd('round.pause');
  assert.equal(admin.s.phase, 'COUNTDOWN');
  await sleep(1100);
  assert.equal(admin.s.phase, 'COUNTDOWN');
  await admin.cmd('round.resume');
  await until(() => !!teams[0].s.question, 'live question after paused countdown');
  const q = teams[0].s.question.id;
  await assert.rejects(
    teams[0].cmd('answer.submit', { roundQuestionId: q, answer: 99 }),
    /Invalid answer/,
  );
  const command = randomUUID();
  await teams[0].cmd('answer.submit', { roundQuestionId: q, answer: 0 }, command);
  const before = await admin.export();
  const version = before.state.version;
  await s.stop('SIGKILL');
  await s.start();
  await admin.connect();
  await teams[0].connect();
  assert(admin.s.paused);
  const recovered = await admin.export();
  assert.deepEqual(recovered.answers, before.answers);
  assert.deepEqual(recovered.ledger, before.ledger);
  assert.equal(recovered.state.version, version);
  assert.equal(teams[0].s.ownProgress, 1);
  await teams[0].cmd('answer.submit', { roundQuestionId: q, answer: 0 }, command);
  assert.equal(teams[0].s.ownProgress, 1);
  await admin.cmd('round.resume');
  await until(() => !!teams[0].s.question, 'resume after active crash');
  assert.notEqual(teams[0].s.question.id, q);
  await until(() => ['REVIEW', 'RESULTS'].includes(admin.s.phase), 'Blitz deadline', 15000);
  const lateQ = teams[0].s.question?.id ?? recovered.state.set[1];
  await assert.rejects(
    teams[0].cmd('answer.submit', { roundQuestionId: lateQ, answer: 0 }),
    /Illegal/,
  );
  assert.equal(admin.s.winner, 1);
  const tooBig = await fetch(s.url + '/api/command', {
    method: 'POST',
    headers: { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'x'.repeat(2_000_001) }),
  });
  assert.equal(tooBig.status, 413);
  await sleep(600);
  const backups = readdirSync(join(s.dir, 'backups')).filter((p) => p.endsWith('.sqlite'));
  assert(backups.length > 0 && backups.length <= 20);

  // Protocol validation and rate limiting on an independent public display socket.
  const probe = await s.client('display');
  let quotaErrors = 0;
  const invalid = async (message: string, expected: RegExp) => {
    const result = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Protocol probe timeout')), 5000);
      const receive = (raw: WebSocket.RawData) => {
        const m = JSON.parse(String(raw));
        if (m.type !== 'error') return;
        clearTimeout(timer);
        probe.ws.off('message', receive);
        try {
          assert.match(m.payload.message, expected);
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      probe.ws.on('message', receive);
    });
    probe.ws.send(message);
    await result;
  };
  await invalid('{invalid json', /JSON|Unexpected|property/i);
  await invalid(JSON.stringify({ v: 1, type: 'round.start', payload: {} }), /cmdId/);
  await assert.rejects(probe.cmd('round.forceStart'), /Unauthorized/);
  probe.ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.type === 'error' && /Rate limit/.test(m.payload.message)) quotaErrors++;
  });
  for (let i = 0; i < 150; i++)
    probe.ws.send(JSON.stringify({ v: 1, type: 'time.ping', payload: { c0: Date.now() } }));
  await until(() => quotaErrors > 0, 'per-socket rate limit');
  for (let i = 0; i < 5; i++)
    await hello({ role: 'admin', deviceId: randomUUID(), pin: 'wrong-pin' }, /Invalid admin PIN/);
  await hello({ role: 'admin', deviceId: randomUUID(), pin: s.pin }, /locked/);
}

async function supervisorRecovery(s: Server) {
  await s.stop();
  await s.start(undefined, true);
  const admin = await s.client('admin');
  await admin.cmd('settings.update', { settings: { automation: 'manual', countdownMs: 5 } });
  await admin.cmd('lineup.announce');
  await admin.cmd('round.forceStart');
  await until(() => admin.s.phase === 'RUNNING', 'supervised round');
  const supervisorPid = s.process!.pid!;
  const children = () =>
    execFileSync('ps', ['--ppid', String(supervisorPid), '-o', 'pid='], {
      encoding: 'utf8',
    }).trim();
  const original = Number(children());
  assert(original > 0);
  process.kill(original, 'SIGKILL');
  await until(() => s.log.includes('restart in'), 'supervisor detects crash');
  await until(async () => {
    try {
      const health = await fetch(s.url + '/health').then((r) => r.json());
      return health.phase === 'RUNNING' && health.paused;
    } catch {
      return false;
    }
  }, 'automatic restart returns paused');
  assert.notEqual(Number(children()), original);
  await admin.connect();
  await admin.cmd('round.resume');
  assert(!admin.s.paused);
  await s.stop();
  assert.equal(s.process!.exitCode, 0);
}

async function simultaneousFinal(s: Server) {
  const admin = await s.client('admin');
  const teams = await Promise.all(Array.from({ length: 3 }, () => s.client('team')));
  await admin.cmd('settings.update', { settings: { automation: 'manual', countdownMs: 5 } });
  await admin.cmd('round.select', { key: '3-1' });
  await admin.cmd('round.assignTeams', { teamIds: [1, 2, 3] });
  await begin(admin, teams);
  for (let index = 0; index < 10; index++) {
    await until(
      () => teams.every((t) => t.s.question && !t.s.submitted),
      'simultaneous final question',
    );
    const q = teams[0].s.question;
    await Promise.all(
      [2, 0, 1].map((i) =>
        teams[i].cmd('answer.submit', {
          roundQuestionId: q.id,
          answer: q.type === 'mcq' ? 0 : String(index + 2),
        }),
      ),
    );
    await until(() => admin.s.phase === 'AUDIENCE', 'all final answers collected');
    for (const a of admin.s.answers.filter((a: any) => a.verdict === 'pending'))
      await admin.cmd('grade.set', { answerId: a.id, verdict: 'correct' });
    assert.equal(admin.s.winner, undefined, 'Victory must wait for reveal');
    await admin.cmd('question.reveal');
    assert(admin.s.lineup.every((t: any) => t.score === index + 1));
    if (index < 9) await admin.cmd('question.next');
    else {
      const receipts = admin.s.answers
        .filter((a: any) => a.questionId === q.id)
        .sort((a: any, b: any) => a.elapsedUs - b.elapsedUs);
      assert.equal(admin.s.phase, 'RESULTS');
      assert.equal(admin.s.winner, receipts[0].teamId);
      writeFileSync(join(output, 'simultaneous-finish.json'), JSON.stringify(receipts, null, 2));
    }
  }
}

const selection = process.env.E2E_ONLY;
assert(
  !selection ||
    ['tournaments', 'operations', 'faults', 'supervisor', 'arbitration', 'browser'].includes(
      selection,
    ),
  'Unknown E2E_ONLY scenario',
);
if (!selection || selection === 'tournaments') {
  await scenario('Full bundled real-bank tournament', (s) => tournament(s, false), 'real');
  await scenario('Full 48-team manual tournament with exact scores', (s) => tournament(s, false));
  await scenario('Full 48-team automatic tournament with 15-question final fallback', (s) =>
    tournament(s, true),
  );
}
if (!selection || selection === 'operations')
  await scenario(
    'Imports, draw, permissions, emergency controls, tie corrections and backup restore',
    operations,
  );
if (!selection || selection === 'faults')
  await scenario(
    'Authentication, seat limits, paused countdown, active crash, deadlines and protocol limits',
    authenticationAndFaults,
  );
if (!selection || selection === 'supervisor')
  await scenario('Linux supervisor automatic restart and clean shutdown', supervisorRecovery);
if (!selection || selection === 'arbitration')
  await scenario(
    'Three simultaneous ladder finishes use earliest correct server receipt',
    simultaneousFinal,
  );
if (!selection || selection === 'browser')
  await scenario(
    'Browser admin tools, four teams, projector, reconnect, corrections, downloads and printing',
    browserOperations,
  );
writeFileSync(join(output, 'report.json'), JSON.stringify(results, null, 2));
console.log(`Evidence: ${output}`);
if (results.some((r) => r.status !== 'passed')) process.exitCode = 1;
