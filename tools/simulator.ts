import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
const directory = mkdtempSync(join(tmpdir(), 'ashour-sim-'));
const pin = randomUUID();
const port = await new Promise<number>((resolve) => {
  const server = createServer();
  server.listen(0, '127.0.0.1', () => {
    const p = (server.address() as { port: number }).port;
    server.close(() => resolve(p));
  });
});
const url = `http://127.0.0.1:${port}`;
let server!: ChildProcess;
let log = '';
async function wait(test: () => boolean | Promise<boolean>, label: string, timeout = 15000) {
  const start = Date.now();
  while (!(await test())) {
    if (Date.now() - start > timeout) throw new Error(`Timeout: ${label}\n${log}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}
async function boot() {
  log = '';
  server = spawn(process.execPath, ['--import', 'tsx', 'packages/server/src/index.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      QUESTION_BANK: 'demo',
      ADMIN_PIN: pin,
      HOST: '127.0.0.1',
      PORT: String(port),
      DB_PATH: join(directory, 'sim.sqlite'),
      BACKUP_DIR: join(directory, 'backups'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout?.on('data', (data) => (log += String(data)));
  server.stderr?.on('data', (data) => (log += String(data)));
  await wait(async () => {
    try {
      return (await fetch(url + '/health')).ok;
    } catch {
      return false;
    }
  }, 'server start');
}
class Bot {
  id = randomUUID();
  token: string | undefined;
  s: any;
  ws!: WebSocket;
  pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  pongs = 0;
  questionTimes: number[] = [];
  constructor(public role: 'admin' | 'team' | 'display') {}
  async connect() {
    this.ws = new WebSocket(url.replace('http', 'ws') + '/ws');
    this.ws.on('error', () => {});
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Hello timeout')), 5000);
      this.ws.on('open', () =>
        this.ws.send(
          JSON.stringify({
            v: 1,
            type: 'hello',
            payload: {
              role: this.role,
              deviceId: this.id,
              deviceToken: this.token,
              ...(this.role === 'admin' ? { pin } : {}),
            },
          }),
        ),
      );
      this.ws.on('message', (data) => {
        const m = JSON.parse(String(data));
        if (m.type === 'hello.ok') {
          this.token = m.payload.deviceToken;
          clearTimeout(timer);
          resolve();
        }
        if (m.type === 'state.snapshot') this.s = m.payload;
        if (m.type === 'question.show') this.questionTimes.push(performance.now());
        if (m.type === 'time.pong') this.pongs++;
        if (m.type === 'command.ack') {
          this.pending.get(m.payload.cmdId)?.resolve(m.payload);
          this.pending.delete(m.payload.cmdId);
        }
        if (m.type === 'error') {
          this.pending.get(m.payload.cmdId)?.reject(new Error(m.payload.message));
          this.pending.delete(m.payload.cmdId);
        }
      });
    });
    await wait(() => !!this.s, 'first snapshot');
  }
  async cmd(type: string, payload: Record<string, unknown> = {}, cmdId = randomUUID()) {
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(cmdId);
        reject(new Error(`Command timeout ${type}`));
      }, 8000);
      this.pending.set(cmdId, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.ws.send(JSON.stringify({ v: 1, type, payload, cmdId }));
    });
  }
  close() {
    this.ws.close();
  }
  ping() {
    this.ws.send(JSON.stringify({ v: 1, type: 'time.ping', payload: { c0: Date.now() } }));
  }
}
const all: Bot[] = [];
const create = async (role: 'admin' | 'team' | 'display') => {
  const b = new Bot(role);
  all.push(b);
  await b.connect();
  return b;
};
try {
  await boot();
  const admin = await create('admin'),
    display = await create('display');
  const teams: Bot[] = [];
  for (let i = 0; i < 4; i++) {
    const b = await create('team');
    await b.cmd('team.checkin', { code: String(111 + i) });
    teams.push(b);
  }
  await wait(() => admin.s?.lineup.every((t: any) => t.device), 'all checked in');
  assert(!JSON.stringify(display.s).includes('"code"'));
  assert(!('questions' in teams[0].s));
  await assert.rejects(display.cmd('round.forceStart'), /Unauthorized/);
  const duplicate = await create('team');
  await assert.rejects(duplicate.cmd('team.checkin', { code: '111' }), /already checked in/);
  duplicate.close();
  await admin.cmd('settings.update', { settings: { automation: 'manual', countdownMs: 1 } });
  await admin.cmd('round.openHandshake');
  for (const b of teams) await b.cmd('team.ready');
  await admin.cmd('round.start');
  await wait(() => teams.every((b) => b.s.phase === 'RUNNING'), 'blitz running');
  const first = teams[0].s.question.id;
  const duplicateId = randomUUID();
  await teams[0].cmd('answer.submit', { roundQuestionId: first, answer: 0 }, duplicateId);
  await teams[0].cmd('answer.submit', { roundQuestionId: first, answer: 0 }, duplicateId);
  await assert.rejects(
    teams[0].cmd('answer.submit', { roundQuestionId: first, answer: 0 }),
    /Stale/,
  );
  // Reconnect mid-round with the same persisted device token.
  teams[0].close();
  await wait(() => teams[0].ws.readyState === WebSocket.CLOSED, 'team close');
  teams[0].s = null;
  await teams[0].connect();
  assert.equal(teams[0].s.team.id, 1);
  assert.equal(teams[0].s.ownProgress, 1);
  await admin.cmd('round.pause');
  await wait(() => teams[0].s.paused, 'pause');
  await assert.rejects(
    teams[0].cmd('answer.submit', { roundQuestionId: teams[0].s.question?.id ?? first, answer: 0 }),
    /paused/,
  );
  await admin.cmd('round.resume');
  await wait(() => teams[0].s.question, 'resume');
  for (let i = 0; i < 10; i++)
    for (let j = 0; j < 4; j++) {
      const b = teams[j];
      if (i === 0 && j === 0) continue;
      await wait(
        () => b.s.phase === 'RUNNING' && b.s.ownProgress === i && b.s.question,
        'blitz question',
      );
      assert(!('correct' in b.s.question));
      await b.cmd('answer.submit', { roundQuestionId: b.s.question.id, answer: j === 0 ? 0 : 1 });
    }
  await wait(() => admin.s.phase === 'RESULTS', 'blitz results');
  assert.equal(admin.s.winner, 1);
  assert.equal(admin.s.lineup[0].score, 96);
  console.log(
    'PASS Stage 1, deduplication, double submissions, role isolation, reconnect, pause/resume.',
  );
  await admin.cmd('round.select', { key: '2-1' });
  await admin.cmd('round.assignTeams', { teamIds: [1, 2, 3, 4] });
  await admin.cmd('round.openHandshake');
  await admin.cmd('round.forceStart');
  await wait(() => admin.s.phase === 'WHEEL', 'gambler wheel');
  const spreads: number[] = [];
  for (let i = 0; i < 8; i++) {
    await admin.cmd('wheel.spin');
    await wait(() => teams.every((b) => b.s.phase === 'CARD_PICK'), 'cards');
    assert(teams.every((b) => b.s.question === null));
    for (const b of teams) await b.cmd('card.select', { value: 15 });
    const counts = teams.map((b) => b.questionTimes.length);
    await admin.cmd('question.start');
    await wait(
      () =>
        teams.every(
          (b, j) => b.questionTimes.length > counts[j] && b.s.phase === 'RUNNING' && b.s.question,
        ),
      'simultaneous question',
    );
    spreads.push(
      Math.max(...teams.map((b) => b.questionTimes.at(-1)!)) -
        Math.min(...teams.map((b) => b.questionTimes.at(-1)!)),
    );
    const q = admin.s.questions.find((q: any) => q.id === teams[0].s.question.id);
    for (let j = 0; j < 4; j++)
      await teams[j].cmd('answer.submit', {
        roundQuestionId: q.id,
        answer: q.type === 'mcq' ? (j === 0 ? q.correct : 1) : j === 0 ? q.correct[0] : 'wrong',
      });
    await wait(() => admin.s.phase === 'AUDIENCE', 'audience');
    assert(!('correct' in display.s.question));
    for (const a of admin.s.answers.filter(
      (a: any) => a.questionId === q.id && a.verdict === 'pending',
    ))
      await admin.cmd('grade.set', {
        answerId: a.id,
        verdict: a.teamId === 1 ? 'correct' : 'wrong',
      });
    await admin.cmd('question.reveal');
    if (i < 7) await admin.cmd('question.next');
  }
  await wait(() => admin.s.phase === 'RESULTS', 'gambler result');
  assert.equal(admin.s.winner, 1);
  assert.equal(admin.s.lineup[0].score, 120);
  console.log(
    `PASS Stage 2, card gating, manual grading and negative balances. Local receipt spread: min ${Math.min(...spreads).toFixed(3)} ms / max ${Math.max(...spreads).toFixed(3)} ms (loopback, not LAN).`,
  );
  await admin.cmd('round.select', { key: '3-1' });
  await admin.cmd('round.assignTeams', { teamIds: [1, 2, 3] });
  await admin.cmd('round.openHandshake');
  await admin.cmd('round.forceStart');
  await wait(() => admin.s.phase === 'RUNNING', 'final question');
  // Crash while the question is live. All identities and current question survive.
  await wait(() => teams[0].s.question, 'final question reaches the team');
  const questionId = teams[0].s.question.id;
  for (const b of all) b.close();
  server.kill('SIGKILL');
  await new Promise<void>((r) => server.once('exit', () => r()));
  await boot();
  for (const b of [admin, display, ...teams]) {
    b.s = null;
    await b.connect();
  }
  assert(admin.s.paused);
  assert.equal(teams[0].s.team.id, 1);
  await admin.cmd('round.resume');
  await wait(() => teams[0].s.question, 'recovered question');
  assert.equal(teams[0].s.question.id, questionId);
  for (let i = 0; i < 10; i++) {
    await wait(
      () => teams.slice(0, 3).every((b) => b.s.phase === 'RUNNING' && b.s.question),
      'final live',
    );
    const q = admin.s.questions.find((q: any) => q.id === teams[0].s.question.id);
    for (let j = 0; j < 3; j++)
      await teams[j].cmd('answer.submit', {
        roundQuestionId: q.id,
        answer: q.type === 'mcq' ? (j === 0 ? q.correct : 1) : j === 0 ? q.correct[0] : 'wrong',
      });
    await wait(() => admin.s.phase === 'AUDIENCE', 'final audience');
    for (const a of admin.s.answers.filter(
      (a: any) => a.questionId === q.id && a.verdict === 'pending',
    ))
      await admin.cmd('grade.set', {
        answerId: a.id,
        verdict: a.teamId === 1 ? 'correct' : 'wrong',
      });
    await admin.cmd('question.reveal');
    if (i < 9) await admin.cmd('question.next');
  }
  await wait(() => admin.s.phase === 'RESULTS', 'champion');
  assert.equal(admin.s.winner, 1);
  assert.equal(admin.s.lineup[0].score, 10);
  assert.equal(admin.s.teams.find((t: any) => t.id === 1).status, 'champion');
  console.log('PASS Stage 3, floor at zero, championship and process crash recovery.');
  for (let i = 0; i < 14; i++) await create('display');
  const active = all.filter((b) => b.ws.readyState === WebSocket.OPEN);
  assert.equal(active.length, 20);
  const start = performance.now();
  for (let batch = 0; batch < 10; batch++) {
    for (let i = 0; i < 100; i++) active[i % 20].ping();
    await new Promise((r) => setTimeout(r, 1000));
  }
  await wait(() => active.reduce((n, b) => n + b.pongs, 0) === 1000, '1000 pongs');
  console.log(
    `PASS Load: 20 active sockets, 100 messages/s, 1000/1000 replies in ${((performance.now() - start) / 1000).toFixed(2)} s.`,
  );
  const unauthorized = await fetch(url + '/api/export');
  assert.equal(unauthorized.status, 401);
  const exported = await fetch(url + '/api/export', {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  assert(exported.ok);
  const data = await exported.json();
  assert(data.ledger.length > 0 && data.answers.length > 0 && data.audit.length > 0);
  const backup = await fetch(url + '/api/backup', {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  assert(backup.ok);
  assert((await backup.arrayBuffer()).byteLength > 0);
  for (const path of ['/admin', '/display', '/play']) assert((await fetch(url + path)).ok);
  const auth = { Authorization: `Bearer ${admin.token}` };
  const auditCsv = await (await fetch(url + '/api/audit.csv', { headers: auth })).text();
  assert(auditCsv.split('\n').length > 5 && auditCsv.includes('answer.submit'));
  assert.equal((await fetch(url + '/api/audit.csv')).status, 401);
  const network = (await (await fetch(url + '/api/network', { headers: auth })).json()) as {
    port: number;
    addresses: string[];
  };
  assert(Array.isArray(network.addresses) && network.port > 0);
  // Team logo round trip: public image route, versioned, never inside snapshots.
  assert.equal((await fetch(url + '/logo/1')).status, 404);
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const saved = await fetch(url + '/api/command', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'teams.save',
      cmdId: 'logo-1',
      payload: { teams: [{ id: 1, code: '111', name: 'الفريق 1', color: '#27d6b0', logo: png }] },
    }),
  });
  assert(saved.ok, await saved.clone().text());
  const logo = await fetch(url + '/logo/1');
  assert.equal(logo.headers.get('content-type'), 'image/png');
  assert((await logo.arrayBuffer()).byteLength > 20);
  console.log(
    'PASS authenticated exports, audit CSV, team logos, SQLite backup and static routes.',
  );
  console.log('All simulator checks passed.');
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const b of all) b.close();
  if (server! && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise<void>((r) => {
      server.once('exit', () => r());
      setTimeout(() => {
        server.kill('SIGKILL');
        r();
      }, 5000).unref();
    });
  }
  rmSync(directory, { recursive: true, force: true });
}
