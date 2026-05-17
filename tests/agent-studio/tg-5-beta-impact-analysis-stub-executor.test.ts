/**
 * T-G.5.β — Impact Analysis stub executor.
 *
 * Wires `runImpactAnalysisStub` into the `impactAnalysis` tRPC
 * router as a `runImpactAnalysis` query procedure. Honors the T-F.3
 * `ImpactAnalysisResult` contract: anchor-only result for every
 * kind, `nodes[0]` = the starting node at depth 0 with `visible:true`,
 * `edges:[]`, `truncated:false`, `hiddenNodeCount:0`.
 *
 * Per-kind executor classification surfaced as `mode: "stub" |
 * "template"` so the operator dashboard can render a "Stub mode —
 * no template registered" badge without misreading an anchor-only
 * result as "no impact."
 *
 * Future state: when `ags_query_templates` is seeded for a kind,
 * `classifyImpactAnalysisExecutorMode` returns `"template"` for
 * that kind and the executor branch picks up the parameterized
 * Cypher template via `GraphRepository.executeTemplate`. The
 * envelope shape stays stable.
 */

import { describe, it, expect } from "vitest";

import {
  impactAnalysisRouter,
  type RunImpactAnalysisEnvelope,
} from "../../server/agent-studio/services/graph-lens/impact-analysis-router";
import {
  classifyImpactAnalysisExecutorMode,
  runImpactAnalysisStub,
} from "../../server/agent-studio/services/graph-lens/impact-analysis-executor";
import {
  IMPACT_ANALYSIS_KINDS,
  type ImpactAnalysisKind,
} from "../../server/agent-studio/services/graph-lens/impact-analysis-contracts";

describe("T-G.5.β — impactAnalysisRouter.runImpactAnalysis shape", () => {
  it("router exposes runImpactAnalysis procedure (plus prior α procedures)", () => {
    const procedures = (impactAnalysisRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("runImpactAnalysis");
    // Prior α procedures still present (regression check).
    expect(keys).toContain("listKnownKinds");
    expect(keys).toContain("summarizeResult");
  });

  it("envelope wraps result + mode discriminant", () => {
    const env: RunImpactAnalysisEnvelope = {
      result: runImpactAnalysisStub({
        kind: "knowledge_impact",
        startingNode: { typeKey: "note", id: "note:abc" },
      }),
      mode: classifyImpactAnalysisExecutorMode("knowledge_impact"),
    };
    expect(env.mode).toBe("stub");
    expect(env.result.kind).toBe("knowledge_impact");
    expect(env.result.startingNodeId).toBe("note:abc");
  });
});

describe("T-G.5.β — runImpactAnalysisStub contract", () => {
  it("returns anchor-only result for any kind", () => {
    const result = runImpactAnalysisStub({
      kind: "security_impact",
      startingNode: { typeKey: "Service", id: "svc:checkout" },
    });
    expect(result.kind).toBe("security_impact");
    expect(result.startingNodeId).toBe("svc:checkout");
    expect(result.nodes.length).toBe(1);
    expect(result.nodes[0]!.typeKey).toBe("Service");
    expect(result.nodes[0]!.id).toBe("svc:checkout");
    expect(result.nodes[0]!.depth).toBe(0);
    expect(result.nodes[0]!.visible).toBe(true);
    // Label intentionally omitted — stub doesn't know the anchor's
    // display name (no graph query was run).
    expect(result.nodes[0]!.label).toBeUndefined();
    expect(result.edges.length).toBe(0);
    expect(result.truncated).toBe(false);
    expect(result.hiddenNodeCount).toBe(0);
  });

  it("normalizes maxDepth — accepts undefined / valid input", () => {
    // Default (undefined) — no throw.
    expect(() =>
      runImpactAnalysisStub({
        kind: "runtime_impact",
        startingNode: { typeKey: "runtime_run", id: "run:1" },
      }),
    ).not.toThrow();
    // Explicit valid maxDepth — no throw.
    expect(() =>
      runImpactAnalysisStub({
        kind: "runtime_impact",
        startingNode: { typeKey: "runtime_run", id: "run:1" },
        maxDepth: 5,
      }),
    ).not.toThrow();
  });

  it("throws on invalid maxDepth (< 1 or non-finite)", () => {
    expect(() =>
      runImpactAnalysisStub({
        kind: "workflow_impact",
        startingNode: { typeKey: "workflow", id: "wf:x" },
        maxDepth: 0,
      }),
    ).toThrow(/maxDepth/);
    expect(() =>
      runImpactAnalysisStub({
        kind: "workflow_impact",
        startingNode: { typeKey: "workflow", id: "wf:x" },
        maxDepth: Number.NaN,
      }),
    ).toThrow(/maxDepth/);
  });
});

describe("T-G.5.β — classifyImpactAnalysisExecutorMode", () => {
  it("returns 'stub' for every closed-taxonomy kind (no templates seeded yet)", () => {
    for (const kind of IMPACT_ANALYSIS_KINDS) {
      const mode = classifyImpactAnalysisExecutorMode(kind as ImpactAnalysisKind);
      expect(mode).toBe("stub");
    }
  });
});
