/**
 * Item 35 — Graph Agent reasoning benchmark contract test.
 *
 * Pins the deterministic 6-scenario benchmark's invariants:
 *   - all 6 scenarios PASS when run with the deterministic stub
 *   - permission-hidden-distractor does NOT leak the hidden label
 *     into the answer OR the trace (load-bearing for item 27/34/35
 *     intersection)
 *   - stale_projection_warning records the operator signal
 *   - simple_fact_lookup emits the cited sourceId for the visible
 *     node AND records the graph node id in the decision-trace step
 *
 * The bench runner itself is exercised via its programmatic API
 * (`runAllScenarios`), not via the script entry point — so this
 * test does NOT write to disk and does NOT shell out.
 */

import { describe, it, expect } from "vitest";
import { runAllScenarios } from "../../scripts/graph-bench/run-graph-agent-reasoning-bench";

describe("Item 35 — Graph Agent reasoning benchmark contract", () => {
  it("all 6 scenarios PASS with the deterministic stub", async () => {
    const scenarios = await runAllScenarios();
    expect(scenarios.length).toBe(6);
    for (const s of scenarios) {
      expect(s.passed, `${s.key} should pass — failed: ${s.assertions.filter((a) => !a.passed).map((a) => a.name).join(", ")}`).toBe(true);
    }
  });

  it("scenario keys match the prompt's 6-scenario taxonomy", async () => {
    const scenarios = await runAllScenarios();
    const keys = scenarios.map((s) => s.key).sort();
    expect(keys).toEqual([
      "impact_style_reasoning",
      "multi_hop_relationship",
      "permission_hidden_distractor",
      "shortest_path_reasoning",
      "simple_fact_lookup",
      "stale_projection_warning",
    ]);
  });

  it("permission_hidden_distractor proves no SECRET leak in answer or trace", async () => {
    const scenarios = await runAllScenarios();
    const hidden = scenarios.find((s) => s.key === "permission_hidden_distractor");
    expect(hidden).toBeDefined();
    expect(hidden!.passed).toBe(true);
    expect(hidden!.observations.hiddenSourceLeaked).toBe(false);
    expect(hidden!.observations.citedSourceIds).not.toContain("src:SECRET");
    expect(hidden!.observations.graphNodeIdsInTrace).not.toContain("SECRET");
  });

  it("stale_projection_warning records a truncation/rejection operator signal", async () => {
    const scenarios = await runAllScenarios();
    const stale = scenarios.find((s) => s.key === "stale_projection_warning");
    expect(stale).toBeDefined();
    expect(stale!.passed).toBe(true);
    expect(stale!.observations.truncationOrRejection).toBeDefined();
  });

  it("simple_fact_lookup threads the graph node id into the decision-trace step", async () => {
    const scenarios = await runAllScenarios();
    const simple = scenarios.find((s) => s.key === "simple_fact_lookup");
    expect(simple).toBeDefined();
    expect(simple!.observations.citedSourceIds).toContain("src:n1");
    expect(simple!.observations.graphNodeIdsInTrace).toContain("n1");
  });
});
