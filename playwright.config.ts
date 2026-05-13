// Playwright config — Layer 4 e2e harness (V1.0 first slice).
//
// Closes strict-audit item #7 (Native Graph Workspace closure
// mission). The ADR for the full Layer 4 strategy is at:
//   docs/architecture/agent-studio-e2e-testing-strategy.md
//
// Design choices:
//   - Chromium-only project. Firefox + WebKit install footprints
//     would multiply CI minutes for marginal coverage on a smoke
//     harness whose first job is to verify the production-path
//     boundaries don't break under a real browser.
//   - `testDir: tests/playwright/specs` keeps Playwright specs out
//     of the vitest include glob (`tests/**/*.test.ts` +
//     `client/**/*.test.tsx`); using `.spec.ts` for Playwright
//     specs avoids any cross-runner collision.
//   - `webServer` is OFF by default — CI starts the dev server
//     explicitly via the workflow before running Playwright, which
//     gives the workflow control over DB seeding ordering. Local
//     developers run `pnpm dev` separately and then invoke
//     `pnpm test:e2e`.
//   - `baseURL` is operator-overridable via PLAYWRIGHT_BASE_URL so
//     the same harness can run against local dev, a staging
//     deployment, or a Docker compose stack.
//
// Per the boundary preservation rules in the e2e ADR:
//   - Tests run in demo mode (no real OAuth setup).
//   - Tests do not stub the MCP dispatcher.
//   - Tests do not call real model providers — provider-connections
//     are seeded with a fake provider for the test workspace.
//   - Tests do not bypass approval.
//   - Tests do not mutate graph facts directly.

import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/playwright/specs",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [
        ["github"],
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ]
    : [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results/playwright",
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: process.env.CI ? "retain-on-failure" : "off",
    screenshot: "only-on-failure",
    video: process.env.CI ? "retain-on-failure" : "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
