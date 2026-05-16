/**
 * Phase 22 §T-I.50 — GraphHealthAdminPanel staleness-cron card.
 *
 * Source-scan that the staleness cron status (#1222) gets a UI surface
 * alongside the drift cron card. Closes the operator-visibility loop
 * for kind #7 — staleness counts are now visible on the same panel
 * as drift + alert crons.
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const panelPath = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
);

describe("GraphHealthAdminPanel surfaces the projection staleness cron", () => {
  const src = readFileSync(panelPath, "utf8");

  it("queries the staleness cron status procedure", () => {
    expect(src).toContain(
      "trpc.agentStudio.graphProjection.getStalenessCronStatus.useQuery",
    );
  });

  it("renders the staleness cron card with the data-testid", () => {
    expect(src).toContain(
      'data-testid="graph-projection-staleness-cron-grid"',
    );
  });

  it("surfaces the 4 result counts from the cron result", () => {
    expect(src).toContain("distinctProjectionCount");
    expect(src).toContain("staleCount");
    expect(src).toContain("neverSucceededCount");
    expect(src).toContain("freshCount");
  });

  it("destructive-highlights staleCount > 0 and neverSucceededCount > 0", () => {
    expect(
      /lastResult\.staleCount > 0[\s\S]{0,80}text-destructive/.test(src),
    ).toBe(true);
    expect(
      /lastResult\.neverSucceededCount > 0[\s\S]{0,80}text-destructive/.test(
        src,
      ),
    ).toBe(true);
  });

  it("renders the staleness card AFTER the drift card (locality invariant)", () => {
    const driftIdx = src.indexOf("graph-projection-drift-cron-grid");
    const stalenessIdx = src.indexOf("graph-projection-staleness-cron-grid");
    expect(driftIdx).toBeGreaterThan(-1);
    expect(stalenessIdx).toBeGreaterThan(driftIdx);
  });

  it("read-only — no useMutation against graphProjection.getStalenessCronStatus", () => {
    // The cron status surface is read-only; admin tRPC mutation is
    // `runStalenessCheck`, exposed separately. This test locks the
    // panel against accidentally adding a mutation here (it should
    // live on a dedicated trigger button if/when added).
    expect(
      /graphProjection\.getStalenessCronStatus[\s\S]{0,200}useMutation/.test(
        src,
      ),
    ).toBe(false);
  });
});
