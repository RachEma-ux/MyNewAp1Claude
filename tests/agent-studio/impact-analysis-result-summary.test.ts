/**
 * Phase 24 §T-F.10 — summarizeImpactAnalysisResult lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  summarizeImpactAnalysisResult,
  type ImpactAnalysisResult,
  type ImpactAnalysisNode,
  type ImpactAnalysisEdge,
} from "../../server/agent-studio/services/graph-lens/public-api.js";

function buildResult(
  nodes: ImpactAnalysisNode[],
  edges: ImpactAnalysisEdge[],
  truncated = false,
): ImpactAnalysisResult {
  return {
    kind: "downstream_consumers",
    startingNodeId: "n0",
    nodes,
    edges,
    truncated,
    hiddenNodeCount: nodes.filter((n) => !n.visible).length,
  };
}

describe("summarizeImpactAnalysisResult (T-F.10)", () => {
  it("empty result → zeros + maxDepth=0 + empty histogram", () => {
    const s = summarizeImpactAnalysisResult(buildResult([], []));
    expect(s.totalNodes).toBe(0);
    expect(s.visibleNodes).toBe(0);
    expect(s.hiddenNodes).toBe(0);
    expect(s.totalEdges).toBe(0);
    expect(s.visibleEdges).toBe(0);
    expect(s.hiddenEdges).toBe(0);
    expect(s.maxObservedDepth).toBe(0);
    expect(Object.keys(s.nodesByDepth).length).toBe(0);
    expect(s.truncated).toBe(false);
  });

  it("counts visible vs hidden nodes correctly", () => {
    const s = summarizeImpactAnalysisResult(
      buildResult(
        [
          { typeKey: "n", id: "a", depth: 0, visible: true, label: "anchor" },
          { typeKey: "n", id: "b", depth: 1, visible: true, label: "down" },
          { typeKey: "n", id: "c", depth: 1, visible: false },
        ],
        [],
      ),
    );
    expect(s.totalNodes).toBe(3);
    expect(s.visibleNodes).toBe(2);
    expect(s.hiddenNodes).toBe(1);
  });

  it("counts visible vs hidden edges correctly", () => {
    const s = summarizeImpactAnalysisResult(
      buildResult(
        [],
        [
          { typeKey: "e", sourceNodeId: "a", targetNodeId: "b", visible: true },
          {
            typeKey: "e",
            sourceNodeId: "b",
            targetNodeId: "c",
            visible: false,
          },
        ],
      ),
    );
    expect(s.totalEdges).toBe(2);
    expect(s.visibleEdges).toBe(1);
    expect(s.hiddenEdges).toBe(1);
  });

  it("builds depth histogram", () => {
    const s = summarizeImpactAnalysisResult(
      buildResult(
        [
          { typeKey: "n", id: "0", depth: 0, visible: true },
          { typeKey: "n", id: "1", depth: 1, visible: true },
          { typeKey: "n", id: "2", depth: 1, visible: true },
          { typeKey: "n", id: "3", depth: 2, visible: true },
        ],
        [],
      ),
    );
    expect(s.nodesByDepth[0]).toBe(1);
    expect(s.nodesByDepth[1]).toBe(2);
    expect(s.nodesByDepth[2]).toBe(1);
    expect(s.maxObservedDepth).toBe(2);
  });

  it("Σ nodesByDepth == totalNodes", () => {
    const s = summarizeImpactAnalysisResult(
      buildResult(
        [
          { typeKey: "n", id: "0", depth: 0, visible: true },
          { typeKey: "n", id: "1", depth: 1, visible: true },
          { typeKey: "n", id: "2", depth: 1, visible: false },
          { typeKey: "n", id: "3", depth: 5, visible: true },
        ],
        [],
      ),
    );
    const sum = Object.values(s.nodesByDepth).reduce((a, b) => a + b, 0);
    expect(sum).toBe(s.totalNodes);
  });

  it("visibleNodes + hiddenNodes == totalNodes", () => {
    const s = summarizeImpactAnalysisResult(
      buildResult(
        [
          { typeKey: "n", id: "0", depth: 0, visible: true },
          { typeKey: "n", id: "1", depth: 1, visible: false },
          { typeKey: "n", id: "2", depth: 2, visible: false },
        ],
        [],
      ),
    );
    expect(s.visibleNodes + s.hiddenNodes).toBe(s.totalNodes);
  });

  it("passes truncated through unchanged", () => {
    const sT = summarizeImpactAnalysisResult(buildResult([], [], true));
    const sF = summarizeImpactAnalysisResult(buildResult([], [], false));
    expect(sT.truncated).toBe(true);
    expect(sF.truncated).toBe(false);
  });

  it("does not mutate input", () => {
    const nodes: ImpactAnalysisNode[] = [
      { typeKey: "n", id: "0", depth: 0, visible: true },
    ];
    const edges: ImpactAnalysisEdge[] = [];
    const before = JSON.parse(JSON.stringify(nodes));
    summarizeImpactAnalysisResult(buildResult(nodes, edges));
    expect(nodes).toEqual(before);
  });
});
