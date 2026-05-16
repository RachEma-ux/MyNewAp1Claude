/**
 * T-I.57 — Run-now button for the health-alert scan on
 * `GraphHealthAdminPanel`.
 *
 * Closes the "no Run-now" gap on the alert-cron card. Mirrors T-I.55
 * (staleness Run-now) shape: admin tRPC mutation invokes the same
 * `runHealthAlertScan` the cron wrapper uses; UI button + feedback +
 * cron-status invalidation. Useful for confirming threshold changes
 * or triaging suspected backend issues without waiting for the next
 * 5-min cron tick.
 *
 * Source-scan asserts:
 *
 *   Router:
 *     1. `health-router.ts` imports `runHealthAlertScan` alongside
 *        existing helpers.
 *     2. `runAlertScan` is mounted as an `adminProcedure.mutation`
 *        (no Zod input — no parameters needed).
 *     3. Scope pinned to "default" matching `listOpen` + `resolveAlert`.
 *
 *   Panel:
 *     4. Panel binds `runAlertScanMutation` with onSuccess invalidating
 *        BOTH `getAlertCronStatus` AND `listOpen` (the scan can resolve
 *        existing alerts, so the open-alerts table must refresh too).
 *     5. Button has stable testid.
 *     6. Feedback line surfaces decisions / raised / resolved counts
 *        from `HealthAlertScanResult` + `persisted` rollup.
 *     7. Mutation is gated to its `isPending` state.
 *     8. Label flip between "Run alert scan now" and "Scanning…".
 *     9. Error path surfaces the error in the feedback line.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const routerPath = resolve(
  __dirname,
  "../../server/agent-studio/services/graph/health-router.ts",
);
const panelPath = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
);

describe("T-I.57 server-side: runAlertScan admin tRPC mutation", () => {
  const router = readFileSync(routerPath, "utf8");

  it("imports runHealthAlertScan from health-alert.ts", () => {
    expect(/import\s*\{[\s\S]{0,200}runHealthAlertScan[\s\S]{0,200}\}\s*from\s*["']\.\/health-alert\.js["']/.test(
      router,
    )).toBe(true);
  });

  it("router exposes runAlertScan as adminProcedure.mutation", () => {
    expect(
      /runAlertScan:\s*adminProcedure[\s\S]{0,200}\.mutation/.test(router),
    ).toBe(true);
  });

  it("mutation has no .input() — runs unparameterized scan", () => {
    expect(
      /runAlertScan:\s*adminProcedure\.mutation/.test(router),
    ).toBe(true);
  });

  it("scope pinned to 'default' (matches listOpen + resolveAlert)", () => {
    expect(
      /runHealthAlertScan\(\s*\{\s*scope:\s*["']default["']\s*\}\s*\)/.test(
        router,
      ),
    ).toBe(true);
  });
});

describe("T-I.57 client-side: Run-alert-scan button on GraphHealthAdminPanel", () => {
  const src = readFileSync(panelPath, "utf8");

  it("panel binds runAlertScanMutation to graphHealth.runAlertScan", () => {
    expect(src).toContain(
      "trpc.agentStudio.graphHealth.runAlertScan.useMutation",
    );
  });

  it("onSuccess invalidates getAlertCronStatus", () => {
    expect(
      /onSuccess[\s\S]{0,800}graphHealth\.getAlertCronStatus\.invalidate/.test(
        src,
      ),
    ).toBe(true);
  });

  it("onSuccess also invalidates listOpen — scan can auto-resolve open alerts", () => {
    expect(
      /runAlertScanMutation[\s\S]{0,1500}graphHealth\.listOpen\.invalidate/.test(
        src,
      ),
    ).toBe(true);
  });

  it("renders the Run-now button with stable testid", () => {
    expect(src).toContain(
      'data-testid="graph-health-alert-scan-run-now-button"',
    );
  });

  it("renders the feedback line with stable testid", () => {
    expect(src).toContain(
      'data-testid="graph-health-alert-scan-run-now-feedback"',
    );
  });

  it("button is disabled while the mutation is pending", () => {
    expect(
      /disabled=\{runAlertScanMutation\.isPending\}/.test(src),
    ).toBe(true);
  });

  it("button label flips between idle + pending states", () => {
    expect(src).toContain("Scanning…");
    expect(src).toContain("Run alert scan now");
  });

  it("feedback surfaces status + decisions + persisted rollup", () => {
    expect(src).toContain("data.status");
    expect(src).toContain("data.decisions.length");
    expect(src).toContain("data.persisted.raised");
    expect(src).toContain("data.persisted.resolved");
  });

  it("error path surfaces the error in the feedback line", () => {
    expect(
      /onError[\s\S]{0,400}setAlertScanFeedback[\s\S]{0,200}failed/.test(src),
    ).toBe(true);
  });
});
