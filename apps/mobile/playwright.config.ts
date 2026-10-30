import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

// E2E tests against the static web export built with EXPO_PUBLIC_E2E=1 (dist-e2e/), which
// enables the test-only `?today=YYYY-MM-DD` clock override. `pnpm e2e:web` builds it first.
export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // WebKit stands in for Safari / iOS web (COEP `require-corp` only; see e2e/support/test.ts
    // for why it runs on one worker).
    { name: "webkit", use: { ...devices["Desktop Safari"] }, workers: 1 },
  ],
  webServer: {
    command: `node scripts/serve-web.mjs --port ${PORT} --dir dist-e2e`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
