/**
 * Phase 25 §T-G.16 — summarizeCodeGraph lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  CODE_GRAPH_NODE_TYPES,
  CODE_GRAPH_EDGE_TYPES,
  summarizeCodeGraph,
} from "../../server/agent-studio/services/code-graph/contracts/public-api.js";

interface Node {
  readonly id: string;
  readonly typeKey: string;
}
interface Edge {
  readonly id: string;
  readonly typeKey: string;
}
const getN = (n: Node) => n.typeKey;
const getE = (e: Edge) => e.typeKey;

describe("summarizeCodeGraph (T-G.16)", () => {
  it("empty input → totals 0 + all taxonomy keys at 0 + unknowns 0", () => {
    const s = summarizeCodeGraph<Node, Edge>([], [], getN, getE);
    expect(s.totalNodes).toBe(0);
    expect(s.totalEdges).toBe(0);
    expect(s.unknownNodeTypeCount).toBe(0);
    expect(s.unknownEdgeTypeCount).toBe(0);
    for (const t of CODE_GRAPH_NODE_TYPES) expect(s.nodesByType[t]).toBe(0);
    for (const t of CODE_GRAPH_EDGE_TYPES) expect(s.edgesByType[t]).toBe(0);
  });

  it("counts known nodes + edges", () => {
    const s = summarizeCodeGraph(
      [
        { id: "f1", typeKey: "file" },
        { id: "f2", typeKey: "file" },
        { id: "c1", typeKey: "class" },
      ],
      [
        { id: "e1", typeKey: "imports" },
        { id: "e2", typeKey: "imports" },
        { id: "e3", typeKey: "calls" },
      ],
      getN,
      getE,
    );
    expect(s.totalNodes).toBe(3);
    expect(s.totalEdges).toBe(3);
    expect(s.nodesByType.file).toBe(2);
    expect(s.nodesByType.class).toBe(1);
    expect(s.edgesByType.imports).toBe(2);
    expect(s.edgesByType.calls).toBe(1);
  });

  it("counts unknown taxonomy values separately, doesn't throw", () => {
    const s = summarizeCodeGraph(
      [
        { id: "f1", typeKey: "file" },
        { id: "x1", typeKey: "totally_made_up" },
      ],
      [
        { id: "e1", typeKey: "imports" },
        { id: "ex", typeKey: "not_real_edge" },
        { id: "ey", typeKey: "also_fake" },
      ],
      getN,
      getE,
    );
    expect(s.totalNodes).toBe(2);
    expect(s.totalEdges).toBe(3);
    expect(s.nodesByType.file).toBe(1);
    expect(s.unknownNodeTypeCount).toBe(1);
    expect(s.edgesByType.imports).toBe(1);
    expect(s.unknownEdgeTypeCount).toBe(2);
  });

  it("Σ nodesByType + unknownNodes == totalNodes", () => {
    const s = summarizeCodeGraph(
      [
        { id: "f", typeKey: "file" },
        { id: "x", typeKey: "weird" },
        { id: "c", typeKey: "class" },
      ],
      [],
      getN,
      getE,
    );
    const sum =
      Object.values(s.nodesByType).reduce((a, b) => a + b, 0) +
      s.unknownNodeTypeCount;
    expect(sum).toBe(s.totalNodes);
  });

  it("Σ edgesByType + unknownEdges == totalEdges", () => {
    const s = summarizeCodeGraph(
      [],
      [
        { id: "e", typeKey: "imports" },
        { id: "y", typeKey: "unknown_edge" },
      ],
      getN,
      getE,
    );
    const sum =
      Object.values(s.edgesByType).reduce((a, b) => a + b, 0) +
      s.unknownEdgeTypeCount;
    expect(sum).toBe(s.totalEdges);
  });

  it("stable-shape: every closed-taxonomy key keyed even when zero", () => {
    const s = summarizeCodeGraph<Node, Edge>([], [], getN, getE);
    expect(Object.keys(s.nodesByType).length).toBe(CODE_GRAPH_NODE_TYPES.length);
    expect(Object.keys(s.edgesByType).length).toBe(CODE_GRAPH_EDGE_TYPES.length);
  });

  it("does not mutate inputs", () => {
    const n: Node[] = [{ id: "f", typeKey: "file" }];
    const e: Edge[] = [{ id: "i", typeKey: "imports" }];
    const nBefore = [...n];
    const eBefore = [...e];
    summarizeCodeGraph(n, e, getN, getE);
    expect(n).toEqual(nBefore);
    expect(e).toEqual(eBefore);
  });
});
