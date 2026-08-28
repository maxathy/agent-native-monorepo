import { defineConfig, devices } from '@playwright/test';

// Default to the Vite dev server for local runs. Setting E2E_BASE_URL points the
// suite at an already-running stack instead — in CI that is the console container
// from `docker compose --profile full`, which serves the production bundle and
// proxies /api to the gateway, so the suite exercises the real request path
// rather than a dev server with no backend behind it.
const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:5173';
const usesRunningStack = Boolean(process.env['E2E_BASE_URL']);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  workers: process.env['CI'] ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(usesRunningStack
    ? {}
    : {
        webServer: {
          command: 'yarn dev',
          url: baseURL,
          reuseExistingServer: !process.env['CI'],
          timeout: 30_000,
        },
      }),
});
