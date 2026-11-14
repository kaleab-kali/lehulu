import { defineConfig, devices } from '@playwright/test';

// Default: builds the live-demo version (browser storage) and serves it on :4173.
// Against Docker: BASE_URL=http://localhost:8080 pnpm exec playwright test
const external = process.env.BASE_URL;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000, // the main task runs axe on 6+ screens; 30 s is too tight on a typical laptop
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: external ?? 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: external
    ? undefined
    : {
        command: 'pnpm run build:demo && pnpm run preview',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
