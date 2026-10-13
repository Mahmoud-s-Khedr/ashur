import { defineConfig } from '@playwright/test';
import { mkdtempSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const dir = mkdtempSync(join(tmpdir(), 'ashour-browser-'));
export default defineConfig({
  testDir: 'tools',
  testMatch: '*.pw.ts',
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:3101',
    headless: true,
    launchOptions: {
      ...(process.env.CHROMIUM_PATH
        ? { executablePath: process.env.CHROMIUM_PATH }
        : existsSync('/usr/bin/chromium')
          ? { executablePath: '/usr/bin/chromium' }
          : {}),
      args: ['--no-sandbox'],
    },
  },
  webServer: {
    command: 'pnpm start',
    url: 'http://127.0.0.1:3101/health',
    reuseExistingServer: false,
    env: {
      ADMIN_PIN: 'browser-demo-pin',
      HOST: '127.0.0.1',
      PORT: '3101',
      DB_PATH: join(dir, 'browser.sqlite'),
      BACKUP_DIR: join(dir, 'backups'),
    },
  },
  reporter: 'list',
});
