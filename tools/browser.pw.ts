import { test, expect } from '@playwright/test';
const pin = process.env.SMOKE_PIN!;
test('Arabic admin, team and display screens work without external runtime requests', async ({
  browser,
  page,
}, testInfo) => {
  // LAN uses ordinary HTTP, where crypto.randomUUID may be unavailable.
  await page.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  });
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/admin');
  await page.getByLabel('رمز الإدارة').fill(pin);
  await page.getByRole('button', { name: 'اتصال', exact: true }).click();
  await expect(page.locator('.admin-main h1')).toHaveText('إدارة الجولة');
  await expect(page.locator('.team-card')).toHaveCount(4);
  await page.getByLabel('تلقائي', { exact: true }).selectOption('manual');
  await page.screenshot({ path: testInfo.outputPath('ashour-admin.png'), fullPage: true });

  // Question bank editing through the visual editor.
  await page.getByRole('button', { name: /بنك الأسئلة/ }).click();
  await expect(page.locator('.set-card.ok')).toHaveCount(12);
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await page.getByRole('button', { name: 'تعديل', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('نص السؤال').fill('سؤال اختبار واجهة: ما ناتج 1 + 1؟');
  await dialog.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('tbody tr').first()).toContainText('سؤال اختبار واجهة');

  // Setup page: QR codes are generated locally.
  await page.getByRole('button', { name: /الإعداد والأجهزة/ }).click();
  await expect(page.locator('.qr svg').first()).toBeVisible();
  await page.getByRole('button', { name: /إدارة الجولة/ }).click();
  await page.getByRole('button', { name: 'عرض القواعد ←', exact: true }).click();
  await page.getByRole('button', { name: 'إعلان الفرق وفتح الجاهزية ←', exact: true }).click();

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  });
  const play = await context.newPage();
  const projector = await context.newPage();
  play.on('pageerror', (e) => errors.push(e.message));
  projector.on('pageerror', (e) => errors.push(e.message));
  await play.goto('/play');
  for (const digit of '111')
    await play.locator('.keypad button', { hasText: new RegExp(`^${digit}$`) }).click();
  await play.getByRole('button', { name: 'دخول المسابقة ←', exact: true }).click();
  await expect(play.locator('.p-head')).toContainText('الفريق 1');
  await expect(play.locator('.ready-orb')).toBeVisible({ timeout: 12000 });
  await play.locator('.ready-orb').click({ force: true });
  await expect(play.locator('.ready-orb.is-ready')).toBeVisible();
  await projector.goto('/display');
  await expect(projector.locator('.lineup .slot')).toHaveCount(4);
  await expect(projector.locator('.slot.ready')).toHaveCount(1);
  await projector.screenshot({ path: testInfo.outputPath('ashour-display.png'), fullPage: true });
  await page.getByRole('button', { name: 'بدء إجباري', exact: true }).click();
  await expect(play.locator('.options .opt').first()).toBeVisible({ timeout: 10000 });
  await play.screenshot({ path: testInfo.outputPath('ashour-play.png'), fullPage: true });
  await play.locator('.options .opt').first().click();
  await expect(play.locator('.q-top')).toContainText('2 من 10');
  await play.reload();
  await expect(play.locator('.q-top')).toContainText('2 من 10');
  await page.getByRole('button', { name: 'إيقاف مؤقت', exact: true }).click();
  await expect(play.getByRole('heading', { name: 'الجولة متوقفة مؤقتاً' })).toBeVisible();
  await expect(projector.locator('.d-paused')).toBeVisible();
  await page.locator('.hero-btn').click();
  await expect(play.locator('.options .opt').first()).toBeVisible();
  await play.setViewportSize({ width: 390, height: 844 });
  await expect(play.locator('.options .opt').first()).toBeVisible();
  await play.bringToFront(); // background tabs freeze CSS animations
  await expect
    .poll(() =>
      play
        .locator('.p-question')
        .evaluate((el) =>
          el.getAnimations().every((animation) => animation.playState === 'finished'),
        ),
    )
    .toBe(true);
  const offenders = await play.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter(
        (e) =>
          e.getBoundingClientRect().right > window.innerWidth + 1 ||
          e.getBoundingClientRect().left < -1,
      )
      .map(
        (e) =>
          `${e.tagName}.${(e as HTMLElement).className} ${JSON.stringify(e.getBoundingClientRect())} iw=${window.innerWidth}`,
      )
      .slice(0, 8),
  );
  expect(offenders).toEqual([]);
  expect(await play.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
  expect(
    requests.every((url) => url.startsWith(process.env.SMOKE_URL!) || url.startsWith('data:')),
  ).toBe(true);
  await context.close();
});

test('English and low-effects modes render without errors on every route', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/display?lang=en&fx=low');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveClass(/low-fx/);
  await expect(page.locator('.display-root')).toBeVisible();
  await page.goto('/play?lang=en');
  await expect(page.getByRole('heading', { name: 'Enter your team code' })).toBeVisible();
  await page.goto('/admin?lang=en');
  await expect(page.getByLabel('Admin PIN')).toBeVisible();
  // Switch back so later tests and manual runs start in Arabic.
  await page.goto('/?lang=ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  expect(errors).toEqual([]);
});
