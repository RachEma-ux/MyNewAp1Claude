/**
 * T-I.58 — Run-now button for the projection-drift scan on
 * `GraphHealthAdminPanel`.
 *
 * Closes the "no Run-now" gap on the third (and last) cron card. The
 * inline `runSweep` body in `drift-cron.ts` was factored into a
 * standalone `runProjectionDriftScan()` so the admin tRPC mutation
 * can call it without the cron-expression + minute-dedupe gate that
 * `tickProjectionDriftCron` enforces.
 *
 * Source-scan asserts:
 *
 *   Drift-cron module:
 *     1. `runProjectionDriftScan` is exported as a top-level function.
 *     2. The closed-taxonomy bridge emission still happens (gated on
 *        driftCount > 0, fire-and-forget, neo4j_projection_drift_detected).
 *     3. The cron's runSweep delegates to runProjectionDriftScan.
 *
 *   Router:
 *     4. `router.ts` imports runProjectionDriftScan from drift-cron.
 *     5. Mounts `runDriftScan` as an `adminProcedure.mutation`.
 *     6. Calls runProjectionDriftScan with empty options object.
 *
 *   Panel:
 *     7. Panel binds `runDriftScanMutation` to graphProjection.runDriftScan.
 *     8. onSuccess invalidates `getDriftCronStatus`.
 *     9. Button has stable testid + label flip.
 *    10. Feedback line surfaces all four DriftCronResult counts.
 *    11. Error path surfaces error in feedback.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const driftCronPath = resolve(
  __dirname,
  "../../server/agent-studio/services/graph/projection/drift-cron.ts",
);
const routerPath = resolve(
  __dirname,
  "../../server/agent-studio/services/graph/projection/router.ts",
);
const panelPath = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
);

describe("T-I.58 drift-cron: runProjectionDriftScan factored out", () => {
  const src = readFileSync(driftCronPath, "utf8");

  it("exports runProjectionDriftScan as a top-level async function", () => {
    expect(
      /export\s+async\s+function\s+runProjectionDriftScan/.test(src),
    ).toBe(true);
  });

  it("emits neo4j_projection_drift_detected gated on driftCount > 0", () => {
    expect(
      /runProjectionDriftScan[\s\S]{0,2500}if\s*\(\s*report\.summary\.driftCount\s*>\s*0[\s\S]{0,400}failureState:\s*["']neo4j_projection_drift_detected["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("uses fire-and-forget envelope (void + .catch)", () => {
    expect(
      /runProjectionDriftScan[\s\S]{0,2500}void recordFailureStateEvent[\s\S]{0,800}\.catch/.test(
        src,
      ),
    ).toBe(true);
  });

  it("cron's runSweep delegates to runProjectionDriftScan", () => {
    expect(src).toContain("runSweep: runProjectionDriftScan");
  });
});

describe("T-I.58 router: runDriftScan admin mutation", () => {
  const src = readFileSync(routerPath, "utf8");

  it("imports runProjectionDriftScan from drift-cron.js", () => {
    expect(
      /import\s*\{[\s\S]{0,200}runProjectionDriftScan[\s\S]{0,200}\}\s*from\s*["']\.\/drift-cron\.js["']/.test(
        src,
      ),
    ).toBe(true);
  });

  it("mounts runDriftScan as adminProcedure.mutation", () => {
    expect(
      /runDriftScan:\s*adminProcedure[\s\S]{0,200}\.mutation/.test(src),
    ).toBe(true);
  });

  it("mutation has no Zod input (unparameterized scan)", () => {
    expect(/runDriftScan:\s*adminProcedure\.mutation/.test(src)).toBe(true);
  });

  it("invokes runProjectionDriftScan with empty options", () => {
    expect(/runProjectionDriftScan\(\s*\{\}\s*\)/.test(src)).toBe(true);
  });
});

describe("T-I.58 panel: Run-drift-scan button", () => {
  const src = readFileSync(panelPath, "utf8");

  it("panel binds runDriftScanMutation to graphProjection.runDriftScan", () => {
    expect(src).toContain(
      "trpc.agentStudio.graphProjection.runDriftScan.useMutation",
    );
  });

  it("onSuccess invalidates getDriftCronStatus", () => {
    expect(
      /onSuccess[\s\S]{0,800}graphProjection\.getDriftCronStatus\.invalidate/.test(
        src,
      ),
    ).toBe(true);
  });

  it("renders the Run-now button with stable testid", () => {
    expect(src).toContain(
      'data-testid="graph-projection-drift-scan-run-now-button"',
    );
  });

  it("renders the feedback line with stable testid", () => {
    expect(src).toContain(
      'data-testid="graph-projection-drift-scan-run-now-feedback"',
    );
  });

  it("button is disabled while the mutation is pending", () => {
    expect(
      /disabled=\{runDriftScanMutation\.isPending\}/.test(src),
    ).toBe(true);
  });

  it("button label flips between idle + pending", () => {
    expect(src).toContain("Run drift scan now");
  });

  it("feedback surfaces all four DriftCronResult counts", () => {
    expect(src).toContain("data.totalScanned");
    expect(src).toContain("data.driftCount");
    expect(src).toContain("data.permissionLeakCount");
    expect(src).toContain("data.persistedEvents");
  });

  it("error path surfaces the error in the feedback line", () => {
    expect(
      /onError[\s\S]{0,400}setDriftScanFeedback[\s\S]{0,200}failed/.test(src),
    ).toBe(true);
  });
});
