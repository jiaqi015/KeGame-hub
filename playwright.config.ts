import { defineConfig, devices } from '@playwright/test';

const e2ePort = Number(process.env.E2E_PORT ?? 3101);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: {
    timeout: 12_000,
  },
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: e2eBaseUrl,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
  ],
  webServer: {
    command: `PORT=${e2ePort} AUTH_LOCAL_WHITELIST='codex@ke.com=all' npm run dev`,
    url: e2eBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
