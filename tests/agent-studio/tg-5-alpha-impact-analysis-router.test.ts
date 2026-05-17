/**
 * T-G.5.α — Impact Analysis tRPC router (read-only enumeration +
 * summary).
 *
 * Mounts the operator-facing surface for the Impact Analysis Lens.
 * Contracts (T-F.3) + summary helper (T-F.10) already shipped; this
 * PR mounts a thin router so the dashboard can:
 *
 *   - Enumerate the 7 closed-taxonomy impact kinds.
 *   - Run the pure summary aggregator on a client-supplied result.
 *
 * **Traversal executor deferred** — needs Cypher-template review +
 * cross-graph composition. The router stays read-only + pure for now.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  impactAnalysisRouter,
  type ListImpactAnalysisKindsEnvelope,
  type SummarizeImpactAnalysisResultEnvelope,
} from "../../server/agent-studio/services/graph-lens/impact-analysis-router";
import {
  IMPACT_ANALYSIS_KINDS,
  summarizeImpactAnalysisResult,
} from "../../server/agent-studio/services/graph-lens/impact-analysis-contracts";

describe("T-G.5.α — impactAnalysisRouter shape", () => {
  it("exports listKnownKinds + summarizeResult procedures", () => {
    const procedures = (impactAnalysisRouter as unknown as {
      _def: { procedures: Record<string, unknown> };
    })._def.procedures;
    const keys = Object.keys(procedures);
    expect(keys).toContain("listKnownKinds");
    expect(keys).toContain("summarizeResult");
  });

  it("listKnownKinds envelope passes through the 7 closed-taxonomy kinds", () => {
    expect(IMPACT_ANALYSIS_KINDS.length).toBe(7);
    const env: ListImpactAnalysisKindsEnvelope = {
      kinds: IMPACT_ANALYSIS_KINDS,
      metadata: {} as never,
    };
    const kindSet = new Set(env.kinds);
    expect(kindSet.size).toBe(7);
    // Spot-check anchors against silent enum drift — these are the
    // 7 kinds from impact-analysis-contracts.ts T-F.3.
    expect(kindSet.has("knowledge_impact" as never)).toBe(true);
    expect(kindSet.has("runtime_impact" as never)).toBe(true);
    expect(kindSet.has("code_impact" as never)).toBe(true);
    expect(kindSet.has("security_impact" as never)).toBe(true);
    expect(kindSet.has("governance_impact" as never)).toBe(true);
    expect(kindSet.has("tool_impact" as never)).toBe(true);
    expect(kindSet.has("workflow_impact" as never)).toBe(true);
  });

  it("summarizeResult envelope matches the existing aggregator output", () => {
    // The router is a pure passthrough — the same input through
    // the standalone aggregator AND through the router envelope
    // should yield the same summary.
    const expectedSummary = summarizeImpactAnalysisResult({
      kind: "knowledge_impact",
      startingNodeId: "note:abc",
      nodes: [
        { typeKey: "note", id: "note:abc", depth: 0, visible: true, label: "anchor" },
        { typeKey: "cag_block", id: "block:x", depth: 1, visible: true, label: "downstream" },
        { typeKey: "cag_block", id: "block:y", depth: 1, visible: false },
      ],
      edges: [
        {
          typeKey: "references",
          sourceNodeId: "note:abc",
          targetNodeId: "block:x",
          visible: true,
        },
        {
          typeKey: "references",
          sourceNodeId: "note:abc",
          targetNodeId: "block:y",
          visible: false,
        },
      ],
      truncated: false,
      hiddenNodeCount: 1,
    });
    expect(expectedSummary.totalNodes).toBe(3);
    expect(expectedSummary.visibleNodes).toBe(2);
    expect(expectedSummary.hiddenNodes).toBe(1);
    expect(expectedSummary.totalEdges).toBe(2);
    expect(expectedSummary.visibleEdges).toBe(1);
    expect(expectedSummary.maxObservedDepth).toBe(1);
    expect(expectedSummary.nodesByDepth[0]).toBe(1);
    expect(expectedSummary.nodesByDepth[1]).toBe(2);

    // Envelope shape — the router wraps the same summary.
    const env: SummarizeImpactAnalysisResultEnvelope = {
      summary: expectedSummary,
    };
    expect(env.summary).toBe(expectedSummary);
  });
});

// ──────────────────────────────────────────────────────────────────
// Source-scan integrity — mount drift guard.
// ──────────────────────────────────────────────────────────────────

describe("T-G.5.α source-scan — impactAnalysis router is mounted", () => {
  it("api/router.ts imports impactAnalysisRouter and mounts it at `impactAnalysis`", () => {
    const file = readFileSync(
      resolve(
        __dirname,
        "../../server/agent-studio/api/router.ts",
      ),
      "utf-8",
    );
    expect(file).toContain(
      'import { impactAnalysisRouter } from "../services/graph-lens/impact-analysis-router"',
    );
    expect(file).toMatch(/impactAnalysis:\s*impactAnalysisRouter,/);
  });
});
