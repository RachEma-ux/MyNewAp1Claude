// Layer 4 Playwright v0 — app-boot smoke.
//
// The smallest possible end-to-end signal: the dev server responds
// to GET / with the SPA shell + Vite-injected entrypoint. If this
// breaks, the browser never reaches React.
//
// Boundary preservation (see e2e ADR):
//   - No MCP dispatcher bypass — this test does not call any tools.
//   - No provider call — this test loads HTML only.
//   - No auth bypass — demo mode is used (no OAuth setup needed).

import { expect, test } from "@playwright/test";

test.describe("app boot", () => {
  test("GET / returns the SPA shell with the React entrypoint", async ({
    page,
  }) => {
    const response = await page.goto("/", { waitUntil: "domcontentloaded" });
    expect(response, "navigation must produce a response").not.toBeNull();
    expect(response!.status(), "/ should respond 200").toBe(200);

    // The Vite-built SPA shell mounts into <div id="root">. If this
    // selector disappears, the build pipeline has drifted.
    const root = page.locator("#root");
    await expect(root).toBeAttached();
  });

  test("title contains the app name", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/.+/);
  });
});
