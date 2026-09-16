import { defineConfig } from "@playwright/test";

try {
  // Node's built-in .env loader (stable since Node 20.6). CI provides the
  // same variables directly, so a missing file here is not an error.
  process.loadEnvFile(".env.local");
} catch {
  // ignore — running in an environment that already has env vars set
}

const PORT = process.env.PORT ?? "3100";
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 30_000,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "e2e",
      dependencies: ["setup"],
      testMatch: /.*\.spec\.ts/,
    },
  ],
  // Only manage a dev server when testing locally; against a deployed URL
  // (PLAYWRIGHT_BASE_URL set), tests run against that instead.
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npx next dev -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
