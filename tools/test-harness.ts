import type { Page } from '@playwright/test';
/** Real-server end-to-end checks. Every scenario owns a disposable database and port. */
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

export const output = resolve(process.env.E2E_OUT || mkdtempSync(join(tmpdir(), 'ashour-e2e-')));
mkdirSync(output, { recursive: true });
export const results: { scenario: string; status: string; durationMs: number; detail?: string }[] =
  [];
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function until(
  test: () => unknown | Promise<unknown>,
  label: string,
  timeout = 15000,
) {
  const end = Date.now() + timeout;
  while (!(await test())) {
    if (Date.now() > end) throw new Error(`Timeout: ${label}`);
    await sleep(20);
  }
}

export class Server {
  evidence = output;
  constructor(public bank = 'demo') {}
  dir = mkdtempSync(join(tmpdir(), 'ashour-e2e-db-'));
  pin = randomUUID();
  port = 0;
  process?: ChildProcess;
  log = '';
  clients: Client[] = [];
  get url() {
    return `http://127.0.0.1:${this.port}`;
  }
  async start(dbPath = join(this.dir, 'test.sqlite'), supervised = false) {
    if (!this.port)
      this.port = await new Promise<number>((r) => {
        const s = createServer();
        s.listen(0, '127.0.0.1', () => {
          const port = (s.address() as { port: number }).port;
          s.close(() => r(port));
        });
      });
    this.process = spawn(
      process.execPath,
      supervised ? ['tools/supervise.mjs'] : ['--import', 'tsx', 'packages/server/src/index.ts'],
      {
        env: {
          ...process.env,
          QUESTION_BANK: this.bank,
          HOST: '127.0.0.1',
          PORT: String(this.port),
          ADMIN_PIN: this.pin,
          DB_PATH: dbPath,
          BACKUP_DIR: join(this.dir, 'backups'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    for (const stream of [this.process.stdout, this.process.stderr])
      stream?.on('data', (data) => (this.log += String(data)));
    await until(async () => {
      if (this.process?.exitCode !== null) throw new Error(this.log);
      return fetch(this.url + '/health')
        .then((r) => r.ok)
        .catch(() => false);
    }, 'server boot');
  }
  async stop(signal: NodeJS.Signals = 'SIGTERM') {
    for (const c of this.clients) c.ws?.terminate();
    if (this.process && this.process.exitCode === null && this.process.signalCode === null) {
      this.process.kill(signal);
      await until(
        () => this.process?.exitCode !== null || this.process?.signalCode !== null,
        'server stop',
      );
    }
  }
  async client(role: 'admin' | 'team' | 'display') {
    const c = new Client(this, role);
    this.clients.push(c);
    await c.connect();
    return c;
  }
}
export class Client {
  id = randomUUID();
  token?: string;
  s: any;
  ws!: WebSocket;
  pending = new Map<
    string,
    { acknowledged: boolean; resolve: () => void; reject: (e: Error) => void }
  >();
  constructor(
    public server: Server,
    public role: 'admin' | 'team' | 'display',
  ) {}
  async connect() {
    this.s = undefined;
    this.ws = new WebSocket(this.server.url.replace('http', 'ws') + '/ws');
    this.ws.on('error', () => {});
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Authentication timeout')), 5000);
      this.ws.on('open', () =>
        this.ws.send(
          JSON.stringify({
            v: 1,
            type: 'hello',
            payload: {
              role: this.role,
              deviceId: this.id,
              deviceToken: this.token,
              ...(this.role === 'admin' ? { pin: this.server.pin } : {}),
            },
          }),
        ),
      );
      this.ws.on('message', (raw) => {
        const m = JSON.parse(String(raw));
        if (m.type === 'hello.ok') this.token = m.payload.deviceToken;
        if (m.type === 'state.snapshot') {
          this.s = m.payload;
          clearTimeout(timer);
          resolve();
          for (const [id, p] of this.pending)
            if (p.acknowledged) {
              this.pending.delete(id);
              p.resolve();
            }
        }
        if (m.type === 'command.ack') {
          const p = this.pending.get(m.payload.cmdId);
          if (p) p.acknowledged = true;
        }
        if (m.type === 'error') {
          const p = this.pending.get(m.payload.cmdId);
          if (p) {
            this.pending.delete(m.payload.cmdId);
            p.reject(new Error(m.payload.message));
          } else if (!this.s) {
            clearTimeout(timer);
            reject(new Error(m.payload.message));
          }
        }
      });
    });
  }
  page?: Page;
  // Transfer one authenticated device to the real competitor UI, keeping four seats total.
  async attachPage(page: Page, lang: string) {
    const receive = this.ws.listeners('message')[0];
    this.ws.terminate();
    await until(() => this.ws.readyState === WebSocket.CLOSED, 'device handoff');
    this.page = page;
    await page.addInitScript(
      ({ id, token }) => {
        localStorage.setItem('ashour-team-id', id);
        localStorage.setItem('ashour-team-token', token!);
        const Native = window.WebSocket;
        window.WebSocket = class extends Native {
          constructor(url: string | URL, protocols?: string | string[]) {
            super(url, protocols);
            (window as any).__auditSocket = this;
          }
        };
      },
      { id: this.id, token: this.token },
    );
    page.on('websocket', (socket) =>
      socket.on('framereceived', (frame) => receive.call(this.ws, frame.payload)),
    );
    this.s = undefined;
    await page.goto(this.server.url + '/play?lang=' + lang + '&fx=low');
    await until(() => !!this.s, 'browser device handoff snapshot');
  }
  async cmd(type: string, payload: object = {}, cmdId = randomUUID()) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(cmdId);
        reject(new Error(`Command timeout: ${type}`));
      }, 8000);
      this.pending.set(cmdId, {
        acknowledged: false,
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      const raw = JSON.stringify({ v: 1, type, cmdId, payload });
      if (this.page)
        void this.page
          .evaluate((raw) => (window as any).__auditSocket.send(raw), raw)
          .catch(reject);
      else this.ws.send(raw);
    });
  }
  async bulk(type: string, payload: object, ok = true) {
    const r = await fetch(this.server.url + '/api/command', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, payload, cmdId: randomUUID() }),
    });
    const body = await r.json();
    assert.equal(r.ok, ok, JSON.stringify(body));
    return body;
  }
  async export() {
    return fetch(this.server.url + '/api/export', {
      headers: { Authorization: `Bearer ${this.token}` },
    }).then((r) => r.json());
  }
}
