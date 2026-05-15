/**
 * Phase 24 §T-F.11 — summarizeLensSnapshot lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  summarizeLensSnapshot,
  type LensSnapshot,
  type LensSnapshotNode,
  type LensSnapshotEdge,
} from "../../server/agent-studio/services/graph-lens/public-api.js";

function build(
  nodes: LensSnapshotNode[],
  edges: LensSnapshotEdge[],
  truncated = false,
): LensSnapshot {
  return {
    lensId: "test",
    kind: "rag",
    layout: "force_directed",
    producedAt: new Date(0),
    nodes,
    edges,
    truncated,
    hiddenNodeCount: nodes.filter((n) => !n.visible).length,
  };
}

describe("summarizeLensSnapshot (T-F.11)", () => {
  it("empty snapshot → all zeros + empty histograms", () => {
    const s = summarizeLensSnapshot(build([], []));
    expect(s.totalNodes).toBe(0);
    expect(s.visibleNodes).toBe(0);
    expect(s.hiddenNodes).toBe(0);
    expect(s.totalEdges).toBe(0);
    expect(s.visibleEdges).toBe(0);
    expect(s.hiddenEdges).toBe(0);
    expect(Object.keys(s.nodesByTypeKey).length).toBe(0);
    expect(Object.keys(s.edgesByTypeKey).length).toBe(0);
    expect(s.truncated).toBe(false);
  });

  it("counts visible vs hidden nodes + edges", () => {
    const s = summarizeLensSnapshot(
      build(
        [
          { typeKey: "note", id: "a", visible: true, label: "x" },
          { typeKey: "note", id: "b", visible: false },
          { typeKey: "tag", id: "c", visible: true, label: "y" },
        ],
        [
          { typeKey: "tagged", sourceNodeId: "a", targetNodeId: "c", visible: true },
          { typeKey: "tagged", sourceNodeId: "b", targetNodeId: "c", visible: false },
        ],
      ),
    );
    expect(s.totalNodes).toBe(3);
    expect(s.visibleNodes).toBe(2);
    expect(s.hiddenNodes).toBe(1);
    expect(s.totalEdges).toBe(2);
    expect(s.visibleEdges).toBe(1);
    expect(s.hiddenEdges).toBe(1);
  });

  it("builds node + edge type-key histograms (sparse keys)", () => {
    const s = summarizeLensSnapshot(
      build(
        [
          { typeKey: "note", id: "a", visible: true },
          { typeKey: "note", id: "b", visible: true },
          { typeKey: "tag", id: "c", visible: true },
        ],
        [
          { typeKey: "tagged", sourceNodeId: "a", targetNodeId: "c", visible: true },
          { typeKey: "references", sourceNodeId: "a", targetNodeId: "b", visible: true },
        ],
      ),
    );
    expect(s.nodesByTypeKey.note).toBe(2);
    expect(s.nodesByTypeKey.tag).toBe(1);
    expect(s.edgesByTypeKey.tagged).toBe(1);
    expect(s.edgesByTypeKey.references).toBe(1);
  });

  it("Σ nodesByTypeKey == totalNodes", () => {
    const s = summarizeLensSnapshot(
      build(
        [
          { typeKey: "a", id: "1", visible: true },
          { typeKey: "a", id: "2", visible: false },
          { typeKey: "b", id: "3", visible: true },
        ],
        [],
      ),
    );
    const sum = Object.values(s.nodesByTypeKey).reduce((a, b) => a + b, 0);
    expect(sum).toBe(s.totalNodes);
  });

  it("Σ edgesByTypeKey == totalEdges", () => {
    const s = summarizeLensSnapshot(
      build(
        [],
        [
          { typeKey: "x", sourceNodeId: "1", targetNodeId: "2", visible: true },
          { typeKey: "x", sourceNodeId: "1", targetNodeId: "3", visible: true },
          { typeKey: "y", sourceNodeId: "2", targetNodeId: "3", visible: false },
        ],
      ),
    );
    const sum = Object.values(s.edgesByTypeKey).reduce((a, b) => a + b, 0);
    expect(sum).toBe(s.totalEdges);
  });

  it("passes truncated through unchanged", () => {
    const sT = summarizeLensSnapshot(build([], [], true));
    const sF = summarizeLensSnapshot(build([], [], false));
    expect(sT.truncated).toBe(true);
    expect(sF.truncated).toBe(false);
  });

  it("does not mutate inputs", () => {
    const nodes: LensSnapshotNode[] = [
      { typeKey: "a", id: "1", visible: true },
    ];
    const edges: LensSnapshotEdge[] = [];
    const before = JSON.parse(JSON.stringify(nodes));
    summarizeLensSnapshot(build(nodes, edges));
    expect(nodes).toEqual(before);
  });
});
