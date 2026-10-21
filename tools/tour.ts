/** Complete, state-driven visual rehearsals; all data is disposable. */
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import { Server, Client, until } from './test-harness';
import { tournament, begin, answer } from './tournament';

const out = resolve(process.env.TOUR_OUT || 'tour-shots');
mkdirSync(out, { recursive: true });
const lang = process.env.TOUR_LANG === 'en' ? 'en' : 'ar';
const auto = process.env.TOUR_AUTO === '1';
const tie = process.env.TOUR_SCENARIO === 'tie';
const s = new Server(process.env.TOUR_BANK || 'demo');
const uiHasStrip = (event: string, stage: number) =>
  ['audience', 'reveal'].includes(event) && stage > 1;
s.evidence = out;
let browser: Browser | undefined;
const pages: { role: string; page: Page; state?: any }[] = [];
const captures: any[] = [];
const errors: string[] = [];
let serial = 0;
let status = 'failed';
let detail = '';
let current: Client | undefined;
try {
  assert(
    !process.env.TOUR_ONLY,
    'Partial TOUR_ONLY runs are unsupported; a full tour must reach champion',
  );
  await s.start();
  const executablePath =
    process.env.CHROMIUM_PATH ||
    ['/usr/bin/chromium', '/opt/pw-browsers/chromium'].find(existsSync);
  browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: [
      '--no-sandbox',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  });
  async function screen(role: string, width: number, height: number) {
    const ctx = await browser!.newContext({
      viewport: { width, height },
      locale: lang === 'ar' ? 'ar-EG' : 'en-US',
    });
    const page = await ctx.newPage();
    const screen: { role: string; page: Page; state?: any } = { role, page };
    pages.push(screen);
    page.on('pageerror', (e) => errors.push(`${role}: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${role}: ${m.text()}`);
    });
    page.on('websocket', (ws) =>
      ws.on('framereceived', (frame) => {
        const m = JSON.parse(String(frame.payload));
        if (m.type === 'state.snapshot') screen.state = m.payload;
      }),
    );
    return screen;
  }
  const adminUI = await screen('admin', 1500, 950);
  const player = await screen('competitor', 390, 844);
  const display = await screen('projector', 1920, 1080);
  await display.page.goto(s.url + '/display?lang=' + lang + '&fx=low');
  await adminUI.page.goto(s.url + '/admin?lang=' + lang + '&fx=low');
  await adminUI.page.getByLabel(lang === 'en' ? 'Admin PIN' : 'رمز الإدارة').fill(s.pin);
  await adminUI.page
    .getByRole('button', { name: lang === 'en' ? 'Connect' : 'اتصال', exact: true })
    .click();
  await expect(adminUI.page.locator('.round-hero')).toBeVisible();
  const hook = async (event: string, admin: Client, teams: Client[]) => {
    current = admin;
    if (event === 'setup') {
      await teams[0].attachPage(player.page, lang);
    }
    const phase = admin.s.phase,
      stage = admin.s.stage,
      roundKey = admin.s.roundKey;
    await Promise.all(
      pages.map(async (ui) => {
        await until(
          () => ui.state?.version === admin.s.version,
          `${ui.role} render snapshot ${event}`,
        );
        await ui.page.evaluate(
          () =>
            new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
        );
        if (ui.role === 'competitor') {
          if (event !== 'setup') await expect(ui.page.locator('.welcome')).toHaveCount(0);
          if (['question', 'reconnect', 'tie-question'].includes(event))
            await expect(ui.page.locator('.p-question')).toBeVisible();
          if (event === 'cards')
            await expect(ui.page.locator('.wager-pick').first()).toBeVisible({ timeout: 12000 });
          if (event === 'tie-lobby') await expect(ui.page.locator('.ready-orb')).toBeVisible();
          if (event === 'ready' || event === 'tie-ready')
            await expect(ui.page.locator('.ready-orb.is-ready')).toBeVisible();
          if (event === 'pause')
            await expect(
              ui.page.getByRole('heading', {
                name: lang === 'en' ? 'Round paused' : 'الجولة متوقفة مؤقتاً',
                exact: true,
              }),
            ).toBeVisible();
          if (event === 'tie-question') {
            await expect(ui.page.locator('.q-no')).toHaveText(
              lang === 'en' ? 'Tie-breaker' : 'كسر التعادل',
            );
            assert(
              await ui.page
                .locator('.bar-track span')
                .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a > 0.8),
              'Tie timer must use the question duration, not the Blitz duration',
            );
          }
          await ui.page.bringToFront();
          await expect
            .poll(() =>
              ui.page
                .locator('.p-question')
                .evaluateAll((els) =>
                  els.every((el) => el.getAnimations().every((a) => a.playState === 'finished')),
                ),
            )
            .toBe(true);
        }
        if (ui.role === 'projector' && event === 'champion')
          await expect(ui.page.locator('.d-champion')).toBeVisible();
        if (ui.role === 'projector' && event === 'rules')
          await expect(ui.page.locator('.d-rules')).toBeVisible();
        await expect(ui.page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        // Visible competitor content must fit a narrow device; avoid decorative overflow.
        if (ui.role === 'competitor')
          assert(
            await ui.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            `Clipped competitor UI: ${event}`,
          );
      }),
    );
    // Hold every role at the same observable UI boundary before capturing any of them.
    if (event === 'reveal' && stage === 2)
      await expect(display.page.locator('.strip-score > b.num')).toHaveText(
        admin.s.lineup.map((t: any) => String(t.score)),
      );
    if (uiHasStrip(event, stage)) {
      const clipped = await display.page
        .locator('.strip-team, .strip-team h3, .strip-score > b.num')
        .evaluateAll((els) =>
          els
            .filter((el) => {
              const r = el.getBoundingClientRect();
              return (
                r.left < -1 ||
                r.right > innerWidth + 1 ||
                r.top < -1 ||
                r.bottom > innerHeight + 1 ||
                el.scrollWidth > el.clientWidth + 1
              );
            })
            .map((el) => `${el.className}: ${JSON.stringify(el.getBoundingClientRect())}`),
        );
      assert.deepEqual(clipped, [], `Clipped projector score strip: ${event}`);
    }
    if (['results', 'champion', 'tie-winner'].includes(event))
      await expect(player.page.locator('.big-score')).toHaveText(String(teams[0].s.ownScore));
    await Promise.all(
      pages.map(async (ui) => {
        const file = `${String(++serial).padStart(3, '0')}-stage${stage}-${event}-${ui.role}.png`;
        await ui.page.screenshot({
          path: join(out, file),
          animations: 'disabled',
          fullPage: ui.role === 'admin',
        });
        captures.push({
          file,
          stage,
          roundKey,
          event,
          role: ui.role,
          phase,
          version: ui.state.version,
          locale: lang,
        });
      }),
    );
    assert.equal(admin.s.phase, phase, `Phase changed during ${event} capture`);
  };
  if (tie) {
    const admin = await s.client('admin');
    const teams = await Promise.all(Array.from({ length: 4 }, () => s.client('team')));
    await admin.cmd('settings.update', { settings: { automation: 'manual', countdownMs: 5 } });
    await hook('setup', admin, teams);
    await begin(admin, teams);
    for (let q = 0; q < 10; q++) for (const t of teams) await answer(admin, t, true);
    await until(() => admin.s.phase === 'REVIEW', 'four way tie');
    await hook('tie', admin, teams);
    const scores = admin.s.lineup.map((t: any) => t.score);
    await admin.cmd('tiebreak.open');
    for (let attempt = 0; attempt < 3; attempt++) {
      await hook('tie-lobby', admin, teams);
      for (const t of teams) await t.cmd('team.ready');
      await hook('tie-ready', admin, teams);
      await admin.cmd('tiebreak.launch');
      await hook('tie-question', admin, teams);
      for (const t of teams) await answer(admin, t, attempt === 2);
      await until(() => admin.s.phase === 'TIE_REVIEW', 'tie grading');
      await hook('tie-grading', admin, teams);
      for (const a of admin.s.answers.filter((a: any) => a.verdict === 'pending'))
        await admin.cmd('grade.set', {
          answerId: a.id,
          verdict: attempt === 2 ? 'correct' : 'wrong',
        });
      await admin.cmd('question.reveal');
      assert.deepEqual(
        admin.s.lineup.map((t: any) => t.score),
        scores,
        'Tie must preserve competition scores',
      );
      if (attempt < 2) assert.equal(admin.s.phase, 'TIE_READY');
    }
    assert.equal(admin.s.phase, 'RESULTS');
    assert.equal(admin.s.winner, teams[0].s.team.id);
    await hook('tie-winner', admin, teams);
    writeFileSync(join(out, 'tie-export.json'), JSON.stringify(await admin.export(), null, 2));
    assert(captures.some((c) => c.event === 'tie-winner'));
  } else {
    await tournament(s, auto, hook);
    for (const stage of [1, 2, 3])
      for (const role of ['admin', 'competitor', 'projector'])
        for (const event of [
          'rules',
          'lobby',
          'ready',
          'countdown',
          'question',
          'pause',
          'reconnect',
          ...(stage === 1
            ? ['results']
            : ['audience', 'reveal', stage === 3 ? 'champion' : 'results']),
        ])
          assert(
            captures.some((c) => c.stage === stage && c.role === role && c.event === event),
            `Missing capture ${stage}/${role}/${event}`,
          );
  }
  if (!tie)
    for (const role of ['admin', 'competitor', 'projector'])
      for (const event of ['wheel', 'cards'])
        assert(
          captures.some((c) => c.stage === 2 && c.role === role && c.event === event),
          `Missing Gambler ${event}/${role}`,
        );
  assert.deepEqual(errors, []);
  status = 'passed';
} catch (e) {
  detail = String(e);
  console.error(e);
  for (const ui of pages) {
    await ui.page
      .screenshot({ path: join(out, `failure-${ui.role}.png`), fullPage: true })
      .catch(() => {});
    writeFileSync(join(out, `failure-${ui.role}.html`), await ui.page.content().catch(() => ''));
  }
  if (current) writeFileSync(join(out, 'failure-state.json'), JSON.stringify(current.s, null, 2));
  process.exitCode = 1;
} finally {
  await browser?.close();
  await s.stop();
  writeFileSync(join(out, 'server.log'), s.log);
  writeFileSync(
    join(out, 'report.json'),
    JSON.stringify(
      {
        status,
        detail,
        locale: lang,
        mode: auto ? 'auto' : 'manual',
        content: s.bank,
        scenario: tie ? 'tie' : 'full-tournament',
        errors,
        captures,
      },
      null,
      2,
    ),
  );
  console.log(`Tour ${status}: ${captures.length} captures in ${out}`);
}
