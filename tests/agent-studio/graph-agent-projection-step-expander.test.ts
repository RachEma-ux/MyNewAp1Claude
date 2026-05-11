/**
 * Phase 14 §6/§7 — decision-trace step expander tests.
 *
 * Pure unit coverage for `expandDecisionTraceSteps()` + ASDB-null
 * coverage for `loadDecisionTraceStepsForRun()`.
 */

import { describe, it, expect, vi } from "vitest";
import {
  expandDecisionTraceSteps,
  loadDecisionTraceStepsForRun,
  type DecisionTraceStepRow,
} from "../../server/agent-studio/services/graph-agent/projection-step-expander";

function row(
  overrides: Partial<DecisionTraceStepRow> & { stepIndex: number; runId: number },
): DecisionTraceStepRow {
  return {
    id: overrides.id ?? overrides.stepIndex,
    runId: overrides.runId,
    stepIndex: overrides.stepIndex,
    stepKind: overrides.stepKind ?? "plan_retrieval_mode",
    durationMs: overrides.durationMs ?? 10,
  };
}

describe("expandDecisionTraceSteps — Phase 14 §6/§7", () => {
  it("emits one node + one HAS_STEP edge per step row", () => {
    const writes = expandDecisionTraceSteps(555, [
      row({ runId: 555, stepIndex: 1, stepKind: "plan_retrieval_mode" }),
      row({ runId: 555, stepIndex: 2, stepKind: "retrieve" }),
    ]);
    expect(writes).toHaveLength(4);
    const nodes = writes.filter((w) => w.kind === "upsert_node");
    const edges = writes.filter((w) => w.kind === "upsert_edge");
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(2);
  });

  it("step node id is stable on (runId, stepIndex) — replays are idempotent", () => {
    const r = row({ runId: 555, stepIndex: 3 });
    const a = expandDecisionTraceSteps(555, [r]);
    const b = expandDecisionTraceSteps(555, [r]);
    expect(a[0].node?.id).toBe(b[0].node?.id);
    expect(a[0].node?.id).toBe("decision_trace_step:555:3");
  });

  it("step node carries runId / stepIndex / stepKind / durationMs", () => {
    const writes = expandDecisionTraceSteps(555, [
      row({ runId: 555, stepIndex: 2, stepKind: "retrieve", durationMs: 42 }),
    ]);
    const node = writes.find((w) => w.kind === "upsert_node")!.node;
    expect(node?.properties).toMatchObject({
      runId: 555,
      stepIndex: 2,
      stepKind: "retrieve",
      durationMs: 42,
    });
  });

  it("HAS_STEP edge connects DecisionTrace → DecisionTraceStep", () => {
    const writes = expandDecisionTraceSteps(555, [
      row({ runId: 555, stepIndex: 1 }),
    ]);
    const edge = writes.find((w) => w.kind === "upsert_edge")!.edge;
    expect(edge?.typeKey).toBe("HAS_STEP");
    expect(edge?.sourceNode).toEqual({
      typeKey: "DecisionTrace",
      id: "decision_trace:555",
    });
    expect(edge?.targetNode).toEqual({
      typeKey: "DecisionTraceStep",
      id: "decision_trace_step:555:1",
    });
    expect(edge?.properties).toMatchObject({ stepIndex: 1 });
  });

  it("emits empty writes for empty step list", () => {
    expect(expandDecisionTraceSteps(1, [])).toEqual([]);
  });

  it("provenance is lineageStatus=derived + governanceStatus=active for both nodes and edges", () => {
    const writes = expandDecisionTraceSteps(555, [
      row({ runId: 555, stepIndex: 1 }),
    ]);
    for (const w of writes) {
      const prov = w.node?.provenance ?? w.edge?.provenance;
      expect(prov?.lineageStatus).toBe("derived");
      expect(prov?.governanceStatus).toBe("active");
      expect(prov?.sourceType).toBe("graph_agent_step");
    }
  });

  it("preserves the input order — caller sorts via DB orderBy(stepIndex asc)", () => {
    const writes = expandDecisionTraceSteps(555, [
      row({ runId: 555, stepIndex: 3 }),
      row({ runId: 555, stepIndex: 1 }),
      row({ runId: 555, stepIndex: 2 }),
    ]);
    const stepIndices = writes
      .filter((w) => w.kind === "upsert_node")
      .map((w) => w.node?.properties.stepIndex);
    expect(stepIndices).toEqual([3, 1, 2]);
  });
});

describe("loadDecisionTraceStepsForRun — ASDB reader", () => {
  it("returns empty array when ASDB is unavailable", async () => {
    const rows = await loadDecisionTraceStepsForRun(555, {
      getDb: () => null as never,
    });
    expect(rows).toEqual([]);
  });

  it("queries by runId, orders by stepIndex ascending, returns selected columns", async () => {
    const select = vi.fn(() => ({
      from: () => ({
        where: () => ({
          orderBy: async () => [
            { id: 1, runId: 555, stepIndex: 1, stepKind: "a", durationMs: 1 },
            { id: 2, runId: 555, stepIndex: 2, stepKind: "b", durationMs: 2 },
          ],
        }),
      }),
    }));
    const db = { select };
    const rows = await loadDecisionTraceStepsForRun(555, {
      getDb: () => db as never,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ stepIndex: 1, stepKind: "a" });
    expect(rows[1]).toMatchObject({ stepIndex: 2, stepKind: "b" });
    expect(select).toHaveBeenCalledTimes(1);
  });
});
