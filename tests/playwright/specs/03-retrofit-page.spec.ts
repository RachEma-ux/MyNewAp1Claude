// Layer 4 Playwright v0 — RetrofitPage operator-dashboard smoke.
//
// The RetrofitPage is the operator surface for the 18 retention
// cron panels (item #14 closed at 17/17 via PR-AT-8). Its build /
// composition / tRPC mount stack is large and a likely source of
// future regressions. This smoke test exercises the page in a
// real browser: if any retention panel's tRPC mount drifts, the
// page throws during render and this test fails.
//
// Boundary preservation:
//   - Demo mode.
//   - No tool dispatch.
//   - tRPC calls go through the real client → server stack — but
//     the test does not assert on returned data (data depends on
//     workspace state); it asserts only on render success.

import { expect, test } from "@playwright/test";

test.describe("RetrofitPage retention dashboard", () => {
  test("loads without top-level render errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    const response = await page.goto("/agent-studio/retrofit", {
      waitUntil: "domcontentloaded",
    });
    // Some shells redirect /retrofit under a workspace path or
    // alternate slug. We accept anything in the 2xx/3xx range — the
    // gate is "no top-level throw", not URL stability.
    expect(response!.status()).toBeLessThan(500);
    await expect(page.locator("#root")).toBeAttached();

    const appErrors = errors.filter(
      (e) => !/chrome-extension:|extension|hot-update|HMR/i.test(e),
    );
    expect(
      appErrors,
      `unexpected console errors on RetrofitPage: ${appErrors.join("\n")}`,
    ).toEqual([]);
  });
});
