/**
 * T-I.55 — Run-now button for projection-staleness check on
 * `GraphHealthAdminPanel`.
 *
 * Closes the operator-action half of kind #7 (`neo4j_projection_stale`):
 * the admin tRPC mutation `runStalenessCheck` shipped at T-I.46 (#1221)
 * and the read-only status card shipped at T-I.50 (#1226), but the
 * button to *trigger* the mutation was missing. Mirrors the
 * RegionAdminPanel `forceRewarm` shape — button + mutation +
 * invalidation + feedback line.
 *
 * Source-scan asserts:
 *   1. Panel imports useState (for the feedback string).
 *   2. Panel binds `trpc.useUtils()` for cache invalidation.
 *   3. The mutation references the canonical procedure.
 *   4. The button + feedback testids are present.
 *   5. The success path invalidates the staleness cron status query.
 *   6. The mutation is gated to its `isPending` state (no double-fire).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const panelPath = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
);

describe("T-I.55 — staleness-cron Run-now button", () => {
  const src = readFileSync(panelPath, "utf8");

  it("imports useState from react for feedback string", () => {
    expect(/from\s+["']react["']/.test(src)).toBe(true);
    expect(/\buseState\b/.test(src)).toBe(true);
  });

  it("binds trpc.useUtils() for cache invalidation", () => {
    expect(src).toContain("trpc.useUtils()");
  });

  it("references the canonical runStalenessCheck mutation", () => {
    expect(src).toContain(
      "trpc.agentStudio.graphProjection.runStalenessCheck.useMutation",
    );
  });

  it("renders the Run-now button with stable testid", () => {
    expect(src).toContain(
      'data-testid="graph-projection-staleness-run-now-button"',
    );
  });

  it("renders the feedback line with stable testid", () => {
    expect(src).toContain(
      'data-testid="graph-projection-staleness-run-now-feedback"',
    );
  });

  it("success path invalidates the staleness cron status query", () => {
    expect(
      /onSuccess[\s\S]{0,800}getStalenessCronStatus\.invalidate/.test(src),
    ).toBe(true);
  });

  it("button is disabled while the mutation is pending (no double-fire)", () => {
    expect(
      /disabled=\{runStalenessCheckMutation\.isPending\}/.test(src),
    ).toBe(true);
  });

  it("button label flips between idle + pending states", () => {
    expect(src).toContain("Scanning…");
    expect(src).toContain("Run staleness check now");
  });

  it("error path surfaces the error in the feedback line", () => {
    expect(
      /onError[\s\S]{0,400}setStalenessRunFeedback[\s\S]{0,200}failed/.test(
        src,
      ),
    ).toBe(true);
  });
});
