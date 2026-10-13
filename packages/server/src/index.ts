import 'dotenv/config';
import Fastify from 'fastify';
import staticPlugin from '@fastify/static';
import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { networkInterfaces } from 'node:os';
import { z } from 'zod';
import QRCode from 'qrcode';
import { envelope, type Role } from '@ashour/shared';
import { openDb } from './db';
import { seed } from './seed';
import { Engine, type Actor } from './engine';
const pin = process.env.ADMIN_PIN;
if (!pin || pin.length < 6)
  throw new Error(
    'Set ADMIN_PIN (at least 6 characters). Copy .env.example to .env and choose a private PIN.',
  );
const app = Fastify({ logger: false, bodyLimit: 2_000_000 });
const db = openDb();
seed(db);
const engine = new Engine(db);
const port = Number(process.env.PORT || 3000),
  host = process.env.HOST || '0.0.0.0';
const hash = (v: string) => createHash('sha256').update(v).digest('hex');
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
type Client = {
  actor: Actor;
  alive: boolean;
  authenticated: boolean;
  windowAt: number;
  count: number;
  connectedAt: number;
  lastPing: number;
};
const clients = new Map<WebSocket, Client>();
const attempts = new Map<string, { count: number; lockedUntil: number }>();
const send = (ws: WebSocket, type: string, payload: unknown) => {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ v: 1, type, payload }));
};
function refreshActor(client: Client) {
  const row = db
    .prepare('SELECT team_id,rtt_ms FROM devices WHERE id=?')
    .get(client.actor.deviceId) as any;
  client.actor.teamId = row?.team_id ?? undefined;
  client.actor.rttMs = row?.rtt_ms ?? undefined;
}
let lastQuestionBroadcast = '';
function broadcast() {
  const s = engine.state;
  if (
    ['RUNNING', 'TIE_RUNNING'].includes(s.phase) &&
    !s.paused &&
    (engine.round.stage !== 1 || s.tieQuestion)
  ) {
    const q = engine.question(s.tieQuestion ?? s.set[s.index]);
    const key = `${s.roundKey}:${q?.id}:${s.startedAt}`;
    if (q && key !== lastQuestionBroadcast) {
      lastQuestionBroadcast = key;
      const encoded = JSON.stringify({
        v: 1,
        type: 'question.show',
        payload: {
          roundQuestionId: q.id,
          body: q.body,
          type: q.type,
          options: q.options,
          endsAt: s.endsAt,
        },
      });
      for (const [ws, c] of clients) {
        refreshActor(c);
        if (
          c.authenticated &&
          c.actor.role === 'team' &&
          c.actor.teamId &&
          (s.tieQuestion ? s.tieIds : engine.round.teamIds).includes(c.actor.teamId) &&
          ws.readyState === WebSocket.OPEN
        )
          ws.send(encoded);
      }
    }
  }
  for (const [ws, c] of clients)
    if (c.authenticated) {
      refreshActor(c);
      send(ws, 'state.snapshot', engine.snapshot(c.actor));
    }
}
const helloSchema = z.object({
  role: z.enum(['admin', 'display', 'team']),
  deviceId: z.string().min(8).max(100),
  deviceToken: z.string().max(100).optional(),
  pin: z.string().max(100).optional(),
});
app.server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});
wss.on('connection', (ws, req) => {
  const ip = req.socket.remoteAddress || 'unknown';
  const c: Client = {
    actor: { role: 'display', deviceId: '' },
    alive: true,
    authenticated: false,
    windowAt: Date.now(),
    count: 0,
    connectedAt: Date.now(),
    lastPing: 0,
  };
  clients.set(ws, c);
  ws.on('pong', () => {
    c.alive = true;
    const rtt = Date.now() - c.lastPing;
    if (c.authenticated)
      db.prepare('UPDATE devices SET last_seen_at=?,rtt_ms=? WHERE id=?').run(
        Date.now(),
        rtt,
        c.actor.deviceId,
      );
  });
  ws.on('message', (raw) => {
    let messageId: string | undefined;
    try {
      if (Date.now() - c.windowAt > 1000) {
        c.windowAt = Date.now();
        c.count = 0;
      }
      if (++c.count > 100) throw new Error('Rate limit exceeded');
      const message = envelope.parse(JSON.parse(raw.toString()));
      messageId = message.cmdId;
      if (message.type === 'hello') {
        if (c.authenticated) throw new Error('Already authenticated');
        const p = helloSchema.parse(message.payload);
        const key = `hello:${ip}`;
        const a = attempts.get(key) ?? { count: 0, lockedUntil: 0 };
        if (a.lockedUntil > Date.now()) throw new Error('Authentication locked for 10 seconds');
        if (
          p.role === 'admin' &&
          (!p.pin || !timingSafeEqual(Buffer.from(hash(p.pin)), Buffer.from(hash(pin!))))
        ) {
          a.count++;
          if (a.count >= 5) {
            a.lockedUntil = Date.now() + 10000;
            a.count = 0;
          }
          attempts.set(key, a);
          throw new Error('Invalid admin PIN');
        }
        const row = db.prepare('SELECT * FROM devices WHERE id=?').get(p.deviceId) as any;
        if (
          row &&
          (!p.deviceToken || hash(p.deviceToken) !== row.token_hash || row.role !== p.role)
        )
          throw new Error('Invalid device token; reset this browser identity');
        if (
          [...clients.values()].some(
            (other) => other !== c && other.authenticated && other.actor.deviceId === p.deviceId,
          )
        )
          throw new Error('This device is already connected in another tab');
        const token = p.deviceToken ?? randomBytes(32).toString('hex');
        db.prepare(
          'INSERT INTO devices(id,role,token_hash,last_seen_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET last_seen_at=excluded.last_seen_at',
        ).run(p.deviceId, p.role, hash(token), Date.now());
        c.actor = { role: p.role as Role, deviceId: p.deviceId, teamId: row?.team_id ?? undefined };
        c.authenticated = true;
        attempts.delete(key);
        send(ws, 'hello.ok', { deviceToken: token });
        send(ws, 'state.snapshot', engine.snapshot(c.actor));
        broadcast();
        return;
      }
      if (!c.authenticated) throw new Error('Send hello first');
      refreshActor(c);
      if (message.type === 'time.ping') {
        const p = z.object({ c0: z.number() }).parse(message.payload);
        send(ws, 'time.pong', { c0: p.c0, s1: Date.now() });
        return;
      }
      if (!message.cmdId) throw new Error('Command requires cmdId');
      if (message.type === 'team.checkin') {
        const key = `checkin:${c.actor.deviceId}`,
          a = attempts.get(key) ?? { count: 0, lockedUntil: 0 };
        if (a.lockedUntil > Date.now()) throw new Error('Check-in locked for 10 seconds');
        try {
          engine.dispatch(message.type, message.payload, c.actor, message.cmdId);
          attempts.delete(key);
        } catch (e) {
          a.count++;
          if (a.count >= 5) {
            a.count = 0;
            a.lockedUntil = Date.now() + 10000;
          }
          attempts.set(key, a);
          throw e;
        }
      } else engine.dispatch(message.type, message.payload, c.actor, message.cmdId);
      send(ws, 'command.ack', { cmdId: message.cmdId, accepted: true });
      broadcast();
    } catch (e) {
      send(ws, 'error', {
        cmdId: messageId,
        message: e instanceof Error ? e.message : 'Invalid command',
      });
    }
  });
  ws.on('close', () => {
    clients.delete(ws);
    if (c.authenticated)
      db.prepare('UPDATE devices SET last_seen_at=0 WHERE id=?').run(c.actor.deviceId);
    broadcast();
  });
  ws.on('error', () => {});
});
const heartbeat = setInterval(() => {
  for (const [ws, c] of clients) {
    if (!c.authenticated && Date.now() - c.connectedAt > 10000) {
      ws.terminate();
      continue;
    }
    if (!c.alive) {
      ws.terminate();
      continue;
    }
    c.alive = false;
    c.lastPing = Date.now();
    ws.ping();
  }
  // Fresh snapshots keep device online/RTT indicators truthful even when nothing else is happening.
  broadcast();
}, 2000);
const ticker = setInterval(() => {
  if (engine.state.paused) return;
  const s = engine.state;
  if (['COUNTDOWN', 'RUNNING', 'TIE_RUNNING'].includes(s.phase) || s.autoAt) {
    try {
      engine.dispatch('system.tick', {}, { role: 'system', deviceId: 'timer' });
      broadcast();
    } catch (e) {
      engine.dispatch('auto.cancel', {}, { role: 'system', deviceId: 'timer' });
      broadcast();
      for (const [ws, c] of clients)
        if (c.actor.role === 'admin') send(ws, 'error', { message: String(e) });
    }
  }
}, 250);
function authorized(request: { headers: Record<string, unknown> }) {
  const auth = request.headers.authorization;
  const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return (
    !!token &&
    !!db.prepare("SELECT id FROM devices WHERE role='admin' AND token_hash=?").get(hash(token))
  );
}
app.get('/health', async () => ({
  ok: true,
  version: engine.state.version,
  phase: engine.state.phase,
  paused: engine.state.paused,
}));
app.get('/logo/:id', async (req, reply) => {
  const row = engine.logo(Number((req.params as { id: string }).id));
  if (!row?.logo || !row.logo_mime) return reply.code(404).send({ error: 'No logo' });
  reply.header('Content-Type', row.logo_mime);
  reply.header('Cache-Control', 'public, max-age=31536000, immutable');
  return reply.send(row.logo);
});
app.addHook('onRequest', async (req, reply) => {
  if (req.url.startsWith('/api/') && !authorized(req))
    return reply.code(401).send({ error: 'Admin authentication required' });
});
app.post('/api/command', async (req, reply) => {
  try {
    const m = envelope.parse({ v: 1, ...(req.body as object) });
    if (!m.cmdId) throw new Error('Command requires cmdId');
    const token = String(req.headers.authorization).slice(7);
    const d = db
      .prepare("SELECT id FROM devices WHERE role='admin' AND token_hash=?")
      .get(hash(token)) as { id: string };
    const result = engine.dispatch(m.type, m.payload, { role: 'admin', deviceId: d.id }, m.cmdId);
    broadcast();
    return result;
  } catch (e) {
    return reply.code(400).send({ error: e instanceof Error ? e.message : 'Invalid command' });
  }
});
app.get('/api/network', async () => ({
  port,
  addresses: Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((a) => a.family === 'IPv4' && !a.internal)
    .map((a) => a.address),
}));
app.get('/api/export', async () => ({
  state: engine.state,
  teams: engine.teams(),
  questions: engine.questions(),
  scores: db.prepare('SELECT * FROM v_team_round_scores').all(),
  answers: db.prepare('SELECT * FROM answers').all(),
  ledger: db.prepare('SELECT * FROM score_events').all(),
  audit: db.prepare('SELECT * FROM event_log').all(),
}));
app.get('/api/results.csv', async (_, reply) => {
  const rows = db
    .prepare(
      'SELECT s.round_key,t.name,s.score FROM v_team_round_scores s JOIN teams t ON t.id=s.team_id ORDER BY s.round_key,s.score DESC',
    )
    .all() as any[];
  const csv = (s: unknown) => '"' + String(s).replaceAll('"', '""') + '"';
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  return (
    '\ufeffround,team,score\n' +
    rows.map((r) => [r.round_key, r.name, r.score].map(csv).join(',')).join('\n')
  );
});
app.get('/api/audit.csv', async (_, reply) => {
  const rows = db
    .prepare('SELECT id,at_wall_ms,actor,type,payload_json FROM event_log ORDER BY id')
    .all() as any[];
  const csv = (v: unknown) => '"' + String(v).replaceAll('"', '""') + '"';
  reply.header('Content-Type', 'text/csv; charset=utf-8');
  return (
    '\ufeffid,time,actor,event,details\n' +
    rows
      .map((r) =>
        [r.id, new Date(r.at_wall_ms).toISOString(), r.actor, r.type, r.payload_json]
          .map(csv)
          .join(','),
      )
      .join('\n')
  );
});
const backupDir = resolve(process.env.BACKUP_DIR || 'backups');
let backingUp = false;
async function backup() {
  if (backingUp) return;
  backingUp = true;
  try {
    mkdirSync(backupDir, { recursive: true });
    const path = resolve(backupDir, `ashour-${Date.now()}.sqlite`);
    await db.backup(path);
    const paths = readdirSync(backupDir)
      .filter((p) => /^ashour-\d+\.sqlite$/.test(p))
      .sort();
    for (const p of paths.slice(0, -20)) unlinkSync(resolve(backupDir, p));
    return path;
  } finally {
    backingUp = false;
  }
}
app.get('/api/backup', async (_, reply) => {
  const p = await backup();
  if (!p) return reply.code(409).send({ error: 'Backup in progress; retry' });
  reply.header('Content-Disposition', 'attachment; filename="ashour-backup.sqlite"');
  reply.header('Content-Type', 'application/octet-stream');
  return reply.sendFile(basename(p), backupDir);
});
let backupVersion = engine.state.phase;
const backupTimer = setInterval(() => {
  void backup().catch((e) => console.error('Backup failed:', e.message));
}, 30000);
const transitionBackup = setInterval(() => {
  if (backupVersion !== engine.state.phase) {
    backupVersion = engine.state.phase;
    void backup().catch((e) => console.error('Backup failed:', e.message));
  }
}, 500);
const dist = resolve('packages/web/dist');
mkdirSync(backupDir, { recursive: true });
if (existsSync(dist)) {
  await app.register(staticPlugin, { root: dist });
  app.setNotFoundHandler((req, reply) => {
    if (['/', '/play', '/admin', '/display'].includes(req.url.split('?')[0]))
      return reply.sendFile('index.html');
    return reply.code(404).send({ error: 'Not found' });
  });
} else {
  await app.register(staticPlugin, { root: backupDir, serve: false });
  app.get('/', async () => ({
    message: 'Build frontend with pnpm build, or use Vite on port 5173 for development.',
  }));
}
await app.listen({ port, host });
console.log(`Ashour LAN server: http://localhost:${port}/admin`);
const lanAddresses = Object.values(networkInterfaces())
  .flatMap((entries) => entries ?? [])
  .filter((a) => a.family === 'IPv4' && !a.internal)
  .map((a) => a.address);
for (const address of lanAddresses)
  console.log(`LAN: http://${address}:${port}/play · /display · /admin`);
if (lanAddresses[0]) {
  const url = `http://${lanAddresses[0]}:${port}/play`;
  console.log(`\nTeam device QR (${url}):`);
  console.log(await QRCode.toString(url, { type: 'terminal', small: true }));
}
async function shutdown() {
  clearInterval(heartbeat);
  clearInterval(ticker);
  clearInterval(backupTimer);
  clearInterval(transitionBackup);
  for (const ws of clients.keys()) ws.terminate();
  await app.close();
  db.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
