import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the REAL local backend (default http://localhost:8000). Start it first:
 *   cd ../enterprise-dms-backend && .venv\Scripts\python.exe scripts\dev_stack.py
 * The Next.js app is started by Playwright in development mode (the dev sign-in is deliberately
 * impossible in a production build).
 */
// A dedicated port plus a same-origin proxy keeps E2E independent of whatever else runs on :3000 and of CORS.
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:8000';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_AUTH_MODE: 'dev',
      NEXT_PUBLIC_API_BASE_URL: `http://localhost:${PORT}/api/v1`,
      API_PROXY_TARGET: BACKEND,
    },
  },
});
