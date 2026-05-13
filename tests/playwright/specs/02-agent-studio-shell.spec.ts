// Layer 4 Playwright v0 — Agent Studio shell smoke.
//
// Loads /agent-studio in demo mode and verifies the shell mounts.
// Component-level RTL smoke for this exists in
// tests/e2e/agent-studio-shell-smoke.test.ts; this Playwright test
// exercises the same route under a real browser — catches build /
// bundling / dynamic-import regressions that RTL cannot.
//
// Boundary preservation:
//   - Demo mode (no OAuth env vars in CI).
//   - No tool dispatch.
//   - No provider call.

import { expect, test } from "@playwright/test";

test.describe("Agent Studio shell", () => {
  test("/agent-studio renders without runtime errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    const response = await page.goto("/agent-studio", {
      waitUntil: "domcontentloaded",
    });
    expect(response!.status(), "/agent-studio should respond 200").toBeLessThan(
      400,
    );

    // The shell mounts the root div before client routing resolves.
    await expect(page.locator("#root")).toBeAttached();

    // Filter the noise floor — extension errors and Vite HMR
    // warnings that aren't from app code. The signal is: did our
    // own bundle throw a top-level render error?
    const appErrors = consoleErrors.filter(
      (e) => !/chrome-extension:|extension|hot-update|HMR/i.test(e),
    );
    expect(
      appErrors,
      `unexpected console errors on /agent-studio: ${appErrors.join("\n")}`,
    ).toEqual([]);
  });

  test("graph-workspace route is reachable", async ({ page }) => {
    const response = await page.goto("/agent-studio/graph-workspace", {
      waitUntil: "domcontentloaded",
    });
    // We don't require any text content — the route may be lazily
    // loaded and the gate-test is `status < 400` + no top-level
    // render throw. Detailed UI assertions belong in the
    // component-RTL smoke test, not in the browser harness.
    expect(response!.status()).toBeLessThan(400);
    await expect(page.locator("#root")).toBeAttached();
  });
});
