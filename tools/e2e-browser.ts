import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, expect, type Browser, type Page } from '@playwright/test';
import type { Server } from './e2e';

type Screen = { page: Page; state: any; name: string };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(test: () => unknown, label: string) {
  const end = Date.now() + 15000;
  while (!test()) {
    if (Date.now() > end) throw new Error(`Timeout: ${label}`);
    await sleep(20);
  }
}

export async function browserOperations(s: Server) {
  let browser: Browser | undefined;
  const pages: Screen[] = [];
  const errors: string[] = [];
  const requests: string[] = [];
  const observer = await s.client('admin');
  const output = s.evidence;
  try {
    const executablePath =
      process.env.CHROMIUM_PATH ||
      ['/usr/bin/chromium', '/opt/pw-browsers/chromium'].find((p) => existsSync(p));
    browser = await chromium.launch({
      ...(executablePath ? { executablePath } : {}),
      args: [
        '--no-sandbox',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
      ],
    });
    async function screen(name: string, route: string, mobile = false) {
      const context = await browser!.newContext({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      });
      await context.addInitScript(() => {
        (window as any).__prints = 0;
        window.print = () => {
          (window as any).__prints++;
        };
        const Native = window.WebSocket;
        (window as any).__sockets = [];
        window.WebSocket = class extends Native {
          constructor(url: string | URL, protocols?: string | string[]) {
            super(url, protocols);
            (window as any).__sockets.push(this);
          }
        };
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const ui: Screen = { page, state: null, name };
      pages.push(ui);
      page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
      context.on('request', (r) => requests.push(r.url()));
      page.on('dialog', (d) => void d.accept());
      page.on('websocket', (socket) =>
        socket.on('framereceived', (frame) => {
          const message = JSON.parse(String(frame.payload));
          if (message.type === 'state.snapshot') ui.state = message.payload;
        }),
      );
      await page.goto(s.url + route + '?lang=en&fx=low');
      return ui;
    }
    const admin = await screen('admin', '/admin');
    const display = await screen('display', '/display');
    const teams: Screen[] = [];
    for (let i = 0; i < 4; i++) teams.push(await screen(`team-${i + 1}`, '/play', i === 0));
    const p = admin.page;
    await p.getByLabel('Admin PIN', { exact: true }).fill('incorrect-pin');
    await p.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(p.getByRole('alert')).toContainText('Invalid admin PIN');
    await p.getByRole('button', { name: 'Exit', exact: true }).click();
    await p.getByLabel('Admin PIN', { exact: true }).fill(s.pin);
    await p.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(p.locator('.team-card')).toHaveCount(4);
    const tab = (name: string) =>
      p
        .locator('aside nav')
        .getByRole('button', { name: new RegExp(name) })
        .click();

    await tab('Settings');
    await p.getByText('Advanced: edit JSON', { exact: true }).click();
    await p
      .locator('.json-editor')
      .fill(JSON.stringify({ automation: 'manual', countdownMs: 100, questionMs: 30000 }));
    await p.locator('.advanced').getByRole('button', { name: 'Save', exact: true }).click();
    await until(() => observer.s.settings.countdownMs === 100, 'UI settings saved');

    await tab('Teams & codes');
    await p.locator('tbody tr').first().getByRole('button', { name: 'Edit', exact: true }).click();
    const dialog = p.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill('Kestrel E2E');
    const logo = await display.page.screenshot();
    await dialog
      .locator('input[type=file]')
      .setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logo });
    await expect(dialog.locator('.logo-preview')).toBeVisible();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await until(() => observer.s.teams[0].logoV > 0, 'logo saved');
    assert.equal((await fetch(s.url + '/logo/1')).headers.get('Content-Type'), 'image/png');
    await p.getByRole('button', { name: 'Print team code cards', exact: true }).click();
    assert.equal(await p.evaluate(() => (window as any).__prints), 1);
    await expect(p.locator('.print-card')).toHaveCount(48);
    await p.getByRole('button', { name: 'Generate teams & codes', exact: true }).click();
    await dialog.getByLabel('Count', { exact: true }).fill('2');
    await dialog.getByLabel('Name prefix', { exact: true }).fill('Generated E2E');
    await dialog.getByRole('button', { name: 'Generate', exact: true }).click();
    await until(() => observer.s.teams.length === 50, 'team generator');
    assert.equal(new Set(observer.s.teams.map((t: any) => t.code)).size, 50);
    await p.getByLabel('Search & filter', { exact: true }).fill('Generated E2E');
    await expect(p.locator('tbody tr')).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      await p
        .locator('tbody tr')
        .first()
        .getByRole('button', { name: 'Delete', exact: true })
        .click();
      await expect(p.locator('tbody tr')).toHaveCount(1 - i);
    }
    await p.getByLabel('Search & filter', { exact: true }).fill('');
    await p.locator('.import-label input[type=file]').setInputFiles({
      name: 'teams.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('id,code,name,color\n2,112,CSV E2E,#27d6b0\n'),
    });
    await expect(p.locator('tbody tr').nth(1)).toContainText('CSV E2E');
    const beforeName = observer.s.teams[0].name;
    await p.locator('.import-label input[type=file]').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify([
          { ...observer.s.teams[0], name: 'Must roll back' },
          { code: '112', name: 'Duplicate', color: '#ffffff' },
        ]),
      ),
    });
    await expect(p.locator('.error')).toBeVisible();
    assert.equal(observer.s.teams[0].name, beforeName);
    await p.locator('.error').getByRole('button', { name: '×', exact: true }).click();

    await tab('Question bank');
    await expect(p.locator('.set-card.ok')).toHaveCount(12);
    await p.locator('.import-label input[type=file]').setInputFiles({
      name: 'question.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify([{ ...observer.s.questions[0], body: 'Browser E2E: what is 1 + 1?' }]),
      ),
    });
    await expect(p.locator('tbody tr').first()).toContainText('Browser E2E');
    await p.locator('tbody tr').first().getByRole('button', { name: 'Edit', exact: true }).click();
    await dialog.getByLabel('Question text').fill('Browser edited E2E: what is 1 + 1?');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(p.locator('tbody tr').first()).toContainText('Browser edited E2E');
    // Arrange an incomplete set, then exercise the real auto-fill control.
    await observer.bulk('questions.save', {
      questions: observer.s.questions
        .filter((q: any) => q.setNo === 1)
        .map((q: any) => ({ ...q, setNo: null })),
    });
    await expect(p.locator('.set-card.ok')).toHaveCount(11);
    await p.getByRole('button', { name: 'Auto-fill sets', exact: true }).click();
    await expect(p.locator('.set-card.ok')).toHaveCount(12);

    await tab('Bracket');
    await p.getByRole('button', { name: 'Random draw', exact: true }).click();
    await p.getByRole('button', { name: 'Confirm draw', exact: true }).click();
    await until(() => observer.s.rounds[0].teamIds.join() !== '1,2,3,4', 'random draw saved');
    assert.equal(
      new Set(observer.s.rounds.filter((r: any) => r.stage === 1).flatMap((r: any) => r.teamIds))
        .size,
      48,
    );
    await observer.cmd('bracket.bulk', {
      assignments: Array.from({ length: 12 }, (_, i) => ({
        key: `1-${i + 1}`,
        teamIds: [1, 2, 3, 4].map((n) => i * 4 + n),
      })),
    });
    await tab('Setup & devices');
    await expect(p.locator('.qr svg').first()).toBeVisible();
    await p.locator('.checklist input').first().check();
    await p.reload();
    await expect(p.locator('.checklist input').first()).toBeChecked();
    await expect(p.locator('tbody tr')).toHaveCount(7);
    await tab('Round control');
    await p.getByRole('button', { name: /Show rules/ }).click();
    await p.locator('.hero-btn').click();
    await expect(p.locator('.hero-btn')).toBeDisabled();
    for (let i = 0; i < 4; i++) {
      for (const digit of String(111 + i))
        await teams[i].page
          .locator('.keypad button', { hasText: new RegExp(`^${digit}$`) })
          .click();
      await teams[i].page.getByRole('button', { name: /^Join the competition/ }).click();
    }
    for (const team of teams) {
      await team.page.bringToFront();
      await expect(team.page.locator('.ready-orb')).toBeVisible({ timeout: 10000 });
      await team.page.locator('.ready-orb').click({ force: true });
    }
    await expect(display.page.locator('.slot.ready')).toHaveCount(4);
    await expect(p.locator('.hero-btn')).toBeEnabled();
    await p.keyboard.press('Control+Enter');
    await expect(teams[0].page.locator('.opt')).toHaveCount(4);
    await display.page.bringToFront();
    await display.page.mouse.move(100, 50);
    await display.page.getByRole('button', { name: 'Enable sound', exact: true }).click();
    await expect(display.page.getByRole('button', { name: 'Sound on', exact: true })).toBeVisible();
    await display.page.getByRole('button', { name: 'Full screen', exact: true }).click();
    await expect.poll(() => display.page.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await display.page.evaluate(() => document.exitFullscreen());
    await p.getByRole('button', { name: 'Pause', exact: true }).click();
    for (const team of teams)
      await expect(
        team.page.getByRole('heading', { name: 'Round paused', exact: true }),
      ).toBeVisible();
    await p.getByRole('button', { name: 'Cancel question and replace', exact: true }).click();
    await until(() => admin.state.paused && admin.state.set[0] !== 1, 'paused browser replacement');
    await p.locator('.hero-btn').click();
    await expect(teams[0].page.locator('.opt')).toHaveCount(4);
    await p.locator('.adjust').first().getByLabel('Team').selectOption('1');
    await p.getByLabel('Reason', { exact: true }).fill('Browser correction');
    await p.getByRole('button', { name: 'Apply adjustment', exact: true }).click();
    await until(() => observer.s.lineup[0].score === -5, 'browser penalty');
    await p.getByRole('button', { name: 'Undo last adjustment', exact: true }).click();
    await until(() => observer.s.lineup[0].score === 0, 'browser undo');
    for (let index = 0; index < 10; index++) {
      for (let i = 0; i < 4; i++) {
        const team = teams[i];
        await team.page.bringToFront();
        await until(
          () => team.state.ownProgress === index && !!team.state.question,
          'browser Blitz question',
        );
        await expect(team.page.locator('.opt')).toHaveCount(4);
        if (i === 0) await team.page.keyboard.press('a');
        else await team.page.locator('.opt').nth(1).click();
        if (index === 0 && i === 0) {
          await until(() => team.state.ownProgress === 1, 'first answer');
          await team.page.reload();
          await until(
            () => team.state.ownProgress === 1 && !!team.state.question,
            'refresh restored question',
          );
          await team.page.evaluate(() =>
            (window as any).__sockets.forEach((socket: WebSocket) => socket.close()),
          );
          await expect(team.page.locator('.connection')).toContainText('Reconnecting');
          await expect(team.page.locator('.connection')).toContainText('Online', {
            timeout: 10000,
          });
          assert.equal(team.state.ownProgress, 1);
        }
      }
    }
    await expect(p.locator('.winner-strip')).toContainText('Kestrel E2E');
    assert.equal(observer.s.winner, 1);
    assert.equal(observer.s.lineup[0].score, 101);
    console.log('  Browser Blitz, refresh, reconnect and emergency controls passed');
    await p.screenshot({ path: join(output, 'browser-blitz-results.png'), fullPage: true });
    await tab('Audit log');
    await p.getByLabel('Search & filter', { exact: true }).fill('score.adjust');
    await expect(p.locator('tbody tr').first()).toContainText('Browser correction');
    await tab('Round control');

    // Arrange complete lineups for the next stages; gameplay and grading use browser controls.
    await observer.bulk('questions.save', {
      questions: observer.s.questions
        .filter((q: any) => q.stage === 2 || q.stage === 3)
        .map((q: any) => ({
          ...q,
          type: 'text',
          body: `Browser E2E ${q.id}: what is 2 + 2?`,
          options: [],
          correct: ['4'],
        })),
    });
    async function startStage(key: string, teamIds: number[]) {
      await observer.cmd('round.select', { key });
      await observer.cmd('round.assignTeams', { teamIds });
      await until(() => admin.state.phase === 'IDLE', 'browser stage setup');
      for (const team of teams) {
        await expect(
          team.page.getByRole('button', { name: 'Sign out', exact: true }),
        ).toBeVisible();
        await team.page.getByRole('button', { name: 'Sign out', exact: true }).click();
        await expect(team.page.locator('.keypad')).toBeVisible();
      }
      await p.locator('.hero-btn').click();
      await p.locator('.hero-btn').click();
      for (let i = 0; i < teamIds.length; i++) {
        for (const digit of String(110 + teamIds[i]))
          await teams[i].page
            .locator('.keypad button', { hasText: new RegExp(`^${digit}$`) })
            .click();
        await teams[i].page.getByRole('button', { name: /^Join the competition/ }).click();
      }
      for (const team of teams.slice(0, teamIds.length)) {
        await team.page.bringToFront();
        await expect(team.page.locator('.ready-orb')).toBeVisible({ timeout: 10000 });
        await team.page.locator('.ready-orb').click({ force: true });
      }
      await expect(p.locator('.hero-btn')).toBeEnabled();
      await p.locator('.hero-btn').click();
    }
    async function writtenAnswers(count: number) {
      for (let i = 0; i < count; i++) {
        await teams[i].page.bringToFront();
        await expect(teams[i].page.locator('.text-answer textarea')).toBeVisible();
        await teams[i].page.locator('.text-answer textarea').fill(i === 0 ? '4' : 'wrong');
        await teams[i].page.getByRole('button', { name: /^Submit answer/ }).click();
      }
      await expect(p.locator('.grade-row')).toHaveCount(count);
      await expect(p.locator('.hero-btn')).toBeDisabled();
      // Hotkey grades the first submitted answer; buttons grade the rest.
      await p.locator('.phase-badge').click();
      await p.keyboard.press('1');
      await expect(p.locator('.grade-row')).toHaveCount(count - 1);
      for (let left = count - 1; left > 0; left--) {
        await p.locator('.grade-row').first().getByRole('button', { name: /Wrong/ }).click();
        await expect(p.locator('.grade-row')).toHaveCount(left - 1);
      }
      await expect(p.locator('.hero-btn')).toBeEnabled();
      await p.locator('.hero-btn').click();
    }
    await startStage('2-1', [1, 2, 3, 4]);
    for (let question = 0; question < 8; question++) {
      await until(() => admin.state.phase === 'WHEEL', 'browser wheel');
      await p.locator('.hero-btn').click();
      for (const team of teams) {
        await team.page.bringToFront();
        await expect(team.page.locator('.wager-pick')).toHaveCount(3, { timeout: 10000 });
        await team.page.locator('.wager-pick').filter({ hasText: '15' }).click();
      }
      await expect(p.locator('.hero-btn')).toBeEnabled();
      await p.locator('.hero-btn').click();
      await writtenAnswers(4);
      if (question < 7) await p.locator('.hero-btn').click();
    }
    await until(() => observer.s.phase === 'RESULTS', 'browser Gambler result');
    assert.deepEqual(
      observer.s.lineup.map((t: any) => t.score),
      [120, -120, -120, -120],
    );
    await display.page.screenshot({ path: join(output, 'browser-gambler-results.png') });
    console.log(
      '  Browser Gambler: eight wagered questions, text grading and negative balances passed',
    );
    await startStage('3-1', [1, 2, 3]);
    for (let question = 0; question < 10; question++) {
      await writtenAnswers(3);
      if (question < 9) await p.locator('.hero-btn').click();
    }
    await until(() => observer.s.phase === 'RESULTS', 'browser champion');
    assert.deepEqual(
      observer.s.lineup.map((t: any) => t.score),
      [10, 0, 0],
    );
    assert.equal(observer.s.winner, 1);
    await expect(p.locator('.winner-strip')).toContainText('Kestrel E2E');
    console.log('  Browser final: ten ladder questions and champion passed');
    await tab('Audit log');
    // The console deliberately shows the latest 100 events; the export retains all history.
    await p.getByLabel('Search & filter', { exact: true }).fill('grade.set');
    await expect(p.locator('tbody tr').first()).toContainText('grade.set');
    await tab('Export & backup');
    for (const name of [
      'Full export (JSON)',
      'Results (CSV)',
      'Audit log (CSV)',
      'Full SQLite backup',
    ]) {
      const pending = p.waitForEvent('download');
      await p.getByRole('button', { name: new RegExp(name.replace(/[()]/g, '\\$&')) }).click();
      const download = await pending;
      const path = await download.path();
      assert(path && readFileSync(path).length > 0);
      await download.saveAs(join(output, download.suggestedFilename()));
    }
    const popupPromise = p.waitForEvent('popup');
    await p.getByRole('button', { name: 'Print results', exact: true }).click();
    const popup = await popupPromise;
    await expect(popup.locator('body')).toContainText('Kestrel E2E');
    await popup.close();
    for (const ui of pages)
      await ui.page.screenshot({ path: join(output, `browser-${ui.name}.png`), fullPage: true });
    assert.deepEqual(errors, []);
    assert(
      requests.every((url) => url.startsWith(s.url) || /^(data:|blob:|about:)/.test(url)),
      'External runtime dependency',
    );
    writeFileSync(join(output, 'browser-requests.json'), JSON.stringify(requests, null, 2));
  } catch (e) {
    for (const ui of pages)
      await ui.page
        .screenshot({ path: join(output, `failure-${ui.name}.png`), fullPage: true })
        .catch(() => {});
    writeFileSync(join(output, 'browser-errors.json'), JSON.stringify(errors, null, 2));
    throw e;
  } finally {
    await browser?.close();
    console.log(`  Browser evidence: ${output}`);
  }
}
