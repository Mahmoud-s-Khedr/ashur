/**
 * Visual tour: boots a throw-away server, plays the tournament with WebSocket bots and
 * saves screenshots of the projector, a team device and the admin console at key moments.
 *
 *   pnpm build && pnpm tour            # screenshots land in ./tour-shots
 *   TOUR_ONLY=stage1 pnpm tour         # stop after Stage 1
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import WebSocket from 'ws';

const PORT = Number(process.env.TOUR_PORT || 3201);
const PIN = 'tour-demo-pin';
const OUT = resolve(process.env.TOUR_OUT || 'tour-shots');
mkdirSync(OUT, { recursive: true });
const LANG = process.env.TOUR_LANG === 'en' ? 'en' : 'ar';
const Q = LANG === 'en' ? '?lang=en' : '';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let n = 0;

class Client {
  ws!: WebSocket;
  snap: any = null;
  token = '';
  constructor(
    public role: 'admin' | 'team' | 'display',
    public id: string,
  ) {}
  async connect() {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await new Promise<void>((ok, bad) => {
      this.ws.on('open', () => {
        this.ws.send(
          JSON.stringify({
            v: 1,
            type: 'hello',
            payload: {
              role: this.role,
              deviceId: this.id,
              ...(this.role === 'admin' ? { pin: PIN } : {}),
            },
          }),
        );
      });
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        if (m.type === 'hello.ok') this.token = m.payload.deviceToken;
        if (m.type === 'state.snapshot') {
          const first = !this.snap;
          this.snap = m.payload;
          if (first) ok();
        }
        if (m.type === 'error') this.lastError = m.payload.message;
      });
      this.ws.on('error', bad);
    });
  }
  lastError = '';
  async cmd(type: string, payload: object = {}) {
    this.lastError = '';
    const before = this.snap?.version;
    this.ws.send(JSON.stringify({ v: 1, type, cmdId: `${Math.random()}`.slice(2), payload }));
    for (let i = 0; i < 80; i++) {
      await sleep(25);
      if (this.lastError) throw new Error(`${type}: ${this.lastError}`);
      if (this.snap?.version !== before) return;
    }
  }
  async until(pred: (s: any) => boolean, ms = 8000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (this.snap && pred(this.snap)) return this.snap;
      await sleep(30);
    }
    throw new Error(
      `timeout waiting; phase=${this.snap?.phase} cards=${JSON.stringify(this.snap?.lineup?.map((l: any) => l.card))} q=${this.snap?.index}`,
    );
  }
}

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'ashour-tour-'));
  const server: ChildProcess = spawn('pnpm', ['exec', 'tsx', 'packages/server/src/index.ts'], {
    env: {
      ...process.env,
      ADMIN_PIN: PIN,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DB_PATH: join(dir, 't.sqlite'),
      BACKUP_DIR: join(dir, 'b'),
    },
    stdio: 'ignore',
  });
  try {
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${PORT}/health`)).ok) break;
      } catch {
        await sleep(250);
      }
    }
    await run();
  } finally {
    server.kill('SIGTERM');
  }
}

async function run() {
  const admin = new Client('admin', 'tour-admin-device');
  await admin.connect();
  const AUTO = process.env.TOUR_AUTO === '1';
  await admin.cmd('settings.update', {
    settings: { automation: AUTO ? 'auto' : 'manual', countdownMs: 3000, autoDelayMs: 4000 },
  });
  const bots = [1, 2, 3, 4].map((i) => new Client('team', `tour-bot-device-${i}`));
  await Promise.all(bots.map((b) => b.connect()));
  const executablePath =
    process.env.CHROMIUM_PATH ||
    ['/usr/bin/chromium', '/opt/pw-browsers/chromium'].find((p) => existsSync(p));
  const browser = await chromium.launch({
    args: ['--no-sandbox'],
    ...(executablePath ? { executablePath } : {}),
  });
  const shot = async (page: Page, name: string, wait = 700) => {
    await sleep(wait);
    await page.screenshot({ path: join(OUT, `${String(++n).padStart(2, '0')}-${name}.png`) });
  };
  const dctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const display = await dctx.newPage();
  await display.goto(`http://127.0.0.1:${PORT}/display${Q}`);
  const pctx = await browser.newContext({ viewport: { width: 420, height: 860 }, hasTouch: true });
  const player = await pctx.newPage();
  await player.goto(`http://127.0.0.1:${PORT}/play${Q}`);
  const actx = await browser.newContext({ viewport: { width: 1500, height: 950 } });
  const adminPage = await actx.newPage();
  await adminPage.goto(`http://127.0.0.1:${PORT}/admin${Q}`);
  await adminPage.getByLabel(LANG === 'en' ? 'Admin PIN' : 'رمز الإدارة').fill(PIN);
  await adminPage
    .getByRole('button', { name: LANG === 'en' ? 'Connect' : 'اتصال', exact: true })
    .click();
  await adminPage.waitForSelector('.round-hero');
  await shot(display, 'display-intro', 1800);
  await shot(player, 'player-code');
  await shot(adminPage, 'admin-idle');
  const nav = adminPage.locator('aside nav button');
  for (const [tab, index] of [
    ['bracket', 1],
    ['teams', 2],
    ['questions', 3],
    ['setup', 4],
    ['settings', 6],
  ] as const) {
    await nav.nth(index).click();
    await shot(adminPage, `admin-${tab}`, 600);
  }
  await nav.nth(0).click();

  // ---- Stage 1, round 1 ----
  const snap = () => admin.snap;
  const lineup = snap().lineup.map((l: any) => l.id);
  const codes = (await Promise.resolve(snap().teams))
    .filter((x: any) => lineup.includes(x.id))
    .map((x: any) => x.code);
  await admin.cmd('round.showRules');
  await shot(display, 'display-rules-blitz', 2600);
  await admin.cmd('lineup.announce');
  await shot(display, 'display-lobby-empty', 1800);
  // real player page types team-1's code
  for (const d of codes[0])
    await player
      .locator('.keypad button', { hasText: new RegExp(`^${d}$`) })
      .first()
      .click();
  await shot(player, 'player-code-typed', 200);
  await player
    .getByRole('button', { name: LANG === 'en' ? /Join the competition/ : /دخول المسابقة/ })
    .click();
  await shot(player, 'player-welcome', 700);
  await bots[1].cmd('team.checkin', { code: codes[1] });
  await shot(display, 'display-lobby-partial', 1000);
  await bots[2].cmd('team.checkin', { code: codes[2] });
  await bots[3].cmd('team.checkin', { code: codes[3] });
  await sleep(3000);
  await shot(player, 'player-ready', 200);
  await player.locator('.ready-orb').click({ force: true });
  await bots[1].cmd('team.ready');
  await shot(display, 'display-lobby-ready', 900);
  await bots[2].cmd('team.ready');
  await bots[3].cmd('team.ready');
  await shot(display, 'display-lobby-all-ready', 900);
  await shot(adminPage, 'admin-ready', 200);
  if (!AUTO) await admin.cmd('round.start');
  await shot(display, 'display-countdown', AUTO ? 5200 : 1200);
  await shot(player, 'player-countdown', 100);
  await admin.until((s) => s.phase === 'RUNNING', 6000);
  await sleep(300);
  // bots answer with different skill / speed
  // deterministic mistakes so every run tells the same story
  const TIE = process.env.TOUR_SCENARIO === 'tie';
  const wrongAt = TIE ? [[], [], [], []] : [[], [2, 6], [1, 3, 5, 8], [0, 2, 3, 4, 6, 7, 9]];
  const speed = [650, 800, 950, 1300];
  const playing = bots.map(async (bot, i) => {
    for (let q = 0; q < 10; q++) {
      const s = await bot.until((x) => x.ownProgress === q && !!x.question, 4000).catch(() => null);
      if (!s?.question) return;
      await sleep(speed[i]);
      const right = wrongAt[i].includes(q) ? 1 : 0;
      await bot
        .cmd('answer.submit', { roundQuestionId: s.question.id, answer: right })
        .catch(() => {});
    }
  });
  // player page answers a few questions by clicking
  await player.waitForSelector('.options .opt');
  await shot(player, 'player-question', 300);
  for (let i = 0; i < 3; i++) {
    await player.locator('.opt').first().click();
    await sleep(900);
    if (i === 1) await shot(player, 'player-question-3', 100);
  }
  await shot(display, 'display-race-mid', 1500);
  await shot(adminPage, 'admin-running', 100);
  await Promise.all(playing);
  // finish player page questions
  for (let i = 0; i < 12 && admin.snap.lineup[0].progress < 10; i++) {
    await player
      .locator('.opt')
      .first()
      .click({ timeout: 2000 })
      .catch(() => {});
    await sleep(450);
  }
  await shot(display, 'display-race-end', 1200);
  await shot(player, 'player-finished', 100);
  await admin.until((s) => ['REVIEW', 'RESULTS'].includes(s.phase), 6000);
  if (TIE) {
    // Everyone answered everything correctly in the same bonus tier: a four-way tie for first.
    await admin.until((x) => x.phase === 'REVIEW' && x.tieIds.length > 1, 4000);
    await shot(display, 'display-tie', 2200);
    await shot(adminPage, 'admin-tie', 200);
    await admin.cmd('tiebreak.open');
    await shot(display, 'display-tie-lobby', 1200);
    await player.locator('.ready-orb').click({ force: true });
    for (const b of bots.slice(1)) await b.cmd('team.ready');
    await shot(display, 'display-tie-lobby-ready', 900);
    await shot(adminPage, 'admin-tie-ready', 100);
    await admin.cmd('tiebreak.launch');
    await shot(display, 'display-tie-duel', 1500);
    await player.waitForSelector('.text-answer textarea');
    await shot(player, 'player-tie-question', 200);
    await player.locator('textarea').fill('2');
    await player.getByRole('button', { name: /إرسال|Submit/ }).click();
    for (const [i, b] of bots.slice(1).entries()) {
      await sleep(300 + i * 250);
      const q = (await b.until((x) => !!x.question && !x.submitted, 3000)).question;
      await b.cmd('answer.submit', { roundQuestionId: q.id, answer: '2' });
    }
    await admin.until((x) => x.phase === 'TIE_REVIEW', 4000);
    await shot(display, 'display-tie-judging', 1200);
    await shot(adminPage, 'admin-tie-grading', 200);
    for (const a of admin.snap.answers.filter((a: any) => a.verdict === 'pending'))
      await admin.cmd('grade.set', { answerId: a.id, verdict: 'correct' });
    await admin.cmd('question.reveal');
    await admin.until((x) => x.phase === 'RESULTS', 4000);
    await shot(display, 'display-tie-winner', 2500);
    await browser.close();
    return;
  }
  await shot(display, 'display-results-blitz', 2500);
  await shot(player, 'player-results', 100);
  await shot(adminPage, 'admin-results', 100);
  await admin.cmd('display.scene', { scene: 'bracket' });
  await shot(display, 'display-bracket', 900);
  await admin.cmd('display.scene', { scene: 'leaderboard' });
  await shot(display, 'display-leaderboard', 900);
  await admin.cmd('display.scene', { scene: 'auto' });
  if (process.env.TOUR_ONLY === 'stage1') return void (await browser.close());

  // ---- finish remaining Stage 1 rounds quickly ----
  const fast = async () => {
    await admin.cmd('settings.update', { settings: { countdownMs: 1000 } }).catch(() => {});
  };
  await fast();
  for (let r = 2; r <= 12; r++) {
    await admin.cmd('round.next');
    await admin.cmd('lineup.announce');
    const ls = admin.snap.lineup.map((l: any) => l.id);
    const cs = admin.snap.teams.filter((x: any) => ls.includes(x.id)).map((x: any) => x.code);
    for (const [i, b] of bots.entries()) {
      await b.cmd('team.checkout').catch(() => {});
      await b.cmd('team.checkin', { code: cs[i] });
      await b.cmd('team.ready');
    }
    await admin.cmd('round.start');
    await admin.until((s) => s.phase === 'RUNNING', 5000);
    for (let q = 0; q < 10; q++)
      await Promise.all(
        bots.map(async (b, i) => {
          const s = await b.until((x) => x.ownProgress === q && !!x.question, 3000);
          await b.cmd('answer.submit', { roundQuestionId: s.question.id, answer: i === 0 ? 0 : 1 });
        }),
      );
    await admin.until((s) => s.phase === 'RESULTS', 5000);
  }
  await admin.cmd('display.scene', { scene: 'bracket' });
  await shot(display, 'display-bracket-stage1-done', 900);
  await admin.cmd('display.scene', { scene: 'auto' });
  await shot(adminPage, 'admin-bracket-draw', 100);

  // ---- helpers for stages 2 & 3 ----
  const lineupCodes = () => {
    const ids = admin.snap.lineup.map((l: any) => l.id);
    return ids.map((id: number) => admin.snap.teams.find((x: any) => x.id === id).code);
  };
  const seatBots = async (usePlayerPage: boolean) => {
    const cs = lineupCodes();
    const n = cs.length;
    for (const [i, b] of bots.entries()) {
      await b.cmd('team.checkout').catch(() => {});
      if (i >= n) continue;
      if (i === 0 && usePlayerPage) {
        await player.reload();
        for (const d of cs[0])
          await player
            .locator('.keypad button', { hasText: new RegExp(`^${d}$`) })
            .first()
            .click();
        await player
          .getByRole('button', { name: LANG === 'en' ? /Join the competition/ : /دخول المسابقة/ })
          .click();
        await sleep(3000);
        await player.locator('.ready-orb').click({ force: true });
      } else {
        await b.cmd('team.checkin', { code: cs[i] });
        await b.cmd('team.ready');
      }
    }
  };
  const botAnswer = async (b: Client, right: boolean) => {
    const s = await b.until((x) => !!x.question && !x.submitted, 4000);
    const q = s.question;
    await b.cmd('answer.submit', {
      roundQuestionId: q.id,
      answer: q.type === 'mcq' ? (right ? 0 : 1) : right ? 'ok' : 'x',
    });
  };
  const playerAnswer = async () => {
    await player.waitForSelector('.options .opt, .text-answer textarea', { timeout: 4000 });
    if (await player.locator('.opt').count())
      await player.locator('.opt').first().click({ force: true });
    else {
      await player.locator('textarea').fill('ok');
      await player.getByRole('button', { name: /إرسال/ }).click();
    }
  };
  const gradeAll = async (correctIdx: number[]) => {
    const order = admin.snap.lineup.map((l: any) => l.id);
    for (const a of admin.snap.answers.filter((a: any) => a.verdict === 'pending'))
      await admin.cmd('grade.set', {
        answerId: a.id,
        verdict: correctIdx.includes(order.indexOf(a.teamId)) ? 'correct' : 'wrong',
      });
  };

  // ---- Stage 2 group 1 (full detail) ----
  const stage2 = async (group: number, detailed: boolean) => {
    await admin.cmd('round.next');
    if (detailed) {
      await admin.cmd('round.showRules');
      await shot(display, 'display-rules-gambler', 2600);
    }
    await admin.cmd('lineup.announce');
    await seatBots(detailed);
    if (detailed) await shot(display, 'display-lobby-gambler', 800);
    await admin.cmd('round.start');
    await admin.until((s) => s.phase === 'WHEEL', 6000);
    for (let q = 0; q < 8; q++) {
      const det = detailed && q === 0;
      if (det) await shot(display, 'display-wheel-idle', 1200);
      await admin.cmd('wheel.spin');
      if (det) {
        await shot(display, 'display-wheel-spinning', 1500);
        await shot(player, 'player-wheel', 100);
        await shot(display, 'display-wheel-landed', 3600);
      }
      const cards = [15, 10, 5, 10];
      if (detailed) {
        // The cards only appear once the reel has stopped (team screens hold the category back).
        await player.locator('.wager-pick').first().waitFor({ timeout: 12000 });
        await sleep(det ? 200 : 900); // let the flip-in finish
        await player
          .locator('.wager-pick')
          .nth(2)
          .click({ force: true })
          .catch(() => {});
        if (det) await shot(player, 'player-cards', 200);
      }
      for (const [i, b] of bots.entries()) {
        if (i >= admin.snap.lineup.length || (i === 0 && detailed)) continue;
        await b.cmd('card.select', { value: cards[i] });
      }
      await admin.until((s) => s.lineup.every((l: any) => l.card !== null), 4000);
      if (det) await shot(adminPage, 'admin-gambler-cards', 100);
      await admin.cmd('question.start');
      if (det) await shot(display, 'display-gambler-teamtime', 1200);
      for (const [i, b] of bots.entries()) if (!(i === 0 && detailed)) await botAnswer(b, i === 1);
      if (detailed) {
        if (det) await shot(player, 'player-gambler-question', 100);
        await playerAnswer();
      }
      await admin.until((s) => s.phase === 'AUDIENCE', 5000);
      await gradeAll([1]);
      if (det) await shot(display, 'display-gambler-audience', 1500);
      await admin.cmd('question.reveal');
      if (det) {
        await shot(display, 'display-gambler-reveal', 1800);
        await shot(adminPage, 'admin-gambler-reveal', 100);
      }
      if (q === 4 && detailed) await shot(display, 'display-gambler-mid', 2200);
      if (q < 7) await admin.cmd('question.next');
    }
    await admin.until((s) => s.phase === 'RESULTS', 4000);
    if (detailed) await shot(display, 'display-results-gambler', 2500);
  };
  await stage2(1, true);
  await stage2(2, false);
  await stage2(3, false);
  await admin.cmd('display.scene', { scene: 'bracket' });
  await shot(display, 'display-bracket-stage2-done', 900);
  await admin.cmd('display.scene', { scene: 'auto' });
  if (process.env.TOUR_ONLY === 'stage2') return void (await browser.close());

  // ---- Stage 3 final ----
  await admin.cmd('round.next');
  await admin.cmd('round.showRules');
  await shot(display, 'display-rules-climb', 2600);
  await admin.cmd('lineup.announce');
  await seatBots(true);
  await shot(display, 'display-lobby-final', 900);
  await admin.cmd('round.start');
  await admin.until((s) => s.phase === 'RUNNING', 6000);
  await shot(display, 'display-ladder-start', 1500);
  for (let q = 0; q < 15; q++) {
    await admin.until((s) => s.phase === 'RUNNING', 6000);
    const mid = q === 3 || q === 6;
    await Promise.all([
      botAnswer(bots[1], q % 2 === 0),
      botAnswer(bots[2], false),
      (async () => {
        await playerAnswer();
      })(),
    ]);
    await admin.until((s) => s.phase === 'AUDIENCE', 6000);
    await gradeAll([0, ...(q % 2 === 0 ? [1] : [])]);
    if (q === 0) await shot(display, 'display-ladder-audience', 1500);
    await admin.cmd('question.reveal');
    if (q === 0) await shot(display, 'display-ladder-reveal', 2200);
    if (mid) await shot(display, `display-ladder-q${q + 1}`, 2000);
    if (admin.snap.phase === 'RESULTS') break;
    await admin.cmd('question.next');
  }
  await admin.until((s) => s.phase === 'RESULTS', 4000);
  await shot(display, 'display-champion-early', 700);
  await shot(display, 'display-champion', 4500);
  await shot(player, 'player-champion', 100);
  await shot(adminPage, 'admin-champion', 100);
  await admin.cmd('display.scene', { scene: 'bracket' });
  await shot(display, 'display-bracket-final', 900);
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
