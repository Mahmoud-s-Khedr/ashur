import { defineConfig } from '@playwright/test';
import { mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
const dir = mkdtempSync(join(tmpdir(), 'ashour-browser-'));
const pin = process.env.SMOKE_PIN || randomUUID();
process.env.SMOKE_PIN = pin;
const port = process.env.SMOKE_URL
  ? Number(new URL(process.env.SMOKE_URL).port)
  : await new Promise<number>((resolve) => {
      const server = createServer();
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as { port: number }).port;
        server.close(() => resolve(port));
      });
    });
process.env.SMOKE_URL = `http://127.0.0.1:${port}`;
export default defineConfig({
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR || 'test-results/smoke',
  testDir: 'tools',
  testMatch: '*.pw.ts',
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: process.env.SMOKE_URL,
    headless: true,
    launchOptions: {
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : existsSync('/usr/bin/chromium')
          ? { executablePath: '/usr/bin/chromium' }
          : existsSync('/opt/pw-browsers/chromium')
            ? { executablePath: '/opt/pw-browsers/chromium' }
            : {}),
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: 'pnpm start',
    url: process.env.SMOKE_URL + '/health',
    reuseExistingServer: false,
    env: {
      ADMIN_PIN: pin,
      HOST: '127.0.0.1',
      PORT: String(port),
      DB_PATH: join(dir, 'browser.sqlite'),
      BACKUP_DIR: join(dir, 'backups'),
    },
  },
  reporter: 'list',
});
