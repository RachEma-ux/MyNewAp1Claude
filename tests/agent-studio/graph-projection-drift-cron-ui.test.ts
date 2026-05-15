/**
 * Projection drift cron — UI consumer. PR-V1-191.
 *
 * Source-scan that `agentStudio.graphProjection.getDriftCronStatus`
 * gets its first UI consumer by being paired into the GraphHealth
 * admin panel (#941) alongside the alert cron — same
 * `{ lastRunAt, lastResult, lastError }` shape.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-191 — projection drift cron UI (first consumer)", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
  );

  it("GraphHealthAdminPanel queries the drift cron alongside the alert cron", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      "trpc.agentStudio.graphProjection.getDriftCronStatus.useQuery",
    );
    expect(src).toContain('data-testid="graph-projection-drift-cron-grid"');
    // Same lastError-highlight pattern as the alert cron.
    expect(
      /driftCronQ\.data\.lastError\s*\?\s*"text-destructive"\s*:\s*""/.test(
        src,
      ),
    ).toBe(true);
    // Card slotted between the alert cron and open-alerts cards.
    expect(src).toContain("Projection drift cron status");
  });
});
