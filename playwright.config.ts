import { defineConfig } from '@playwright/test';

const remoteBaseURL = process.env.E2E_BASE_URL;
const baseURL = remoteBaseURL || 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './e2e', timeout: 180_000, workers: 1,
  use: { baseURL, actionTimeout: 20_000, viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: remoteBaseURL ? undefined : { command: process.env.E2E_PRODUCTION === '1' ? 'npm run start -- --hostname 127.0.0.1 --port 3100' : 'npm run dev -- --hostname 127.0.0.1 --port 3100', url: baseURL, reuseExistingServer: false, timeout: 120_000 },
});
