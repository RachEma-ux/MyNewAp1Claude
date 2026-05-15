/**
 * Phase 22 §T-I.5 batch A — Graph health-alert → failure-state bridge wiring.
 *
 * Mix of:
 *   1. Pure-function tests on `healthAlertKeyToFailureState`.
 *   2. Source-scan structural test asserting the scanner imports the bridge.
 *      (Live emission test would need an ASDB connection, which we don't run
 *      here per CLAUDE.md device-rule.)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { healthAlertKeyToFailureState } from "../../server/agent-studio/services/graph/health-alert";

const scannerPath = resolve(
  __dirname,
  "../../server/agent-studio/services/graph/health-alert.ts",
);

describe("healthAlertKeyToFailureState — mapping table", () => {
  it("graph_health_unavailable → neo4j_unavailable", () => {
    expect(healthAlertKeyToFailureState("graph_health_unavailable")).toBe(
      "neo4j_unavailable",
    );
  });

  it("graph_health_degraded → neo4j_degraded", () => {
    expect(healthAlertKeyToFailureState("graph_health_degraded")).toBe(
      "neo4j_degraded",
    );
  });

  it("graph_health_latency_high → neo4j_degraded (collapsed)", () => {
    expect(healthAlertKeyToFailureState("graph_health_latency_high")).toBe(
      "neo4j_degraded",
    );
  });
});

describe("health-alert.ts scanner is wired into the bridge", () => {
  const src = readFileSync(scannerPath, "utf8");

  it("imports recordFailureStateEvent from the bridge", () => {
    expect(src).toMatch(
      /import\s*\{\s*recordFailureStateEvent\s*\}\s*from\s*["']\.\.\/failure-states\/observability-bridge/,
    );
  });

  it("imports the FailureState type from the contract", () => {
    expect(src).toMatch(
      /import\s+type\s*\{\s*FailureState\s*\}\s*from\s*["']\.\.\/failure-states\/contracts/,
    );
  });

  it("invokes the bridge in the scanner with severityOverride", () => {
    expect(src).toContain("recordFailureStateEvent");
    expect(src).toContain("severityOverride: decision.severity");
  });

  it("fire-and-forget — wraps the bridge call in void + .catch", () => {
    expect(src).toMatch(
      /void recordFailureStateEvent[\s\S]{0,500}\.catch/,
    );
  });
});
