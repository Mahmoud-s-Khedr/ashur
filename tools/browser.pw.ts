import { test, expect } from '@playwright/test';
const pin = 'browser-demo-pin';
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
  await page.getByRole('button', { name: /بنك الأسئلة/ }).click();
  await expect(page.locator('tbody tr')).toHaveCount(180);
  await page.getByRole('button', { name: 'تعديل', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('نص السؤال').fill('سؤال اختبار واجهة: ما ناتج 1 + 1؟');
  await dialog.getByRole('button', { name: 'حفظ', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('tbody tr').first()).toContainText('سؤال اختبار واجهة');
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
  await play.getByLabel('كود الفريق').fill('111');
  await play.getByRole('button', { name: 'دخول المسابقة ←', exact: true }).click();
  await expect(play.locator('.player-team')).toContainText('الفريق 1');
  await play.getByRole('button', { name: 'مستعد ←', exact: true }).click();
  await expect(play.locator('.ready-button')).toContainText('✓');
  await projector.goto('/display');
  await expect(projector.locator('.public-lineup article')).toHaveCount(4);
  await projector.screenshot({ path: testInfo.outputPath('ashour-display.png'), fullPage: true });
  await page.getByRole('button', { name: 'بدء إجباري', exact: true }).click();
  await expect(play.locator('.answer-options')).toBeVisible({ timeout: 10000 });
  await play.screenshot({ path: testInfo.outputPath('ashour-play.png'), fullPage: true });
  await play.locator('.answer-options button').first().click();
  await expect(play.locator('.question-top')).toContainText('2 / 10');
  await play.reload();
  await expect(play.locator('.question-top')).toContainText('2 / 10');
  await page.getByRole('button', { name: 'إيقاف مؤقت', exact: true }).click();
  await expect(play.getByRole('heading', { name: 'الجولة متوقفة مؤقتاً' })).toBeVisible();
  await page.getByRole('button', { name: 'استئناف ←', exact: true }).click();
  await expect(play.locator('.answer-options')).toBeVisible();
  await play.setViewportSize({ width: 390, height: 844 });
  await expect(play.locator('.answer-options')).toBeVisible();
  expect(await play.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
  expect(
    requests.every((url) => url.startsWith('http://127.0.0.1:3101') || url.startsWith('data:')),
  ).toBe(true);
  await context.close();
});
