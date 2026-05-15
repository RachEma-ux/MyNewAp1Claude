/**
 * Phase 22 §T-I.5 batch A.2 — Projection drift cron → failure-state bridge wiring.
 *
 * Source-scan structural test asserting the cron imports the bridge
 * and emits `neo4j_projection_drift_detected` when driftCount > 0
 * (zero-drift scans are not failure events). Live emission would
 * require ASDB; we don't run that here.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const cronPath = resolve(
  __dirname,
  "../../server/agent-studio/services/graph/projection/drift-cron.ts",
);

describe("drift-cron.ts is wired into the failure-state bridge", () => {
  const src = readFileSync(cronPath, "utf8");

  it("imports recordFailureStateEvent", () => {
    expect(src).toMatch(
      /import\s*\{\s*recordFailureStateEvent\s*\}\s*from\s*["'][^"']*failure-states\/observability-bridge/,
    );
  });

  it("uses the canonical neo4j_projection_drift_detected closed kind", () => {
    expect(src).toContain('failureState: "neo4j_projection_drift_detected"');
  });

  it("only emits when driftCount > 0 (zero-drift scans are not events)", () => {
    expect(src).toMatch(/driftCount > 0[\s\S]{0,200}recordFailureStateEvent/);
  });

  it("fire-and-forget — void + .catch envelope", () => {
    expect(src).toMatch(
      /void recordFailureStateEvent[\s\S]{0,600}\.catch/,
    );
  });

  it("carries scope + totalScanned + driftCount + permissionLeakCount in metadata", () => {
    expect(src).toContain("totalScanned: report.summary.totalScanned");
    expect(src).toContain("driftCount: report.summary.driftCount");
    expect(src).toContain("permissionLeakCount: report.summary.permissionLeakCount");
  });
});
