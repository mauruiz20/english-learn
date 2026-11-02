import { defineConfig, devices } from "@playwright/test";

// `E2E_PORT` picks another port when 4173 is taken (e.g. by another checkout's server, which
// `reuseExistingServer` would otherwise test instead of this build).
const PORT = Number(process.env.E2E_PORT ?? 4173);
// A second server of the same export on another port (so another origin) plays the app's OLD web
// address in the progress transfer spec (`e2e/transfer.spec.ts`).
export const OLD_PORT = Number(process.env.E2E_OLD_PORT ?? PORT + 1);

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
  webServer: [PORT, OLD_PORT].map((port) => ({
    command: `node scripts/serve-web.mjs --port ${port} --dir dist-e2e`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
  })),
});
