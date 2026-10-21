/** Sequential launch gate. Every result is retained, including failed and skipped checks. */
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, cpSync, readdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { chromium } from '@playwright/test';
const root = resolve(
  process.env.AUDIT_OUT ||
    join('test-results', 'launch-audit-' + new Date().toISOString().replace(/[:.]/g, '-')),
);
mkdirSync(root, { recursive: true });
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const manifest: any = {
  status: 'incomplete',
  plannedChecks: [
    'typecheck',
    'test',
    'build',
    'sim',
    'smoke',
    'e2e',
    'tour-ar-manual',
    'tour-ar-auto',
    'tour-en-manual',
    'tour-en-auto',
    'tour-tie',
  ],
  startedAt: new Date().toISOString(),
  commit: git('rev-parse', 'HEAD'),
  dirty: !!git('status', '--porcelain'),
  runtime: {
    node: process.version,
    pnpm: execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(),
    platform: process.platform,
    arch: process.arch,
    playwright: JSON.parse(readFileSync('node_modules/@playwright/test/package.json', 'utf8'))
      .version,
  },
  content: {
    real: 'packages/server/content/questions.json',
    sha256: createHash('sha256')
      .update(readFileSync('packages/server/content/questions.json'))
      .digest('hex'),
    demo: 'packages/server/src/demo-seed.ts',
  },
  locales: ['ar-EG (RTL)', 'en-US (LTR)'],
  checks: [],
  pending: [
    'Venue networking and LAN latency',
    'Projector readability at venue distance',
    'Audible sound',
    'WAN physically disconnected',
    'Windows execution',
  ],
};
writeFileSync(
  join(root, 'working-tree.patch'),
  execFileSync('git', ['diff', 'HEAD'], { encoding: 'utf8' }),
);
// Include untracked harness files too, so dirty-tree runs can be reproduced.
mkdirSync(join(root, 'harness'), { recursive: true });
for (const file of readdirSync('tools'))
  if (/\.(ts|mjs)$/.test(file)) cpSync(join('tools', file), join(root, 'harness', file));
if (process.env.AUDIT_BASELINE)
  cpSync(resolve(process.env.AUDIT_BASELINE), join(root, 'baseline'), { recursive: true });
function save() {
  writeFileSync(join(root, 'report.json'), JSON.stringify(manifest, null, 2));
}
save();
try {
  const executablePath =
    process.env.CHROMIUM_PATH ||
    ['/usr/bin/chromium', '/opt/pw-browsers/chromium'].find(existsSync);
  const browser = await chromium.launch({
    ...(executablePath ? { executablePath } : {}),
    args: ['--no-sandbox'],
  });
  manifest.runtime.chromium = browser.version();
  await browser.close();
} catch (e) {
  manifest.runtime.chromium = String(e);
}
async function run(name: string, script: string, env: Record<string, string> = {}) {
  const logPath = join(root, name + '.log');
  const started = Date.now();
  console.log(`Starting ${name}`);
  let log = '';
  const child = spawn('pnpm', [script], {
    env: { ...process.env, ...env },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let timeout = false;
  let escalation: ReturnType<typeof setTimeout> | undefined;
  const timer = setTimeout(
    () => {
      timeout = true;
      process.kill(-child.pid!, 'SIGTERM');
      escalation = setTimeout(() => {
        try {
          process.kill(-child.pid!, 'SIGKILL');
        } catch {}
      }, 5000);
    },
    12 * 60 * 1000,
  );
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (data) => {
      log += String(data);
      writeFileSync(logPath, log);
    });
  const code = await new Promise<number | null>((r) => {
    child.on('error', (e) => {
      log += String(e);
      r(1);
    });
    child.on('exit', r);
  });
  clearTimeout(timer);
  clearTimeout(escalation);
  writeFileSync(logPath, log);
  const reportPath = env.TOUR_OUT
    ? join(env.TOUR_OUT, 'report.json')
    : env.E2E_OUT
      ? join(env.E2E_OUT, 'report.json')
      : '';
  let detail: any;
  if (reportPath && existsSync(reportPath)) {
    try {
      detail = JSON.parse(readFileSync(reportPath, 'utf8'));
    } catch (e) {
      log += `\nInvalid evidence report: ${String(e)}`;
      writeFileSync(logPath, log);
    }
  }
  const validReport =
    !reportPath ||
    (detail &&
      (Array.isArray(detail)
        ? detail.every((r: any) => r.status === 'passed')
        : detail.status === 'passed'));
  const result = {
    name,
    status: code === 0 && !timeout && validReport ? 'passed' : 'failed',
    detail: reportPath && !validReport ? 'Missing, failed or invalid evidence report' : undefined,
    exitCode: code,
    timeout,
    durationMs: Date.now() - started,
    log: relative(root, logPath),
    report: reportPath ? relative(root, reportPath) : undefined,
  };
  manifest.checks.push(result);
  save();
  console.log(`${result.status.toUpperCase()} ${name} (${(result.durationMs / 1000).toFixed(1)}s)`);
}
for (const script of ['typecheck', 'test', 'build', 'sim', 'smoke', 'e2e']) {
  if (
    ['sim', 'smoke', 'e2e'].includes(script) &&
    manifest.checks.find((c: any) => c.name === 'build')?.status !== 'passed'
  ) {
    manifest.checks.push({ name: script, status: 'skipped', reason: 'Production build failed' });
    save();
    continue;
  }
  await run(
    script,
    script,
    script === 'e2e'
      ? { E2E_OUT: join(root, 'e2e'), E2E_ONLY: '' }
      : script === 'smoke'
        ? { PLAYWRIGHT_OUTPUT_DIR: join(root, 'smoke') }
        : {},
  );
}
for (const locale of ['ar', 'en'])
  for (const mode of ['manual', 'auto']) {
    const name = `tour-${locale}-${mode}`;
    if (manifest.checks.find((c: any) => c.name === 'build')?.status !== 'passed')
      manifest.checks.push({ name, status: 'skipped', reason: 'Production build failed' });
    else
      await run(name, 'tour', {
        TOUR_LANG: locale,
        TOUR_AUTO: mode === 'auto' ? '1' : '0',
        TOUR_SCENARIO: '',
        TOUR_ONLY: '',
        TOUR_BANK: 'demo',
        TOUR_OUT: join(root, name),
      });
  }
if (manifest.checks.find((c: any) => c.name === 'build')?.status !== 'passed')
  manifest.checks.push({ name: 'tour-tie', status: 'skipped', reason: 'Production build failed' });
else
  await run('tour-tie', 'tour', {
    TOUR_LANG: 'ar',
    TOUR_AUTO: '0',
    TOUR_SCENARIO: 'tie',
    TOUR_ONLY: '',
    TOUR_BANK: 'demo',
    TOUR_OUT: join(root, 'tour-tie'),
  });
manifest.finishedAt = new Date().toISOString();
manifest.status = manifest.checks.every((c: any) => c.status === 'passed') ? 'passed' : 'failed';
save();
const esc = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
let html = `<!doctype html><meta charset="utf-8"><title>Ashour launch audit</title><style>body{font:16px system-ui;max-width:1400px;margin:30px auto;background:#101825;color:#eee}a{color:#82e4d3}img{max-width:320px;max-height:240px}figure{display:inline-block;vertical-align:top;width:330px;margin:8px}pre{white-space:pre-wrap}td,th{padding:8px;text-align:left}</style><h1>Launch audit: ${manifest.status}</h1><pre>${esc(JSON.stringify({ ...manifest, checks: undefined }, null, 2))}</pre><a href="report.json">Machine report</a><table><tr><th>Check</th><th>Status</th><th>Evidence</th></tr>`;
for (const c of manifest.checks)
  html += `<tr><td>${esc(c.name)}</td><td>${esc(c.status)}</td><td>${c.log ? `<a href="${esc(c.log)}">Log</a>` : esc(c.reason)} ${c.report && existsSync(join(root, c.report)) ? `<a href="${esc(c.report)}">Report</a>` : ''}</td></tr>`;
html += '</table>';
for (const stage of [1, 2, 3])
  for (const role of ['admin', 'competitor', 'projector']) {
    html += `<h2>Stage ${stage}: ${role}</h2>`;
    for (const c of manifest.checks.filter((c: any) => c.name.startsWith('tour') && c.report)) {
      if (!existsSync(join(root, c.report))) continue;
      let report;
      try {
        report = JSON.parse(readFileSync(join(root, c.report), 'utf8'));
      } catch {
        continue;
      }
      for (const shot of (report.captures || []).filter(
        (x: any) => x.stage === stage && x.role === role,
      )) {
        const path = c.name + '/' + shot.file;
        html += `<figure><a href="${esc(path)}"><img loading="lazy" src="${esc(path)}"></a><figcaption>${esc(c.name)} / ${esc(shot.event)} / ${esc(shot.phase)} / v${shot.version}</figcaption></figure>`;
      }
    }
  }
writeFileSync(join(root, 'index.html'), html);
console.log(`Audit ${manifest.status}: ${root}/index.html`);
if (manifest.status !== 'passed') process.exitCode = 1;
