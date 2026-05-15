/**
 * Phase 23 §1 — parallel-edges scanner (7th registered scanKind).
 *
 * Detects multiple edges of the same typeKey between the same
 * (source, target) node pair. Indicates duplicate insertion bug.
 *
 * T-D third slice.
 */

import { describe, it, expect } from "vitest";
import {
  scanForParallelEdges,
  parallelEdgesScanner,
  QUALITY_SCANNER_REGISTRY,
  proposalKindForFinding,
  FINDING_CLASS_TO_PROPOSAL_KIND,
} from "../../server/agent-studio/services/graph-quality/public-api";

describe("scanForParallelEdges — pure scanner", () => {
  it("flags two edges of same typeKey between same node pair", () => {
    const findings = scanForParallelEdges({
      nodes: [
        { typeKey: "Note", id: "n:1" },
        { typeKey: "Note", id: "n:2" },
      ],
      edges: [
        {
          typeKey: "LINKS_TO",
          id: "e:1",
          sourceNode: { typeKey: "Note", id: "n:1" },
          targetNode: { typeKey: "Note", id: "n:2" },
        },
        {
          typeKey: "LINKS_TO",
          id: "e:2",
          sourceNode: { typeKey: "Note", id: "n:1" },
          targetNode: { typeKey: "Note", id: "n:2" },
        },
      ],
      truncated: false,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      findingClass: "parallel_edges",
      severity: "medium",
      sourceTypeKey: "LINKS_TO",
    });
    expect(findings[0].details).toMatchObject({
      occurrenceCount: 2,
      sourceNodeId: "n:1",
      targetNodeId: "n:2",
      edgeTypeKey: "LINKS_TO",
    });
    expect(findings[0].details?.edgeIds).toEqual(["e:1", "e:2"]);
  });

  it("emits ONE finding per pair regardless of duplicate count", () => {
    const edges = Array.from({ length: 5 }, (_, i) => ({
      typeKey: "X",
      id: `e:${i}`,
      sourceNode: { typeKey: "N", id: "n:1" },
      targetNode: { typeKey: "N", id: "n:2" },
    }));
    const findings = scanForParallelEdges({
      nodes: [],
      edges,
      truncated: false,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].details?.occurrenceCount).toBe(5);
  });

  it("caps recorded edge ids at 10 to defend the details JSON column", () => {
    const edges = Array.from({ length: 100 }, (_, i) => ({
      typeKey: "X",
      id: `e:${i}`,
      sourceNode: { typeKey: "N", id: "n:1" },
      targetNode: { typeKey: "N", id: "n:2" },
    }));
    const findings = scanForParallelEdges({
      nodes: [],
      edges,
      truncated: false,
    });
    expect(findings[0].details?.occurrenceCount).toBe(100);
    expect(
      (findings[0].details?.edgeIds as readonly string[]).length,
    ).toBe(10);
  });

  it("does NOT flag edges of different typeKeys between same pair", () => {
    const findings = scanForParallelEdges({
      nodes: [],
      edges: [
        {
          typeKey: "LINKS_TO",
          sourceNode: { typeKey: "N", id: "n:1" },
          targetNode: { typeKey: "N", id: "n:2" },
        },
        {
          typeKey: "DERIVED_FROM",
          sourceNode: { typeKey: "N", id: "n:1" },
          targetNode: { typeKey: "N", id: "n:2" },
        },
      ],
      truncated: false,
    });
    expect(findings).toEqual([]);
  });

  it("does NOT flag opposing-direction edges (a→b and b→a) — different ordered pair", () => {
    const findings = scanForParallelEdges({
      nodes: [],
      edges: [
        {
          typeKey: "REFERENCES",
          sourceNode: { typeKey: "N", id: "n:1" },
          targetNode: { typeKey: "N", id: "n:2" },
        },
        {
          typeKey: "REFERENCES",
          sourceNode: { typeKey: "N", id: "n:2" },
          targetNode: { typeKey: "N", id: "n:1" },
        },
      ],
      truncated: false,
    });
    expect(findings).toEqual([]);
  });

  it("carries sampleTruncated into details", () => {
    const findings = scanForParallelEdges({
      nodes: [],
      edges: [
        {
          typeKey: "X",
          sourceNode: { typeKey: "N", id: "n:1" },
          targetNode: { typeKey: "N", id: "n:2" },
        },
        {
          typeKey: "X",
          sourceNode: { typeKey: "N", id: "n:1" },
          targetNode: { typeKey: "N", id: "n:2" },
        },
      ],
      truncated: true,
    });
    expect(findings[0].details).toMatchObject({ sampleTruncated: true });
  });

  it("handles empty sample without throwing", () => {
    const findings = scanForParallelEdges({
      nodes: [],
      edges: [],
      truncated: false,
    });
    expect(findings).toEqual([]);
  });
});

describe("parallelEdgesScanner registration", () => {
  it("registers under scanKind=parallel_edges", () => {
    expect(parallelEdgesScanner.scanKind).toBe("parallel_edges");
  });

  it("is present in QUALITY_SCANNER_REGISTRY alongside the prior 6 scanners", () => {
    const kinds = QUALITY_SCANNER_REGISTRY.map((r) => r.scanKind);
    expect(kinds).toContain("orphan_node");
    expect(kinds).toContain("duplicate_entity");
    expect(kinds).toContain("stale_node");
    expect(kinds).toContain("self_loop");
    expect(kinds).toContain("missing_provenance");
    expect(kinds).toContain("dangling_edge_endpoint");
    expect(kinds).toContain("parallel_edges");
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});

describe("parallel_edges → proposalKind mapping", () => {
  it("maps to deduplicate_parallel_edges", () => {
    expect(FINDING_CLASS_TO_PROPOSAL_KIND["parallel_edges"]).toBe(
      "deduplicate_parallel_edges",
    );
  });

  it("proposalKindForFinding returns the canonical kind", () => {
    expect(proposalKindForFinding("parallel_edges")).toBe(
      "deduplicate_parallel_edges",
    );
  });
});
